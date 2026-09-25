/**
 * INTRADAY SETUPS & MULTI-PAIR MARKET SCANNER
 * Background scanner monitoring top crypto futures pairs:
 * - BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT
 * Identifies high-probability intraday setups:
 * - Breakout
 * - Breakout + Retest
 * - Liquidity Sweep & Reject
 * - EMA Pullback (Trend Continuation)
 * - Market Structure Break (BOS / CHoCH)
 */

const fmtPrice = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '0.00';
  const absolute = Math.abs(number);
  const decimals = absolute < 0.0001 ? 8 : absolute < 0.001 ? 7 : absolute < 0.01 ? 6 : absolute < 1 ? 4 : absolute < 10 ? 3 : 2;
  return number.toFixed(decimals);
};

class MarketScanner {
  constructor(options = {}) {
    this.symbols = options.symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'];
    this.engine = options.engine; // ScalperEngine instance
    this.interval = options.interval || '5m';
    this.setups = [];
    this.lastScanTime = 0;
    this.isScanning = false;
  }

  /**
   * Scans a single symbol by fetching recent klines and analyzing structure
   */
  async scanSymbol(symbol) {
    try {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${this.interval}&limit=100`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let res;
      try {
        res = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) return null;
      const raw = await res.json();
      if (!Array.isArray(raw) || raw.length < 50) return null;

      const candles = raw.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));

      const analysis = this.engine.analyze(candles);
      if (!analysis || !analysis.latest) return null;

      const currentPrice = candles[candles.length - 1].close;
      const latest = analysis.latest;
      const structure = latest.marketStructure;
      const sweep = latest.liquiditySweep;
      // UI confluence is always expressed on the terminal's 50–99 scale.
      const score100 = Math.min(99, Math.max(50, Math.round(latest.score100 || 50)));

      let setupType = null;
      let direction = null;
      let setupDesc = '';

      // 1. Check Liquidity Sweep
      if (sweep && sweep.isSweep) {
        if (sweep.sweepType === 'BULLISH_SWEEP') {
          setupType = 'Liquidity Sweep';
          direction = 'LONG';
          setupDesc = sweep.description;
        } else if (sweep.sweepType === 'BEARISH_SWEEP') {
          setupType = 'Liquidity Sweep';
          direction = 'SHORT';
          setupDesc = sweep.description;
        }
      }

      // 2. Check Break of Structure / CHoCH
      if (!setupType && structure) {
        if (structure.lastCHoCH) {
          setupType = 'Change of Character (CHoCH)';
          direction = structure.lastCHoCH.type.includes('BULLISH') ? 'LONG' : 'SHORT';
          setupDesc = structure.lastCHoCH.description;
        } else if (structure.lastBOS) {
          setupType = 'Break of Structure (BOS)';
          direction = structure.lastBOS.type.includes('BULLISH') ? 'LONG' : 'SHORT';
          setupDesc = structure.lastBOS.description;
        }
      }

      // 3. Check EMA Pullback
      if (!setupType && latest.regime.includes('BULLISH')) {
        const lastCandle = candles[candles.length - 1];
        const fastEma = analysis.vectors.fastEma[analysis.vectors.fastEma.length - 1];
        const slowEma = analysis.vectors.slowEma[analysis.vectors.slowEma.length - 1];
        if (lastCandle.low <= fastEma && lastCandle.close >= fastEma) {
          setupType = 'EMA Pullback';
          direction = 'LONG';
          setupDesc = `Pullback to 20 EMA in active ${latest.regime} trend`;
        }
      } else if (!setupType && latest.regime.includes('BEARISH')) {
        const lastCandle = candles[candles.length - 1];
        const fastEma = analysis.vectors.fastEma[analysis.vectors.fastEma.length - 1];
        if (lastCandle.high >= fastEma && lastCandle.close <= fastEma) {
          setupType = 'EMA Pullback';
          direction = 'SHORT';
          setupDesc = `Pullback to 20 EMA in active ${latest.regime} trend`;
        }
      }

      // Default fallback setup if trending with solid confluence
      if (!setupType && score100 >= 65) {
        setupType = score100 >= 80 ? 'High Confluence Trend' : 'Trend Continuation';
        direction = latest.regime.includes('BULLISH') ? 'LONG' : (latest.regime.includes('BEARISH') ? 'SHORT' : 'LONG');
        setupDesc = `Confluence Score: ${score100}/100 with ${latest.regime} momentum`;
      }

      if (!setupType || direction === 'NEUTRAL') return null;

      // Calculate SL & TP
      const atr = latest.atr || (currentPrice * 0.008);
      const isLong = direction === 'LONG';
      const sl = isLong ? currentPrice - (atr * 1.5) : currentPrice + (atr * 1.5);
      const risk = Math.abs(currentPrice - sl);
      const tp1 = isLong ? currentPrice + (risk * 1.0) : currentPrice - (risk * 1.0);
      const tp2 = isLong ? currentPrice + (risk * 2.0) : currentPrice - (risk * 2.0);
      const rr = risk > 0 ? (Math.abs(tp2 - currentPrice) / risk).toFixed(2) : '1.50';

      let status = 'WAITING FOR ENTRY';
      if (score100 >= 85) status = 'READY FOR EXECUTION';
      else if (score100 >= 70) status = 'APPROACHING ZONE';

      return {
        symbol,
        setupType,
        direction,
        currentPrice,
        entryZone: `$${fmtPrice(currentPrice * 0.999)} - $${fmtPrice(currentPrice * 1.001)}`,
        sl,
        tp1,
        tp2,
        riskReward: `1:${rr}`,
        score100,
        status,
        description: setupDesc,
        regime: latest.regime,
        updatedAt: Date.now()
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * Runs a complete scan across all configured pairs (parallelized)
   * [BUG FIX B6] Changed from sequential for-loop to Promise.all — reduces worst-case scan from
   * >18s (6 sequential fetches) to max 3s (all fetches in parallel).
   */
  async scanAll() {
    if (this.isScanning) return this.setups;
    this.isScanning = true;

    try {
      const results = (await Promise.all(this.symbols.map(sym => this.scanSymbol(sym)))).filter(Boolean);
      results.sort((a, b) => b.score100 - a.score100);
      this.setups = results;
      this.lastScanTime = Date.now();
    } catch (err) {
      // Silent — scanner errors should never crash the server
    } finally {
      this.isScanning = false;
    }
    return this.setups;
  }


  getSetups() {
    return this.setups;
  }
}

module.exports = MarketScanner;
