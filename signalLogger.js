/**
 * CRYPTO SCALPER PRO - SHADOW / PAPER MODE SIGNAL LOGGER
 * Logs every emitted signal with entry, stop loss, take profit targets,
 * confluence factors, and tracks live trade outcomes (Win / Loss / Net R)
 * without placing live exchange orders.
 */

const fs = (typeof require !== 'undefined') ? require('fs') : null;
const path = (typeof require !== 'undefined') ? require('path') : null;

class SignalLogger {
  constructor(logFilePath = null) {
    this.logFilePath = logFilePath || (typeof process !== 'undefined' ? './logs/signal_paper_log.json' : null);
    this.activePaperTrades = [];
    this.completedPaperTrades = [];
    this.loadLog();
  }

  loadLog() {
    if (!fs || !this.logFilePath) return;
    try {
      if (fs.existsSync(this.logFilePath)) {
        const raw = fs.readFileSync(this.logFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.activePaperTrades = parsed.activePaperTrades || [];
        this.completedPaperTrades = parsed.completedPaperTrades || [];
      }
    } catch (e) {
      this.activePaperTrades = [];
      this.completedPaperTrades = [];
    }
  }

  saveLog() {
    if (!fs || !this.logFilePath) return;
    try {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        updatedAt: new Date().toISOString(),
        summary: this.getSummaryStats(),
        activePaperTrades: this.activePaperTrades,
        completedPaperTrades: this.completedPaperTrades.slice(-200) // Retain last 200 completed trades
      };
      fs.writeFileSync(this.logFilePath, JSON.stringify(data, null, 2));
    } catch (e) {}
  }

  logSignal(signal) {
    if (!signal || !signal.symbol) return null;
    const tradeId = `${signal.symbol}_${signal.direction}_${Date.now()}`;
    const paperTrade = {
      id: tradeId,
      timestamp: new Date().toISOString(),
      symbol: signal.symbol,
      direction: signal.direction === 1 || signal.dir === 'LONG' ? 'LONG' : 'SHORT',
      entryPrice: parseFloat(signal.entryPrice || signal.price || signal.entry || 0),
      slPrice: parseFloat(signal.sl || signal.slPrice || 0),
      tp1Price: parseFloat(signal.tp1 || signal.tp1Price || 0),
      tp2Price: parseFloat(signal.tp2 || signal.tp2Price || 0),
      tp3Price: parseFloat(signal.tp3 || signal.tp3Price || 0),
      riskDistance: Math.abs(parseFloat(signal.entryPrice || signal.entry || 0) - parseFloat(signal.sl || 0)),
      rrRatio: parseFloat(signal.rr || signal.rrRatio || 2.0),
      score: parseInt(signal.score100 || signal.score || 80, 10),
      reasons: signal.reasons || signal.breakdown || [],
      status: 'ACTIVE',
      pnlPct: 0.0,
      realizedR: 0.0,
      hitTP1: false,
      hitTP2: false,
      hitTP3: false,
      closedAt: null
    };

    this.activePaperTrades.push(paperTrade);
    this.saveLog();
    return paperTrade;
  }

