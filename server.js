const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const engine = require('./tradingEngine');
const { INSTRUMENTS } = require('./models');
const ScalperEngine = require('./engine');
const MexcClient = require('./exchanges/mexcClient');
const MockExchange = require('./exchanges/mockExchange');
const RiskManager = require('./risk/riskManager');
const ExecutionFilter = require('./execution/executionFilter');
const OrderRouter = require('./execution/orderRouter');
const MarketScanner = require('./scanner/marketScanner');
const Backtester = require('./backtest/backtester');
const db = require('./database/db');
const security = require('./security/auth');

// Institutional Components Setup
const scalperEngine = new ScalperEngine();
const mexcClient = new MexcClient();
const mockExchange = new MockExchange();
const riskManager = new RiskManager(db.getSettings());
// CAPITAL PROTECTION: Auto-trading MUST ALWAYS initialize to false on boot
riskManager.autoTradingEnabled = false;
// [RF-6 FIX] Restore emergency stop and circuit breaker state from previous session
riskManager.loadState(db);


const executionFilter = new ExecutionFilter(riskManager);
const orderRouter = new OrderRouter({
  mode: db.getSettings().autoTradeMode || 'MEXC_REAL',
  paperBroker: engine,
  mexcClient,
  mockExchange,
  executionFilter,
  riskManager
});
const marketScanner = new MarketScanner({ engine: scalperEngine });
const backtester = new Backtester(scalperEngine);

