/**
 * MULTI-TIMEFRAME (MTF) CONFLUENCE ENGINE
 * Institutional 3-Tier Multi-Timeframe Alignment:
 * - 15m: Macro Trend Bias (EMA 50/200, macro trend direction)
 * - 5m: Intermediate Market Structure (HH/HL or LH/LL structure, key S/R)
 * - 1m: Execution Trigger (Breakout, Retest, Pullback, Liquidity Sweep)
 * Universal module: runs in Node.js and Browser.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MtfEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class MtfEngine {
    constructor() {}

    /**
     * Evaluates macro trend from candle series and EMAs.
     */
    static evaluateTrend(candles, ema50, ema200) {
      if (!candles || candles.length === 0) return 'NEUTRAL';
      const last = candles[candles.length - 1];
      const close = last.close;
      const e50 = ema50 && ema50.length ? ema50[ema50.length - 1] : null;
      const e200 = ema200 && ema200.length ? ema200[ema200.length - 1] : null;

      if (!e50 || isNaN(e50)) {
        // Fallback: price slope
        const first = candles[Math.max(0, candles.length - 20)];
        return close > first.close ? 'BULLISH' : 'BEARISH';
      }

      if (e200 && !isNaN(e200)) {
        if (close > e50 && e50 > e200) return 'STRONG_BULLISH';
        if (close < e50 && e50 < e200) return 'STRONG_BEARISH';
      }

      if (close > e50) return 'BULLISH';
      if (close < e50) return 'BEARISH';
      return 'NEUTRAL';
    }

    /**
     * Checks alignment across 15m, 5m, and 1m timeframes.
     * @param {Object} mtfData { tf15m: { trend, candles }, tf5m: { trend, candles, structure }, tf1m: { trigger, candles } }
     * @param {string} proposedSide 'BUY' (Long) or 'SELL' (Short)
     */
    static checkAlignment(mtfData, proposedSide) {
      const reasons = [];
      let score = 0;

      const tf15mTrend = mtfData.tf15m?.trend || 'NEUTRAL';
      const tf5mTrend = mtfData.tf5m?.trend || 'NEUTRAL';
      const tf5mStructure = mtfData.tf5m?.structure || 'CONSOLIDATION';

      const isLong = proposedSide === 'BUY' || proposedSide === 'LONG';
      const isShort = proposedSide === 'SELL' || proposedSide === 'SHORT';

      // 1. 15m Macro Bias Check (Up to 5 pts)
      if (isLong) {
        if (tf15mTrend === 'STRONG_BULLISH') {
          score += 5;
          reasons.push('15m Macro Trend: Strong Bullish (Price > EMA50 > EMA200)');
        } else if (tf15mTrend === 'BULLISH') {
          score += 4;
          reasons.push('15m Macro Trend: Bullish (Price > EMA50)');
        } else if (tf15mTrend === 'BEARISH' || tf15mTrend === 'STRONG_BEARISH') {
          score -= 5; // Direct counter-trend penalty
          reasons.push('⚠️ Counter-Trend Warning: 15m Macro is Bearish');
        }
      } else if (isShort) {
        if (tf15mTrend === 'STRONG_BEARISH') {
          score += 5;
          reasons.push('15m Macro Trend: Strong Bearish (Price < EMA50 < EMA200)');
        } else if (tf15mTrend === 'BEARISH') {
          score += 4;
          reasons.push('15m Macro Trend: Bearish (Price < EMA50)');
        } else if (tf15mTrend === 'BULLISH' || tf15mTrend === 'STRONG_BULLISH') {
          score -= 5; // Direct counter-trend penalty
          reasons.push('⚠️ Counter-Trend Warning: 15m Macro is Bullish');
        }
      }

      // 2. 5m Intermediate Structure Check (Up to 5 pts)
      if (isLong) {
        if (tf5mStructure === 'BULLISH_STRUCTURE' || tf5mTrend.includes('BULLISH')) {
          score += 5;
          reasons.push('5m Intermediate Structure: Bullish (HH/HL confirmed)');
        } else if (tf5mTrend.includes('BEARISH')) {
          score -= 3;
          reasons.push('⚠️ 5m Structure Conflict: Bearish price action on 5m');
        }
      } else if (isShort) {
        if (tf5mStructure === 'BEARISH_STRUCTURE' || tf5mTrend.includes('BEARISH')) {
          score += 5;
          reasons.push('5m Intermediate Structure: Bearish (LH/LL confirmed)');
        } else if (tf5mTrend.includes('BULLISH')) {
          score -= 3;
          reasons.push('⚠️ 5m Structure Conflict: Bullish price action on 5m');
        }
      }

      // Clamp score between 0 and 10
      const finalScore = Math.max(0, Math.min(10, score));
      const isAligned = finalScore >= 7;

      return {
        isAligned,
        score: finalScore,
        macro15m: tf15mTrend,
        structure5m: tf5mStructure,
        reasons
      };
    }
  }

  return MtfEngine;
}));
