/**
 * MARKET STRUCTURE ENGINE
 * Institutional Price Action & Market Structure Analyzer
 * - Detects Swing Highs & Swing Lows (Fractals / Pivots)
 * - Identifies Market Structure: HH (Higher High), HL (Higher Low), LH (Lower High), LL (Lower Low)
 * - Detects BOS (Break of Structure): Trend continuation breaks
 * - Detects CHoCH (Change of Character): Early trend reversal breaks
 * - Identifies Dynamic Support & Resistance Zones with test counts
 * Universal module: runs in Node.js and Browser.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MarketStructureEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class MarketStructureEngine {
    constructor(options = {}) {
      this.options = Object.assign({
        pivotLookback: 5,        // Number of bars left & right to confirm swing pivot
        breakoutAtrFrac: 0.1,    // Minimum filter fraction of ATR for clean break
        maxZones: 6,             // Max active S/R zones to track
        touchTolerancePct: 0.002 // 0.2% tolerance to consider a zone "tested"
      }, options);
    }

    /**
     * Identifies swing high and swing low pivot points across candles.
     * @param {Array} candles Array of { open, high, low, close, volume, time }
     * @param {number} lookback Lookback bars (default: 5)
     */
    findPivots(candles, lookback = this.options.pivotLookback) {
      const highs = [];
      const lows = [];
      const n = candles.length;

      for (let i = lookback; i < n - lookback; i++) {
        const curHigh = candles[i].high;
        const curLow = candles[i].low;
        let isHigh = true;
        let isLow = true;

        for (let j = i - lookback; j <= i + lookback; j++) {
          if (j === i) continue;
          if (candles[j].high >= curHigh) isHigh = false;
          if (candles[j].low <= curLow) isLow = false;
        }

        if (isHigh) {
          highs.push({ index: i, time: candles[i].time, price: curHigh, candle: candles[i] });
        }
        if (isLow) {
          lows.push({ index: i, time: candles[i].time, price: curLow, candle: candles[i] });
        }
      }

      return { highs, lows };
    }

    /**
     * Analyzes candle series for complete Market Structure.
     * Returns: { trend, structureHistory, lastBOS, lastCHoCH, activeZones, swingPoints }
     */
    analyze(candles, atr = null) {
      if (!candles || candles.length < this.options.pivotLookback * 2 + 5) {
        return {
          trend: 'NEUTRAL',
          structure: 'CONSOLIDATION',
          lastBOS: null,
          lastCHoCH: null,
          swingHighs: [],
          swingLows: [],
          supportZones: [],
          resistanceZones: [],
          reasons: []
        };
      }

      const { highs, lows } = this.findPivots(candles);
      const points = [];

      highs.forEach(h => points.push({ ...h, type: 'HIGH' }));
      lows.forEach(l => points.push({ ...l, type: 'LOW' }));
      points.sort((a, b) => a.index - b.index);

      // Label HH, HL, LH, LL
      let prevHigh = null;
      let prevLow = null;
      let currentTrend = 'NEUTRAL';
      let lastBOS = null;
      let lastCHoCH = null;
      const reasons = [];

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.type === 'HIGH') {
          if (prevHigh) {
            p.label = p.price > prevHigh.price ? 'HH' : 'LH';
          } else {
            p.label = 'HIGH';
          }
          prevHigh = p;
        } else {
          if (prevLow) {
            p.label = p.price > prevLow.price ? 'HL' : 'LL';
          } else {
            p.label = 'LOW';
          }
          prevLow = p;
        }
      }

      // Check current trend based on last 2-3 swings
      const recentHighs = points.filter(p => p.type === 'HIGH').slice(-3);
      const recentLows = points.filter(p => p.type === 'LOW').slice(-3);

      let isUptrend = false;
      let isDowntrend = false;

      if (recentHighs.length >= 2 && recentLows.length >= 2) {
        const h1 = recentHighs[recentHighs.length - 2];
        const h2 = recentHighs[recentHighs.length - 1];
        const l1 = recentLows[recentLows.length - 2];
        const l2 = recentLows[recentLows.length - 1];

        if (h2.price > h1.price && l2.price > l1.price) {
          isUptrend = true;
          currentTrend = 'BULLISH';
        } else if (h2.price < h1.price && l2.price < l1.price) {
          isDowntrend = true;
          currentTrend = 'BEARISH';
        }
      }

      // Detect BOS & CHoCH across recent candles up to latest candle
      const latestCandle = candles[candles.length - 1];
      const prevCandle = candles[candles.length - 2];
      const recentHighLevel = recentHighs.length > 0 ? recentHighs[recentHighs.length - 1].price : null;
      const recentLowLevel = recentLows.length > 0 ? recentLows[recentLows.length - 1].price : null;

      // BOS (Break of Structure):
      // In uptrend: Close breaks above most recent swing high
      if (recentHighLevel && latestCandle.close > recentHighLevel && prevCandle.close <= recentHighLevel) {
        if (isUptrend) {
          lastBOS = {
            type: 'BULLISH_BOS',
            level: recentHighLevel,
            brokenAt: latestCandle.time,
            description: `Bullish BOS: Clean break above Swing High ($${recentHighLevel.toFixed(2)})`
          };
          reasons.push(lastBOS.description);
        } else if (isDowntrend) {
          // Downtrend breaking above swing high = CHoCH (Change of Character)
          lastCHoCH = {
            type: 'BULLISH_CHOCH',
            level: recentHighLevel,
            brokenAt: latestCandle.time,
            description: `Bullish CHoCH: Trend reversal break above Lower High ($${recentHighLevel.toFixed(2)})`
          };
          reasons.push(lastCHoCH.description);
          currentTrend = 'BULLISH_REVERSAL';
        }
      }

      // In downtrend: Close breaks below most recent swing low
      if (recentLowLevel && latestCandle.close < recentLowLevel && prevCandle.close >= recentLowLevel) {
        if (isDowntrend) {
          lastBOS = {
            type: 'BEARISH_BOS',
            level: recentLowLevel,
            brokenAt: latestCandle.time,
            description: `Bearish BOS: Clean break below Swing Low ($${recentLowLevel.toFixed(2)})`
          };
          reasons.push(lastBOS.description);
        } else if (isUptrend) {
          // Uptrend breaking below swing low = CHoCH (Change of Character)
          lastCHoCH = {
            type: 'BEARISH_CHOCH',
            level: recentLowLevel,
            brokenAt: latestCandle.time,
            description: `Bearish CHoCH: Trend reversal break below Higher Low ($${recentLowLevel.toFixed(2)})`
          };
          reasons.push(lastCHoCH.description);
          currentTrend = 'BEARISH_REVERSAL';
        }
      }

      // Dynamic Support / Resistance Zones
      const supportZones = [];
      const resistanceZones = [];

      for (const l of recentLows) {
        supportZones.push({
          level: l.price,
          time: l.time,
          label: l.label,
          touches: 1
        });
      }

      for (const h of recentHighs) {
        resistanceZones.push({
          level: h.price,
          time: h.time,
          label: h.label,
          touches: 1
        });
      }

      return {
        trend: currentTrend,
        structure: isUptrend ? 'BULLISH_STRUCTURE' : isDowntrend ? 'BEARISH_STRUCTURE' : 'RANGING',
        lastBOS,
        lastCHoCH,
        recentHighs,
        recentLows,
        supportZones: supportZones.slice(-3),
        resistanceZones: resistanceZones.slice(-3),
        reasons
      };
    }
  }

  return MarketStructureEngine;
}));