const PORT = parseInt(process.env.PORT || 3000, 10);
const PUBLIC_DIR = path.join(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// SSE Client Connections Set
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Hook engine events to SSE broadcast
engine.on((event, data) => {
  broadcastSSE(event, data);
});

// Periodic background intraday market scanner (every 20s)
setInterval(() => {
  marketScanner.scanAll().then(setups => {
    broadcastSSE('scanner_update', setups);
  }).catch(() => {});
}, 20000);
setTimeout(() => { marketScanner.scanAll().catch(() => {}); }, 3000);

// =============================================================================
// BACKEND REAL-TIME MARKET DATA POLLER / INGESTOR
// Keeps backend trading engine prices updated for major crypto futures pairs
// =============================================================================
async function pollMarketPrices() {
  try {
    // Fetch Major Futures (BTC, ETH, SOL, BNB, XRP, DOGE)
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'];
    for (const sym of symbols) {
      try {
        const futRes = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`);
        if (futRes.ok) {
          const f = await futRes.json();
          const last = parseFloat(f.lastPrice);
          const spread = last * 0.00004;
          engine.updatePrice(sym, {
            price: last,
            bid: last - spread / 2,
            ask: last + spread / 2,
            mark: parseFloat(f.lastPrice),
            high24h: parseFloat(f.highPrice),
            low24h: parseFloat(f.lowPrice),
            volume24h: parseFloat(f.volume),
            change24h: parseFloat(f.priceChangePercent),
            time: Date.now()
          });
          broadcastSSE('market_price_update', engine.prices[sym]);
        }
      } catch (err) {}
    }
  } catch (err) {
    // Silent catch on network hiccups
  }
}

// Poll market prices every 1.0 second in background
setInterval(pollMarketPrices, 1000);
pollMarketPrices();

// =============================================================================
// HTTP REQUEST DISPATCHER (REST API + STATIC FILES)
// =============================================================================
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const [reqPath, queryString] = req.url.split('?');

  // Dynamic MEXC credential header override if sent by client
  const clientApiKey = req.headers['x-mexc-api-key'];
  const clientApiSecret = req.headers['x-mexc-api-secret'];
  if (clientApiKey && clientApiSecret && !mexcClient.isConfigured()) {
    mexcClient.updateCredentials(clientApiKey, clientApiSecret);
  }


  // ---------------------------------------------------------------------------
  // SSE Real-Time Stream Endpoint
  // ---------------------------------------------------------------------------
  if (reqPath === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    sseClients.add(res);

    // Send initial snapshot immediately (dynamically checks MEXC if connected)
    let accountData = engine.state.account;
    let positionsData = engine.state.positions;
    if (mexcClient.isConfigured()) {
      try {
        const mexcAssets = await mexcClient.getAccountAssets();
        accountData = {
          id: 'mexc-live-account',
          currency: mexcAssets.currency || 'USDT',
          balance: parseFloat((mexcAssets.equity - mexcAssets.unrealizedPnl).toFixed(2)),
          equity: parseFloat(mexcAssets.equity.toFixed(2)),
          availableBalance: parseFloat(mexcAssets.availableBalance.toFixed(2)),
          usedMargin: parseFloat(mexcAssets.positionMargin.toFixed(2)),
          unrealizedPnL: parseFloat(mexcAssets.unrealizedPnl.toFixed(2)),
          marginRatio: mexcAssets.equity > 0 ? parseFloat(((mexcAssets.positionMargin / mexcAssets.equity) * 100).toFixed(1)) : 0
        };
        positionsData = await mexcClient.getOpenPositions().catch(() => engine.state.positions);
      } catch (e) {
        console.warn('[SSE] Snapshot MEXC fetch warning:', e.message);
      }
    }

    const snapshot = {
      account: accountData,
      positions: positionsData,
      orders: engine.state.orders,
      trades: engine.state.trades.slice(0, 50),
      prices: engine.prices,
      instruments: INSTRUMENTS
    };
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);


    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Health Endpoint for Railway healthchecks and observability (Phase 8 & 9)
  if ((reqPath === '/health' || reqPath === '/api/health') && req.method === 'GET') {
    const isMexcConnected = typeof mexcClient !== 'undefined' && mexcClient.isConfigured();
    const hasPriceData = typeof engine !== 'undefined' && engine.prices && Object.keys(engine.prices).length > 0;
    return sendJSON(res, 200, {
      status: 'ok',
      health: 'GREEN',
      marketData: hasPriceData ? 'CONNECTED' : 'WAITING',
      mexcConnected: isMexcConnected ? 'AUTHENTICATED' : 'NOT_CONFIGURED',
      engineMode: typeof orderRouter !== 'undefined' ? orderRouter.mode : 'PAPER',
      autoTradingEnabled: typeof riskManager !== 'undefined' ? riskManager.autoTradingEnabled : false,
      timestamp: new Date().toISOString()
    });
  }

  // ---------------------------------------------------------------------------
  // REST API ENDPOINTS
  // ---------------------------------------------------------------------------
  if (reqPath.startsWith('/api/')) {
    try {
      if (reqPath === '/api/instruments' && req.method === 'GET') {
        return sendJSON(res, 200, { success: true, instruments: INSTRUMENTS });
      }


      if (reqPath === '/api/account' && req.method === 'GET') {
        if (mexcClient.isConfigured()) {
          try {
            const mexcAssets = await mexcClient.getAccountAssets();
            return sendJSON(res, 200, {
              success: true,
              mode: 'MEXC_REAL',
              account: {
                id: 'mexc-live-account',
                startingBalance: mexcAssets.equity,
                balance: parseFloat((mexcAssets.equity - mexcAssets.unrealizedPnl).toFixed(2)),
                equity: parseFloat(mexcAssets.equity.toFixed(2)),
                availableBalance: parseFloat(mexcAssets.availableBalance.toFixed(2)),
                usedMargin: parseFloat(mexcAssets.positionMargin.toFixed(2)),
                unrealizedPnL: parseFloat(mexcAssets.unrealizedPnl.toFixed(2)),
                realizedPnL: 0,
                totalFees: 0,
                marginRatio: mexcAssets.equity > 0 ? parseFloat(((mexcAssets.positionMargin / mexcAssets.equity) * 100).toFixed(1)) : 0,
                currency: mexcAssets.currency || 'USDT',
                updatedAt: Date.now()
              }
            });
          } catch (e) {
            console.warn('[Account API] MEXC fetch failed, falling back to paper:', e.message);
          }
        }
        engine.recalculateAccount();
        return sendJSON(res, 200, { success: true, mode: 'PAPER', account: engine.state.account });
      }

      if (reqPath === '/api/positions' && req.method === 'GET') {
        if (mexcClient.isConfigured()) {
          try {
            const mexcPositions = await mexcClient.getOpenPositions();
            return sendJSON(res, 200, { success: true, mode: 'MEXC_REAL', positions: mexcPositions });
          } catch (e) {
            console.warn('[Positions API] MEXC fetch failed, falling back to paper:', e.message);
          }
        }
        return sendJSON(res, 200, { success: true, mode: 'PAPER', positions: engine.state.positions });
      }


      if (reqPath === '/api/orders' && req.method === 'GET') {
        return sendJSON(res, 200, { success: true, orders: engine.state.orders });
      }

      if (reqPath === '/api/trades' && req.method === 'GET') {
        return sendJSON(res, 200, { success: true, trades: engine.state.trades });
      }

      if (reqPath === '/api/market' && req.method === 'GET') {
        return sendJSON(res, 200, { success: true, prices: engine.prices });
      }

      // POST /api/orders: Place Market or Limit Order
      if (reqPath === '/api/orders' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const result = engine.placeOrder(body);
        return sendJSON(res, 200, { success: true, ...result });
      }

      // POST /api/orders/cancel: Cancel pending limit order
      if (reqPath === '/api/orders/cancel' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        if (!body.orderId) {
          return sendJSON(res, 400, { success: false, error: 'orderId is required' });
        }
        const result = engine.cancelOrder(body.orderId);
        return sendJSON(res, 200, result);
      }

      // POST /api/positions/close: Full or Partial Position Close
      if (reqPath === '/api/positions/close' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        if (!body.positionId) {
          return sendJSON(res, 400, { success: false, error: 'positionId is required' });
        }
        const trade = engine.closePosition(body.positionId, body.quantity || null, body.reason || 'MANUAL');
        return sendJSON(res, 200, { success: true, trade });
      }

      // POST /api/positions/modify: Modify SL and TP
      if (reqPath === '/api/positions/modify' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        if (!body.positionId) {
          return sendJSON(res, 400, { success: false, error: 'positionId is required' });
        }
        const pos = engine.modifyPosition(body.positionId, {
          stopLoss: body.stopLoss !== undefined ? body.stopLoss : null,
          takeProfit: body.takeProfit !== undefined ? body.takeProfit : null
        });
        return sendJSON(res, 200, { success: true, position: pos });
      }

      // POST /api/demo/reset: Reset demo balance and clear positions/orders
      if (reqPath === '/api/demo/reset' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const balance = body.startingBalance || 10000;
        const clearHistory = body.clearHistory || false;
        const state = engine.resetDemoAccount(balance, clearHistory);
        return sendJSON(res, 200, { success: true, account: state.account, positions: state.positions, orders: state.orders, trades: state.trades });
      }

      // =========================================================================
      // INSTITUTIONAL UPGRADE ENDPOINTS: MEXC, RISK, AUTOTRADE, SCANNER, BACKTEST
      // =========================================================================

      // POST /api/mexc/save-credentials: Test and save MEXC API credentials
      if (reqPath === '/api/mexc/save-credentials' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const apiKey = (body.apiKey || '').trim();
        const apiSecret = (body.apiSecret || '').trim();

        if (!apiKey || !apiSecret) {
          return sendJSON(res, 400, {
            success: false,
            error: 'Both MEXC API Key and API Secret are required.'
          });
        }

        mexcClient.updateCredentials(apiKey, apiSecret);
        let assets = null;
        let testError = null;

        try {
          assets = await mexcClient.getAccountAssets();
        } catch (err) {
          testError = err.message;
        }

        if (assets && !assets.error) {
          try {
            const envPath = path.join(__dirname, '.env');
            let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
            if (envContent.includes('MEXC_API_KEY=')) {
              envContent = envContent.replace(/MEXC_API_KEY=.*/g, `MEXC_API_KEY=${apiKey}`);
            } else {
              envContent += `\nMEXC_API_KEY=${apiKey}`;
            }
            if (envContent.includes('MEXC_API_SECRET=')) {
              envContent = envContent.replace(/MEXC_API_SECRET=.*/g, `MEXC_API_SECRET=${apiSecret}`);
            } else {
              envContent += `\nMEXC_API_SECRET=${apiSecret}`;
            }
            fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
            process.env.MEXC_API_KEY = apiKey;
            process.env.MEXC_API_SECRET = apiSecret;
          } catch (e) {
            console.warn('Failed to update .env:', e.message);
          }

          return sendJSON(res, 200, {
            success: true,
            isConfigured: true,
            mode: 'LIVE_MEXC',
            apiKeyMasked: security.sanitizeCredentials(apiKey),
            assets,
            message: 'MEXC API credentials verified and connected successfully!'
          });
        } else {
          return sendJSON(res, 400, {
            success: false,
            isConfigured: false,
            error: testError || 'Failed to authenticate with MEXC Contract API. Please check your API Key & Secret permissions.'
          });
        }
      }

      // GET /api/mexc/status: Check MEXC connectivity and masked credentials
      if (reqPath === '/api/mexc/status' && req.method === 'GET') {
        const isLive = mexcClient.isConfigured();
        let pingInfo = { success: true, latency: 15 };
        if (isLive) {
          pingInfo = await mexcClient.ping().catch(e => ({ success: false, error: e.message }));
        }
        return sendJSON(res, 200, {
          success: true,
          isConfigured: isLive,
          mode: isLive ? 'LIVE_MEXC' : 'MOCK_SANDBOX',
          apiKeyMasked: security.sanitizeCredentials(mexcClient.apiKey),
          ping: pingInfo
        });
      }

      // GET /api/mexc/account: Real or Mock MEXC Balance & Equity
      if (reqPath === '/api/mexc/account' && req.method === 'GET') {
        const broker = mexcClient.isConfigured() ? mexcClient : mockExchange;
        const assets = await broker.getAccountAssets().catch(err => ({
          currency: 'USDT', equity: 10000, availableBalance: 10000, unrealizedPnl: 0, error: err.message
        }));
        return sendJSON(res, 200, {
          success: true,
          assets,
          mode: mexcClient.isConfigured() ? 'LIVE_MEXC' : 'MOCK_SANDBOX'
        });
      }

      // GET /api/mexc/positions: Open MEXC Positions
      if (reqPath === '/api/mexc/positions' && req.method === 'GET') {
        const broker = mexcClient.isConfigured() ? mexcClient : mockExchange;
        const positions = await broker.getOpenPositions().catch(() => []);
        return sendJSON(res, 200, { success: true, positions });
      }

      // POST /api/mexc/order: Submit Order with 15-Point Pre-Flight Filter
      if (reqPath === '/api/mexc/order' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const sym = body.symbol || 'BTCUSDT';
        const price = body.price || engine.prices[sym]?.price || 50000;

        // [BUG FIX B1 / RF-1] Require a real signal object — NEVER inject a fake score.
        // The old fallback `signal: { score100: 90, htfBullish: true }` allowed any POST
        // to bypass the execution filter's score check with a phantom A+ score.
        if (!body.signal || typeof body.signal.score100 !== 'number') {
          return sendJSON(res, 400, {
            success: false,
            error: 'A valid signal object with score100 is required. Manual orders without a signal are rejected to prevent filter bypass.'
          });
        }

        const result = await orderRouter.routeOrder({
          signal: body.signal,
          symbol: sym,
          side: body.side,
          currentPrice: price,
          bid: engine.prices[sym]?.bid || price,
          ask: engine.prices[sym]?.ask || price,
          lastTickTime: engine.prices[sym]?.time || Date.now(),
          openPositions: await (mexcClient.isConfigured() ? mexcClient.getOpenPositions() : mockExchange.getOpenPositions()).catch(() => []),
          account: await (mexcClient.isConfigured() ? mexcClient.getAccountAssets() : mockExchange.getAccountAssets()).catch(() => ({ equity: 10000 })),
          leverage: body.leverage || 10,
          isAutoTrade: false
        });
        return sendJSON(res, 200, result);
      }


      // POST /api/mexc/close: Close Specific MEXC Position
      if (reqPath === '/api/mexc/close' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const broker = mexcClient.isConfigured() ? mexcClient : mockExchange;
        const results = await broker.closePositions(body.symbol || null);
        return sendJSON(res, 200, { success: true, results });
      }

      // GET /api/autotrade/status: Auto-Trading State & Circuit Breaker Status
      if (reqPath === '/api/autotrade/status' && req.method === 'GET') {
        const status = riskManager.getStatus(engine.state.account.equity);
        status.mode = orderRouter.mode;
        return sendJSON(res, 200, { success: true, status });
      }

      // POST /api/autotrade/toggle: Two-Step Auto-Trading Activation
      if (reqPath === '/api/autotrade/toggle' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        if (body.enabled) {
          const authValid = security.verifyAuth(body.password || body.token);
          if (!authValid) {
            return sendJSON(res, 401, {
              success: false,
              error: 'Authentication failed: Invalid admin password or token.'
            });
          }
          riskManager.setAutoTrading(true, true);
        } else {
          riskManager.setAutoTrading(false);
        }
        if (body.mode) {
          orderRouter.setMode(body.mode);
        }
        riskManager.persistState(db); // [RF-6 FIX] Persist after toggle
        broadcastSSE('autotrade_status', riskManager.getStatus());
        return sendJSON(res, 200, { success: true, status: riskManager.getStatus(), mode: orderRouter.mode });
      }

      // POST /api/autotrade/set-score: Update auto-trade minimum score threshold at runtime
      // [BUG FIX B7] Previously the threshold was seeded from db.getSettings() at startup only.
      // Changes via UI never reached the server — old threshold stuck until restart.
      if (reqPath === '/api/autotrade/set-score' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const score = parseInt(body.score, 10);
        if (isNaN(score) || score < 50 || score > 99) {
          return sendJSON(res, 400, { success: false, error: 'Score must be between 50 and 99.' });
        }
        riskManager.options.defaultAutoTradeMinScore = score;
        // Persist to settings so it survives restart
        const settings = db.getSettings();
        settings.autoTradeMinScore = score;
        db.saveSettings(settings);
        return sendJSON(res, 200, { success: true, autoTradeMinScore: score });
      }



      // POST /api/risk/emergency-stop: Immediate Kill-Switch
      if (reqPath === '/api/risk/emergency-stop' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const result = riskManager.triggerEmergencyStop(body.reason || 'User Emergency Stop');
        riskManager.persistState(db); // [RF-6 FIX] Persist so state survives restarts
        broadcastSSE('emergency_stop_triggered', result);
        return sendJSON(res, 200, result);
      }

      // POST /api/risk/reset-emergency: Reset Kill-Switch
      if (reqPath === '/api/risk/reset-emergency' && req.method === 'POST') {
        const result = riskManager.resetEmergencyStop();
        riskManager.persistState(db); // [RF-6 FIX] Persist the reset too
        broadcastSSE('emergency_stop_reset', result);
        return sendJSON(res, 200, result);
      }


      // POST /api/risk/close-all: Close ALL Positions Everywhere
      if (reqPath === '/api/risk/close-all' && req.method === 'POST') {
        const paperClosed = [];
        const openPos = [...engine.state.positions];
        for (const pos of openPos) {
          const tr = engine.closePosition(pos.id, null, 'EMERGENCY_CLOSE_ALL');
          paperClosed.push(tr);
        }
        const broker = mexcClient.isConfigured() ? mexcClient : mockExchange;
        const exchangeClosed = await broker.closePositions().catch(() => []);
        return sendJSON(res, 200, { success: true, paperClosed, exchangeClosed });
      }

      // GET /api/scanner/setups: Active Intraday Multi-Pair Setups
      if (reqPath === '/api/scanner/setups' && req.method === 'GET') {
        return sendJSON(res, 200, {
          success: true,
          setups: marketScanner.getSetups(),
          lastScan: marketScanner.lastScanTime
        });
      }

      // GET /api/signals/audit: Historical Signal & Execution Audit Trail
      if (reqPath === '/api/signals/audit' && req.method === 'GET') {
        return sendJSON(res, 200, {
          success: true,
          audit: orderRouter.getAuditLogs()
        });
      }

      // GET /api/analytics/performance: Separated Paper vs Real Performance Analytics
      if (reqPath === '/api/analytics/performance' && req.method === 'GET') {
        const isReal = queryString && queryString.includes('mode=real');
        const mode = isReal ? 'real' : 'paper';
        const trades = isReal ? db.getRealTrades() : engine.state.trades;
        const wins = trades.filter(t => (t.pnl || t.realizedPnl || 0) > 0);
        const losses = trades.filter(t => (t.pnl || t.realizedPnl || 0) <= 0);
        const totalWinPnl = wins.reduce((sum, t) => sum + (t.pnl || t.realizedPnl || 0), 0);
        const totalLossPnl = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || t.realizedPnl || 0), 0));
        const profitFactor = totalLossPnl > 0 ? (totalWinPnl / totalLossPnl) : (totalWinPnl > 0 ? 99.9 : 0);
        const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const netPnl = trades.reduce((sum, t) => sum + (t.pnl || t.realizedPnl || 0), 0);

        return sendJSON(res, 200, {
          success: true,
          mode,
          totalTrades: trades.length,
          winTrades: wins.length,
          lossTrades: losses.length,
          winRate: parseFloat(winRate.toFixed(1)),
          profitFactor: parseFloat(profitFactor.toFixed(2)),
          netPnl: parseFloat(netPnl.toFixed(2)),
          averageWin: wins.length > 0 ? parseFloat((totalWinPnl / wins.length).toFixed(2)) : 0,
          averageLoss: losses.length > 0 ? parseFloat((totalLossPnl / losses.length).toFixed(2)) : 0,
          bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.pnl || t.realizedPnl || 0)) : 0,
          worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.pnl || t.realizedPnl || 0)) : 0
        });
      }

      // POST /api/backtest/run: Run Historical Strategy Backtest
      if (reqPath === '/api/backtest/run' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const symbol = body.symbol || 'BTCUSDT';
        const interval = body.interval || '5m';
        const limit = Math.min(1000, body.limit || 300);

        let candles = [];
        try {
          const klineRes = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
          const rawKlines = await klineRes.json();
          candles = rawKlines.map(k => ({
            time: Math.floor(k[0] / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
          }));
        } catch (e) {
          // Synthetic fallback if offline
          let p = 50000;
          for (let i = 0; i < limit; i++) {
            p += (Math.sin(i / 12) * 50) + (Math.random() - 0.48) * 40;
            candles.push({ time: Math.floor(Date.now() / 1000) - (limit - i) * 300, open: p - 10, high: p + 25, low: p - 20, close: p + 5, volume: 100 + i });
          }
        }

        const btResult = backtester.run(candles, {
          minScoreThreshold: body.minScoreThreshold || 80,
          riskPerTradePct: body.riskPerTradePct || 1.5,
          startingCapital: body.startingCapital || 10000,
          leverage: body.leverage || 10
        });

        return sendJSON(res, 200, { success: true, symbol, interval, ...btResult });
      }

      // POST /api/alerts/telegram: Server-side proxy for Telegram sendMessage
      if (reqPath === '/api/alerts/telegram' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const token = (body.botToken || '').trim();
        const chatId = (body.chatId || '').trim();
        const text = body.text || '';
        if (!token || !chatId) {
          return sendJSON(res, 400, { success: false, error: 'botToken and chatId are required.' });
        }
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            message_thread_id: body.topicId ? parseInt(body.topicId, 10) : undefined
          })
        });
        const tgData = await tgRes.json().catch(() => ({ ok: false }));
        if (!tgRes.ok || !tgData.ok) {
          let desc = tgData.description || 'Telegram API request failed';
          if (desc.includes('chat not found')) {
            desc = 'Telegram Chat Not Found! 1) Open your bot in Telegram and send /start. 2) Enter your numeric User ID from @userinfobot (e.g. 123456789).';
          }
          return sendJSON(res, 400, { success: false, error: desc });
        }
        return sendJSON(res, 200, { success: true, messageId: tgData.result?.message_id });
      }

      // POST /api/alerts/discord: Server-side proxy for Discord Webhooks
      if (reqPath === '/api/alerts/discord' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const webhookUrl = (body.webhookUrl || '').trim();
        const payload = body.payload || {};
        if (!webhookUrl || (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && !webhookUrl.startsWith('https://discordapp.com/api/webhooks/'))) {
          return sendJSON(res, 400, { success: false, error: 'Valid Discord webhook URL starting with https://discord.com/api/webhooks/... is required.' });
        }
        const dcRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!dcRes.ok) {
          const t = await dcRes.text().catch(() => '');
          return sendJSON(res, 400, { success: false, error: `Discord responded with HTTP ${dcRes.status}: ${t}` });
        }
        return sendJSON(res, 200, { success: true });
      }

      // POST /api/alerts/ntfy: Server-side proxy for ntfy.sh Phone Push
      if (reqPath === '/api/alerts/ntfy' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const topic = (body.topic || '').trim().replace(/^https?:\/\/ntfy\.sh\//, '');
        if (!topic) {
          return sendJSON(res, 400, { success: false, error: 'ntfy.sh topic is required.' });
        }
        const ntfyRes = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
          method: 'POST',
          headers: {
            'Title': body.title || 'Crypto Scalper Pro',
            'Priority': body.priority || 'urgent',
            'Tags': body.tags || 'bell'
          },
          body: body.body || ''
        });
        if (!ntfyRes.ok) {
          return sendJSON(res, 400, { success: false, error: `ntfy.sh responded with HTTP ${ntfyRes.status}` });
        }
        return sendJSON(res, 200, { success: true });
      }

      // GET /api/system/info: Returns dynamic host IP and URLs for mobile connection
      if (reqPath === '/api/system/info' && req.method === 'GET') {
        const ip = getLocalIp();
        return sendJSON(res, 200, {
          success: true,
          localIp: ip,
          port: PORT,
          localUrl: `http://localhost:${PORT}/index.html`,
          mobileUrl: `http://${ip}:${PORT}/index.html`
        });
      }

      return sendJSON(res, 404, { success: false, error: 'API route not found' });
    } catch (err) {
      return sendJSON(res, 400, { success: false, error: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // STATIC FILES SERVING
  // ---------------------------------------------------------------------------
  let cleanPath = reqPath;
  if (cleanPath === '/' || cleanPath === '') cleanPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, cleanPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found: ' + cleanPath);
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server Error: ' + err.message);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  const localUrl = `http://localhost:${PORT}/index.html`;
  const mobileUrl = `http://${localIp}:${PORT}/index.html`;
  const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);

  console.log(`\n====================================================`);
  console.log(`  CRYPTO SCALPER PRO — MEXC LIVE TERMINAL v7      `);
  console.log(`====================================================`);
  if (isRailway) {
    // [RF-5 FIX] On Railway, the filesystem is ephemeral — .env writes are lost on redeploy.
    // Credentials MUST be set as Railway environment variables, not via the UI file-write path.
    const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/index.html`
      : '(check Railway dashboard for public URL)';
    console.log(`  Environment:        Railway Cloud`);
    console.log(`  Terminal URL:       ${railwayUrl}`);
    if (!process.env.MEXC_API_KEY) {
      console.warn(`  ⚠️  MEXC_API_KEY not set! Set it in Railway → Variables, NOT via UI (ephemeral filesystem).`);
    } else {
      console.log(`  MEXC API:           Configured (${process.env.MEXC_API_KEY.slice(0,4)}...${process.env.MEXC_API_KEY.slice(-4)})`);
    }
  } else {
    console.log(`  Local PC URL:       ${localUrl}`);
    console.log(`  Mobile / Wi-Fi URL: ${mobileUrl}`);
  }
  console.log(`  Pairs:              BTC, ETH, SOL, BNB, XRP, DOGE`);
  console.log(`  Execution Mode:     ${process.env.MEXC_API_KEY ? 'MEXC LIVE FUTURES' : 'PAPER (configure MEXC_API_KEY to go live)'}`);
  console.log(`  Auto-Trading:       OFF (must be enabled per session)`);
  console.log(`====================================================\n`);
});