  updateTick(symbol, currentPrice, highPrice = currentPrice, lowPrice = currentPrice) {
    if (!symbol || !currentPrice) return;
    const now = new Date().toISOString();

    for (let i = this.activePaperTrades.length - 1; i >= 0; i--) {
      const trade = this.activePaperTrades[i];
      if (trade.symbol !== symbol || trade.status !== 'ACTIVE') continue;

      const isLong = trade.direction === 'LONG';
      const risk = trade.riskDistance || (trade.entryPrice * 0.01);

      if (isLong) {
        // High water mark TP check
        if (highPrice >= trade.tp3Price) {
          trade.status = 'WIN_TP3';
          trade.hitTP3 = true;
          trade.realizedR = 3.0;
          trade.pnlPct = ((trade.tp3Price - trade.entryPrice) / trade.entryPrice) * 100;
          trade.closedAt = now;
        } else if (highPrice >= trade.tp2Price && !trade.hitTP2) {
          trade.hitTP2 = true;
          trade.slPrice = trade.tp1Price; // Lock TP1 profit
        } else if (highPrice >= trade.tp1Price && !trade.hitTP1) {
          trade.hitTP1 = true;
          trade.slPrice = trade.entryPrice; // Lock Breakeven
        }

        // Low water mark SL check
        if (trade.status === 'ACTIVE' && lowPrice <= trade.slPrice) {
          if (trade.hitTP2) {
            trade.status = 'WIN_TP1_LOCK';
            trade.realizedR = 1.0;
            trade.pnlPct = ((trade.tp1Price - trade.entryPrice) / trade.entryPrice) * 100;
          } else if (trade.hitTP1) {
            trade.status = 'BREAKEVEN';
            trade.realizedR = 0.0;
            trade.pnlPct = 0.0;
          } else {
            trade.status = 'LOSS_SL';
            trade.realizedR = -1.0;
            trade.pnlPct = ((trade.slPrice - trade.entryPrice) / trade.entryPrice) * 100;
          }
          trade.closedAt = now;
        }
      } else { // SHORT
        if (lowPrice <= trade.tp3Price) {
          trade.status = 'WIN_TP3';
          trade.hitTP3 = true;
          trade.realizedR = 3.0;
          trade.pnlPct = ((trade.entryPrice - trade.tp3Price) / trade.entryPrice) * 100;
          trade.closedAt = now;
        } else if (lowPrice <= trade.tp2Price && !trade.hitTP2) {
          trade.hitTP2 = true;
          trade.slPrice = trade.tp1Price; // Lock TP1 profit
        } else if (lowPrice <= trade.tp1Price && !trade.hitTP1) {
          trade.hitTP1 = true;
          trade.slPrice = trade.entryPrice; // Lock Breakeven
        }

        if (trade.status === 'ACTIVE' && highPrice >= trade.slPrice) {
          if (trade.hitTP2) {
            trade.status = 'WIN_TP1_LOCK';
            trade.realizedR = 1.0;
            trade.pnlPct = ((trade.entryPrice - trade.tp1Price) / trade.entryPrice) * 100;
          } else if (trade.hitTP1) {
            trade.status = 'BREAKEVEN';
            trade.realizedR = 0.0;
            trade.pnlPct = 0.0;
          } else {
            trade.status = 'LOSS_SL';
            trade.realizedR = -1.0;
            trade.pnlPct = ((trade.entryPrice - trade.slPrice) / trade.entryPrice) * 100;
          }
          trade.closedAt = now;
        }
      }

      if (trade.status !== 'ACTIVE') {
        this.activePaperTrades.splice(i, 1);
        this.completedPaperTrades.push(trade);
        this.saveLog();
      }
    }
  }

  getSummaryStats() {
    const total = this.completedPaperTrades.length;
    if (total === 0) {
      return { totalTrades: 0, winRatePct: '0.0%', totalR: 0, profitFactor: 0 };
    }
    const wins = this.completedPaperTrades.filter(t => t.realizedR > 0);
    const losses = this.completedPaperTrades.filter(t => t.realizedR < 0);
    const winRatePct = ((wins.length / total) * 100).toFixed(1) + '%';
    const totalR = this.completedPaperTrades.reduce((s, t) => s + (t.realizedR || 0), 0).toFixed(2);
    const grossWins = wins.reduce((s, t) => s + t.realizedR, 0);
    const grossLosses = Math.abs(losses.reduce((s, t) => s + t.realizedR, 0));
    const profitFactor = grossLosses > 0 ? (grossWins / grossLosses).toFixed(2) : grossWins.toFixed(2);

    return {
      totalTrades: total,
      wins: wins.length,
      losses: losses.length,
      winRatePct,
      totalR: parseFloat(totalR),
      profitFactor: parseFloat(profitFactor)
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignalLogger;
} else if (typeof window !== 'undefined') {
  window.SignalLogger = SignalLogger;
}
