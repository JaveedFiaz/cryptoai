/**
 * 100-POINT MULTI-FACTOR CONFLUENCE SCORING ENGINE
 * Institutional quantitative scoring model:
 * - Trend Alignment: 20 pts
 * - Market Structure & Price Action: 20 pts
 * - Momentum & Oscillators: 15 pts
 * - Volume Confirmation: 15 pts
 * - Liquidity & Sweeps: 10 pts
 * - Multi-Timeframe Alignment: 10 pts
 * - Entry Quality & Candlestick Anatomy: 10 pts
 * Total: 100 points
 * 
 * Quality Classification:
 * - 0 - 59:   NO_TRADE (Suppressed)
 * - 60 - 69:  WEAK (Display/Informational only)
 * - 70 - 79:  MODERATE (Visual alert, manual review)
 * - 80 - 89:  HIGH_CONFIDENCE (Auto-trade eligible if threshold met)
 * - 90 - 100: VERY_HIGH_CONFIDENCE (Top-tier institutional setup)
 * 
 * Universal module: runs in Node.js and Browser.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScoringEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class ScoringEngine {
    constructor(options = {}) {
      this.options = Object.assign({
        autoTradeMinScore: 85,
        defaultMinScore: 75
      }, options);
    }

    /**
     * Evaluates a complete 100-point confluence score for a proposed setup.
     * @param {Object} data Comprehensive market data & indicator values
     */
    evaluate(data) {
      const {
        side,               // 'BUY' | 'SELL'
        price,              // Current price
        candles,            // Recent candles
        emas,               // { ema20, ema50, ema200 }
        vwap,               // Current VWAP value
        rsi,                // Current RSI value
        macd,               // { macd, signal, hist }
        adx,                // Current ADX value
        volume,             // Current candle volume
        volSma,             // 20-period volume SMA
        marketStructure,    // Output from MarketStructureEngine.analyze()
        liquiditySweep,     // Output from LiquidityEngine.detectSweep()
        mtfAlignment        // Output from MtfEngine.checkAlignment()
      } = data;

      const isLong = side === 'BUY' || side === 'LONG';
      const isShort = side === 'SELL' || side === 'SHORT';

      let trendScore = 0;
      let structureScore = 0;
      let momentumScore = 0;
      let volumeScore = 0;
      let liquidityScore = 0;
      let mtfScore = 0;
      let entryScore = 0;

      const reasons = [];
      const breakdown = {};

      // -----------------------------------------------------------------------
      // 1. TREND ALIGNMENT (Max: 20 pts)
      // -----------------------------------------------------------------------
      const ema20 = emas?.ema20;
      const ema50 = emas?.ema50;
      const ema200 = emas?.ema200;

      if (isLong) {
        if (ema20 && ema50 && ema20 > ema50) {
          trendScore += 6;
          reasons.push('EMA 20 > EMA 50 Bullish Stack');
        }
        if (ema50 && ema200 && ema50 > ema200) {
          trendScore += 4;
          reasons.push('EMA 50 > EMA 200 Golden Alignment');
        }
        if (vwap && price > vwap) {
          trendScore += 5;
          reasons.push('Price above Institutional VWAP');
        }
        if (adx && adx >= 20) {
          trendScore += 5;
          reasons.push(`ADX ${adx.toFixed(1)} confirms active directional trend`);
        }
      } else if (isShort) {
        if (ema20 && ema50 && ema20 < ema50) {
          trendScore += 6;
          reasons.push('EMA 20 < EMA 50 Bearish Stack');
        }
        if (ema50 && ema200 && ema50 < ema200) {
          trendScore += 4;
          reasons.push('EMA 50 < EMA 200 Death Cross Alignment');
        }
        if (vwap && price < vwap) {
          trendScore += 5;
          reasons.push('Price below Institutional VWAP');
        }
        if (adx && adx >= 20) {
          trendScore += 5;
          reasons.push(`ADX ${adx.toFixed(1)} confirms active directional trend`);
        }
      }
      trendScore = Math.min(20, Math.max(0, trendScore));
      breakdown.trend = trendScore;

      // -----------------------------------------------------------------------
      // 2. MARKET STRUCTURE & PRICE ACTION (Max: 20 pts)
      // -----------------------------------------------------------------------
      if (marketStructure) {
        if (isLong) {
          if (marketStructure.structure === 'BULLISH_STRUCTURE') {
            structureScore += 8;
            reasons.push('Market Structure: Higher Highs & Higher Lows sequence');
          }
          if (marketStructure.lastBOS && marketStructure.lastBOS.type === 'BULLISH_BOS') {
            structureScore += 7;
            reasons.push(marketStructure.lastBOS.description);
          }
          if (marketStructure.lastCHoCH && marketStructure.lastCHoCH.type === 'BULLISH_CHOCH') {
            structureScore += 8;
            reasons.push(marketStructure.lastCHoCH.description);
          }
        } else if (isShort) {
          if (marketStructure.structure === 'BEARISH_STRUCTURE') {
            structureScore += 8;
            reasons.push('Market Structure: Lower Highs & Lower Lows sequence');
          }
          if (marketStructure.lastBOS && marketStructure.lastBOS.type === 'BEARISH_BOS') {
            structureScore += 7;
            reasons.push(marketStructure.lastBOS.description);
          }
          if (marketStructure.lastCHoCH && marketStructure.lastCHoCH.type === 'BEARISH_CHOCH') {
            structureScore += 8;
            reasons.push(marketStructure.lastCHoCH.description);
          }
        }
      }
      structureScore = Math.min(20, Math.max(0, structureScore));
      breakdown.structure = structureScore;

      // -----------------------------------------------------------------------
      // 3. MOMENTUM & OSCILLATORS (Max: 15 pts)
      // -----------------------------------------------------------------------
      if (rsi !== undefined && rsi !== null) {
        if (isLong) {
          if (rsi >= 45 && rsi <= 65) {
            momentumScore += 6;
            reasons.push(`RSI ${rsi.toFixed(1)} in prime bullish continuation zone`);
          } else if (rsi > 30 && rsi < 45) {
            momentumScore += 3;
            reasons.push(`RSI ${rsi.toFixed(1)} recovering from oversold`);
          }
        } else if (isShort) {
          if (rsi >= 35 && rsi <= 55) {
            momentumScore += 6;
            reasons.push(`RSI ${rsi.toFixed(1)} in prime bearish continuation zone`);
          } else if (rsi > 55 && rsi < 70) {
            momentumScore += 3;
            reasons.push(`RSI ${rsi.toFixed(1)} turning down from overbought`);
          }
        }
      }

      if (macd) {
        if (isLong) {
          if (macd.macd > macd.signal) {
            momentumScore += 5;
            reasons.push('MACD Line above Signal line');
          }
          if (macd.hist > 0) {
            momentumScore += 4;
            reasons.push('MACD Histogram positive expansion');
          }
        } else if (isShort) {
          if (macd.macd < macd.signal) {
            momentumScore += 5;
            reasons.push('MACD Line below Signal line');
          }
          if (macd.hist < 0) {
            momentumScore += 4;
            reasons.push('MACD Histogram negative expansion');
          }
        }
      }
      momentumScore = Math.min(15, Math.max(0, momentumScore));
      breakdown.momentum = momentumScore;

      // -----------------------------------------------------------------------
      // 4. VOLUME CONFIRMATION (Max: 15 pts)
      // -----------------------------------------------------------------------
      if (volume && volSma && volSma > 0) {
        const ratio = volume / volSma;
        if (ratio >= 2.0) {
          volumeScore += 15;
          reasons.push(`Institutional Volume Surge: ${ratio.toFixed(1)}x 20-SMA`);
        } else if (ratio >= 1.5) {
          volumeScore += 12;
          reasons.push(`Elevated Volume: ${ratio.toFixed(1)}x 20-SMA`);
        } else if (ratio >= 1.1) {
          volumeScore += 7;
          reasons.push(`Above average volume: ${ratio.toFixed(1)}x 20-SMA`);
        }
      }
      volumeScore = Math.min(15, Math.max(0, volumeScore));
      breakdown.volume = volumeScore;

      // -----------------------------------------------------------------------
      // 5. LIQUIDITY & SWEEPS (Max: 10 pts)
      // -----------------------------------------------------------------------
      if (liquiditySweep && liquiditySweep.isSweep) {
        if (isLong && liquiditySweep.sweepType === 'BULLISH_SWEEP') {
          liquidityScore += 10;
          reasons.push(liquiditySweep.description);
        } else if (isShort && liquiditySweep.sweepType === 'BEARISH_SWEEP') {
          liquidityScore += 10;
          reasons.push(liquiditySweep.description);
        }
      }
      liquidityScore = Math.min(10, Math.max(0, liquidityScore));
      breakdown.liquidity = liquidityScore;

      // -----------------------------------------------------------------------
      // 6. MULTI-TIMEFRAME ALIGNMENT (Max: 10 pts)
      // -----------------------------------------------------------------------
      if (mtfAlignment) {
        mtfScore = mtfAlignment.score || 0;
        if (mtfAlignment.reasons) {
          mtfAlignment.reasons.forEach(r => reasons.push(r));
        }
      }
      mtfScore = Math.min(10, Math.max(0, mtfScore));
      breakdown.mtf = mtfScore;

      // -----------------------------------------------------------------------
      // 7. ENTRY QUALITY & CANDLESTICK ANATOMY (Max: 10 pts)
      // -----------------------------------------------------------------------
      if (candles && candles.length >= 2) {
        const latest = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const range = latest.high - latest.low;

        if (range > 0) {
          if (isLong) {
            // Close in upper 25% of candle range
            if ((latest.close - latest.low) / range >= 0.75) {
              entryScore += 5;
              reasons.push('Strong Bullish Close (top 25% of candle range)');
            }
            // Bullish engulfing
            if (latest.close > prev.high && latest.open <= prev.close) {
              entryScore += 5;
              reasons.push('Bullish Engulfing Candle Pattern');
            }
          } else if (isShort) {
            // Close in bottom 25% of candle range
            if ((latest.high - latest.close) / range >= 0.75) {
              entryScore += 5;
              reasons.push('Strong Bearish Close (bottom 25% of candle range)');
            }
            // Bearish engulfing
            if (latest.close < prev.low && latest.open >= prev.close) {
              entryScore += 5;
              reasons.push('Bearish Engulfing Candle Pattern');
            }
          }
        }
      }
      entryScore = Math.min(10, Math.max(0, entryScore));
      breakdown.entry = entryScore;

      // -----------------------------------------------------------------------
      // TOTAL SCORE & CLASSIFICATION
      // -----------------------------------------------------------------------
      const totalScore = trendScore + structureScore + momentumScore + volumeScore + liquidityScore + mtfScore + entryScore;

      let classification = 'NO_TRADE';
      let confidence = 'LOW';
      let isTradeEligible = false;
      let isAutoTradeEligible = false;

      if (totalScore >= 90) {
        classification = 'VERY_HIGH_CONFIDENCE';
        confidence = 'VERY HIGH';
        isTradeEligible = true;
        isAutoTradeEligible = true;
      } else if (totalScore >= 80) {
        classification = 'HIGH_CONFIDENCE';
        confidence = 'HIGH';
        isTradeEligible = true;
        isAutoTradeEligible = totalScore >= this.options.autoTradeMinScore;
      } else if (totalScore >= 70) {
        classification = 'MODERATE';
        confidence = 'MODERATE';
        isTradeEligible = totalScore >= this.options.defaultMinScore;
      } else if (totalScore >= 60) {
        classification = 'WEAK';
        confidence = 'WEAK';
      }

      return {
        score: totalScore,
        maxScore: 100,
        classification,
        confidence,
        isTradeEligible,
        isAutoTradeEligible,
        breakdown,
        reasons
      };
    }
  }

  return ScoringEngine;
}));
