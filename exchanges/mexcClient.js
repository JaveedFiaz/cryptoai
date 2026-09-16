/**
 * MEXC CONTRACT (FUTURES) API CLIENT
 * Official implementation for MEXC Contract API v1 (https://contract.mexc.com)
 * - HMAC-SHA256 authenticated request signer
 * - Private endpoints: Assets/Equity, Open Positions, Order Submit, Order Cancel
 * - Symbol normalization (e.g. BTCUSDT -> BTC_USDT)
 * - Rate-limit and error handling
 * - Zero client secret exposure (Runs strictly server-side)
 */

const crypto = require('crypto');

class MexcClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.MEXC_API_KEY || '';
    this.apiSecret = options.apiSecret || process.env.MEXC_API_SECRET || '';
    this.baseUrl = options.baseUrl || process.env.MEXC_BASE_URL || 'https://contract.mexc.com';
    this.timeout = options.timeout || 8000;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiSecret && this.apiKey.trim() !== '' && this.apiSecret.trim() !== '');
  }

  updateCredentials(apiKey, apiSecret) {
    this.apiKey = (apiKey || '').trim();
    this.apiSecret = (apiSecret || '').trim();
    return this.isConfigured();
  }

  /**
   * Normalize standard symbol (e.g. BTCUSDT) to MEXC Contract symbol (BTC_USDT)
   */
  static normalizeSymbol(symbol) {
    if (!symbol) return 'BTC_USDT';
    const s = symbol.toUpperCase().replace('-', '_').replace('/', '_');
    if (s.includes('_')) return s;
    if (s.endsWith('USDT')) {
      return s.slice(0, -4) + '_USDT';
    }
    return s + '_USDT';
  }

  /**
   * Reverse normalization: MEXC (BTC_USDT) -> Standard (BTCUSDT)
   */
  static denormalizeSymbol(symbol) {
    if (!symbol) return 'BTCUSDT';
    return symbol.toUpperCase().replace('_', '');
  }

  /**
   * Generate HMAC-SHA256 signature for MEXC Contract API v1
   * Sign string format: ApiKey + Request-Time + paramString
   */
  generateSignature(timestamp, paramString = '') {
    const signString = `${this.apiKey}${timestamp}${paramString}`;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(signString)
      .digest('hex');
  }

  /**
   * Make an authenticated HTTP request to MEXC Contract API
   * [RF-7 FIX] Added explicit 429 rate-limit detection with exponential backoff (up to 2 retries).
   */
  async request(endpoint, method = 'GET', params = null, _retryCount = 0) {
    if (!this.isConfigured()) {
      throw new Error('MEXC API credentials not configured. Please set MEXC_API_KEY and MEXC_API_SECRET.');
    }

    const timestamp = Date.now().toString();
    let url = `${this.baseUrl}${endpoint}`;
    let paramString = '';
    let body = null;

    if (method === 'GET' && params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) {
        url += `?${qs}`;
        paramString = qs;
      }
    } else if (method === 'POST' && params) {
      paramString = typeof params === 'string' ? params : JSON.stringify(params);
      body = paramString;
    }

    const signature = this.generateSignature(timestamp, paramString);

    const headers = {
      'Content-Type': 'application/json',
      'ApiKey': this.apiKey,
      'Request-Time': timestamp,
      'Signature': signature
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timer);

      // [RF-7 FIX] Handle 429 Rate Limit with exponential backoff (max 2 retries)
      if (response.status === 429 && _retryCount < 2) {
        const backoffMs = Math.pow(2, _retryCount + 1) * 1000; // 2s, 4s
        console.warn(`[MEXC] Rate limit hit (429) on ${endpoint}. Retrying in ${backoffMs}ms (attempt ${_retryCount + 1}/2)...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return this.request(endpoint, method, params, _retryCount + 1);
      }

      if (response.status === 429) {
        throw new Error(`MEXC API Rate Limit (429): Too many requests to ${endpoint}. Please reduce request frequency.`);
      }

      const json = await response.json();
      if (!response.ok || (json.code !== 0 && json.success === false)) {
        const errMsg = json.message || json.msg || `HTTP ${response.status}`;
        throw new Error(`MEXC API Error (${json.code || response.status}): ${errMsg}`);
      }

      return json.data !== undefined ? json.data : json;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`MEXC API Request Timeout (> ${this.timeout}ms) on ${endpoint}`);
      }
      throw err;
    }
  }


  // ===========================================================================
  // PUBLIC ENDPOINTS
  // ===========================================================================

  async ping() {
    const url = `${this.baseUrl}/api/v1/contract/ping`;
    const start = Date.now();
    const res = await fetch(url);
    const latency = Date.now() - start;
    const json = await res.json();
    return { success: res.ok, latency, data: json };
  }

  async getServerTime() {
    const url = `${this.baseUrl}/api/v1/contract/ping`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data || Date.now();
  }

  // ===========================================================================
  // PRIVATE ACCOUNT & POSITION ENDPOINTS
  // ===========================================================================

  /**
   * Fetch account asset details (USDT equity, available margin, cash balance)
   */
  async getAccountAssets(currency = 'USDT') {
    const endpoint = `/api/v1/private/account/asset/${currency}`;
    try {
      const data = await this.request(endpoint, 'GET');
      return {
        currency: data.currency || currency,
        equity: parseFloat(data.equity || data.availableBalance || 0),
        availableBalance: parseFloat(data.availableBalance || 0),
        frozenBalance: parseFloat(data.frozenBalance || 0),
        positionMargin: parseFloat(data.positionMargin || 0),
        unrealizedPnl: parseFloat(data.unrealizedPnl || data.unrealisedPnl || 0),
        bonus: parseFloat(data.bonus || 0)
      };
    } catch (err) {
      // Fallback to all assets endpoint if single currency fails
      const allAssets = await this.request('/api/v1/private/account/assets', 'GET');
      const usdt = Array.isArray(allAssets) ? allAssets.find(a => a.currency === 'USDT') : allAssets;
      if (usdt) {
        return {
          currency: 'USDT',
          equity: parseFloat(usdt.equity || usdt.availableBalance || 0),
          availableBalance: parseFloat(usdt.availableBalance || 0),
          frozenBalance: parseFloat(usdt.frozenBalance || 0),
          positionMargin: parseFloat(usdt.positionMargin || 0),
          unrealizedPnl: parseFloat(usdt.unrealizedPnl || 0),
          bonus: parseFloat(usdt.bonus || 0)
        };
      }
      throw err;
    }
  }

  /**
   * Fetch all open contract positions
   * @param {string} symbol Optional symbol filter
   */
  async getOpenPositions(symbol = null) {
    const params = symbol ? { symbol: MexcClient.normalizeSymbol(symbol) } : {};
    const data = await this.request('/api/v1/private/position/open_positions', 'GET', params);
    return positions.map(p => {
      const isLong = (p.positionType === 1 || p.positionType === 'LONG' || p.side === 'LONG' || p.side === 1);
      const side = isLong ? 'LONG' : 'SHORT';
      const entryPrice = parseFloat(p.openPrice || p.openAvgPrice || p.holdAvgPrice || p.entryPrice || p.price || 0);
      const quantity = parseFloat(p.holdVol || p.vol || p.quantity || 0);
      const liquidationPrice = parseFloat(p.liquidatePrice || p.liquidationPrice || p.liqPrice || 0);
      const unrealizedPnl = parseFloat(p.unrealizedPnl || p.unrealisedPnl || p.pnl || 0);
      const margin = parseFloat(p.margin || p.positionMargin || p.im || 0);
      const leverage = parseInt(p.leverage || 10, 10);
      const stopLoss = p.stopLossPrice || p.stopLoss || p.sl || null;
      const takeProfit = p.takeProfitPrice || p.takeProfit || p.tp || null;

      return {
        id: p.positionId || `${p.symbol}_${side}`,
        positionId: p.positionId || `${p.symbol}_${side}`,
        symbol: MexcClient.denormalizeSymbol(p.symbol),
        mexcSymbol: p.symbol,
        side,
        positionType: side,
        quantity,
        holdVol: quantity,
        entryPrice,
        openPrice: entryPrice,
        liquidationPrice,
        liquidatePrice: liquidationPrice,
        unrealizedPnl,
        margin,
        leverage,
        stopLoss: stopLoss ? parseFloat(stopLoss) : null,
        takeProfit: takeProfit ? parseFloat(takeProfit) : null,
        isolated: p.openType === 1
      };
    });
  }


  /**
   * Submit an order to MEXC Futures
   * @param {Object} order
   *   - symbol: 'BTCUSDT'
   *   - side: 'BUY' (Open Long) | 'SELL' (Open Short) | 'CLOSE_LONG' | 'CLOSE_SHORT'
   *   - type: 'MARKET' (5) | 'LIMIT' (1)
   *   - price: number (for limit)
   *   - vol: quantity in contracts / coins
   *   - leverage: number (e.g. 10)
   *   - stopLoss: optional SL price
   *   - takeProfit: optional TP price
   */
  async submitOrder(order) {
    const symbol = MexcClient.normalizeSymbol(order.symbol);
    
    // Side mapping: 1: Open Long, 2: Close Short, 3: Open Short, 4: Close Long
    let mexcSide = 1;
    if (order.side === 'BUY' || order.side === 'OPEN_LONG') mexcSide = 1;
    else if (order.side === 'SELL' || order.side === 'OPEN_SHORT') mexcSide = 3;
    else if (order.side === 'CLOSE_LONG') mexcSide = 4;
    else if (order.side === 'CLOSE_SHORT') mexcSide = 2;

    const mexcType = (order.type === 'LIMIT' && order.price) ? 1 : 5; // 1=Limit, 5=Market

    const payload = {
      symbol,
      side: mexcSide,
      type: mexcType,
      vol: parseFloat(order.vol || order.quantity || 1),
      leverage: parseInt(order.leverage || 10, 10),
      openType: 1 // 1 = Isolated margin
    };

    if (mexcType === 1 && order.price) {
      payload.price = parseFloat(order.price);
    }
    if (order.stopLoss) {
      payload.stopLossPrice = parseFloat(order.stopLoss);
    }
    if (order.takeProfit) {
      payload.takeProfitPrice = parseFloat(order.takeProfit);
    }

    const res = await this.request('/api/v1/private/order/submit', 'POST', payload);
    return {
      success: true,
      orderId: res.orderId || res,
      symbol: order.symbol,
      side: order.side,
      status: 'SUBMITTED',
      raw: res
    };
  }

  /**
   * Cancel an open order by ID
   */
  async cancelOrder(orderIdList) {
    const ids = Array.isArray(orderIdList) ? orderIdList : [orderIdList];
    return await this.request('/api/v1/private/order/cancel', 'POST', ids);
  }

  /**
   * Close all positions for a symbol or all symbols
   */
  async closePositions(symbol = null) {
    const positions = await this.getOpenPositions(symbol);
    const results = [];

    for (const pos of positions) {
      if (pos.holdVol > 0) {
        const closeSide = pos.positionType === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT';
        const res = await this.submitOrder({
          symbol: pos.symbol,
          side: closeSide,
          type: 'MARKET',
          vol: pos.holdVol
        });
        results.push(res);
      }
    }

    return results;
  }
}

module.exports = MexcClient;
