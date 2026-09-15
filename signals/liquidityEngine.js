/**
 * LIQUIDITY ENGINE
 * Liquidity Pools, Equal Highs/Lows (EQH/EQL), & Stop-Hunt Sweep Detector
 * - Detects Equal Highs & Equal Lows (resting liquidity zones)
 * - Identifies Liquidity Sweeps (stop-runs beyond key levels with immediate price rejection)
 * - Calculates Wick Rejection Ratio to filter high-probability liquidity grabs
 * Universal module: runs in Node.js and Browser.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiquidityEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class LiquidityEngine {
    constructor(options = {}) {
      this.options = Object.assign({
        eqhTolerancePct: 0.0012,     // 0.12% tolerance for Equal Highs / Lows
        minWickRatio: 0.35,          // Wick must make up at least 35% of total candle range
        sweepLookback: 30            // Look back 30 bars for liquidity targets
      }, options);
    }

    /**
     * Finds Equal Highs (EQH) and Equal Lows (EQL) across candles.
     */
    findEqualLevels(candles, lookback = this.options.sweepLookback) {
      const slice = candles.slice(-lookback);
      const eqHighs = [];
      const eqLows = [];

      for (let i = 0; i < slice.length - 1; i++) {
        for (let j = i + 2; j < slice.length; j++) {
          const h1 = slice[i].high;
          const h2 = slice[j].high;
          const diffH = Math.abs(h1 - h2) / Math.max(h1, h2);

          if (diffH <= this.options.eqhTolerancePct) {
            eqHighs.push({
              level: (h1 + h2) / 2,
              time1: slice[i].time,
              time2: slice[j].time,
              type: 'EQH'
            });
          }

          const l1 = slice[i].low;
          const l2 = slice[j].low;
          const diffL = Math.abs(l1 - l2) / Math.max(l1, l2);

          if (diffL <= this.options.eqhTolerancePct) {
            eqLows.push({
              level: (l1 + l2) / 2,
              time1: slice[i].time,
              time2: slice[j].time,
              type: 'EQL'
            });
          }
        }
      }

      return { eqHighs, eqLows };
    }

    /**
     * Checks if the latest candle performed a liquidity sweep & rejection.
     * @param {Array} candles Candle series
     * @param {Object} swingPivots { recentHighs, recentLows } from MarketStructureEngine
     */
    detectSweep(candles, swingPivots = { recentHighs: [], recentLows: [] }) {
      if (!candles || candles.length < 5) {
        return { isSweep: false, sweepType: 'NONE', details: null };
      }

      const latest = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const range = latest.high - latest.low;
      if (range <= 0) return { isSweep: false, sweepType: 'NONE', details: null };

      const upperWick = latest.high - Math.max(latest.open, latest.close);
      const lowerWick = Math.min(latest.open, latest.close) - latest.low;
      const upperWickRatio = upperWick / range;
      const lowerWickRatio = lowerWick / range;

      const { eqHighs, eqLows } = this.findEqualLevels(candles);
      const reasons = [];

      // 1. BULLISH LIQUIDITY SWEEP (Sweep below Lows -> Rejection wick -> Closes above level)
      // Check against swing lows
      for (const sw of swingPivots.recentLows || []) {
        if (latest.low < sw.price && latest.close > sw.price) {
          if (lowerWickRatio >= this.options.minWickRatio) {
            const desc = `Bullish Liquidity Sweep: Price spiked below $${sw.price.toFixed(2)} taking sell stops, rejected with ${(lowerWickRatio * 100).toFixed(0)}% lower wick`;
            reasons.push(desc);
            return {
              isSweep: true,
              sweepType: 'BULLISH_SWEEP',
              level: sw.price,
              wickRatio: lowerWickRatio,
              description: desc,
              scoreBonus: 10
            };
          }
        }
      }

      // Check against EQL
      for (const eql of eqLows) {
        if (latest.low < eql.level && latest.close > eql.level) {
          if (lowerWickRatio >= this.options.minWickRatio) {
            const desc = `Bullish EQL Sweep: Liquidity grab below double bottoms ($${eql.level.toFixed(2)}), rejected back into range`;
            reasons.push(desc);
            return {
              isSweep: true,
              sweepType: 'BULLISH_SWEEP',
              level: eql.level,
              wickRatio: lowerWickRatio,
              description: desc,
              scoreBonus: 10
            };
          }
        }
      }

      // 2. BEARISH LIQUIDITY SWEEP (Sweep above Highs -> Rejection wick -> Closes below level)
      // Check against swing highs
      for (const sh of swingPivots.recentHighs || []) {
        if (latest.high > sh.price && latest.close < sh.price) {
          if (upperWickRatio >= this.options.minWickRatio) {
            const desc = `Bearish Liquidity Sweep: Price spiked above $${sh.price.toFixed(2)} trapping breakout buyers, rejected with ${(upperWickRatio * 100).toFixed(0)}% upper wick`;
            reasons.push(desc);
            return {
              isSweep: true,
              sweepType: 'BEARISH_SWEEP',
              level: sh.price,
              wickRatio: upperWickRatio,
              description: desc,
              scoreBonus: 10
            };
          }
        }
      }

      // Check against EQH
      for (const eqh of eqHighs) {
        if (latest.high > eqh.level && latest.close < eqh.level) {
          if (upperWickRatio >= this.options.minWickRatio) {
            const desc = `Bearish EQH Sweep: Liquidity grab above double tops ($${eqh.level.toFixed(2)}), rejected back into range`;
            reasons.push(desc);
            return {
              isSweep: true,
              sweepType: 'BEARISH_SWEEP',
              level: eqh.level,
              wickRatio: upperWickRatio,
              description: desc,
              scoreBonus: 10
            };
          }
        }
      }

      return { isSweep: false, sweepType: 'NONE', details: null, scoreBonus: 0 };
    }
  }

  return LiquidityEngine;
}));
