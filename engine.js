/**
 * CRYPTO SCALPER PRO - QUANTITATIVE SIGNAL ENGINE
 * Exact mathematical and algorithmic implementation of Crypto Scalper Pro (Pine Script v6).
 * Computes: EMAs (9, 21, 200), VWAP, RSI (14), MACD (12, 26, 9), ATR (14), ADX/DMI (14),
 * Dynamic Swing High/Low Pivots, S/R Breakout & Retest, 8-Factor Confluence Scoring,
 * False Signal / Chop Filters, Market Regime Classification, SL/TP Targets, and Trailing Stop.
 */

let _MarketStructureEngine = typeof MarketStructureEngine !== 'undefined' ? MarketStructureEngine : null;
let _LiquidityEngine = typeof LiquidityEngine !== 'undefined' ? LiquidityEngine : null;
let _MtfEngine = typeof MtfEngine !== 'undefined' ? MtfEngine : null;
let _ScoringEngine = typeof ScoringEngine !== 'undefined' ? ScoringEngine : null;

if (typeof require !== 'undefined') {
  try {
    if (!_MarketStructureEngine) _MarketStructureEngine = require('./signals/marketStructure');
    if (!_LiquidityEngine) _LiquidityEngine = require('./signals/liquidityEngine');
    if (!_MtfEngine) _MtfEngine = require('./signals/mtfEngine');
    if (!_ScoringEngine) _ScoringEngine = require('./signals/scoringEngine');
  } catch (e) {
    // Graceful fallback for various run environments
  }
}

class ScalperEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      fastEmaLen: 9,
      slowEmaLen: 21,
      trendEmaLen: 200,
      use200EmaFilter: true,
      useVwapFilter: true,
      
      rsiLen: 14,
      rsiOverbought: 70.0,
      rsiOversold: 30.0,
      
      macdFastLen: 12,
      macdSlowLen: 26,
      macdSignalLen: 9,
      
      volSmaLen: 20,
      volMultiplier: 1.1,
      
      atrLen: 14,
      minAtrMult: 0.75,
      
      adxLen: 14,
      adxThresh: 20.0,
      filterLiquidationSpikes: true,
      
      pivotLookback: 5,
      breakoutAtrFrac: 0.15,
      enableRetestDetection: true,
      
      enableMtf: true,
      htfTimeframe: '5m',
      htfEmaLen: 50,
      
      minBuyScore: 6,
      minSellScore: 6,
      autoTradeMinScore: 85,
      signalCooldown: 4,
      
      slMethod: 'ATR', // 'ATR' or 'SWING'
      atrSlMult: 1.5,
      swingBars: 7,
      tp1RMult: 1.0,
      tp2RMult: 2.0,
      tp3RMult: 3.0,
      minAcceptableRR: 1.2,
      enableTrailing: true,
      trailAtrMult: 1.5
    }, options);

    // Instantiate sub-engines
    const MSE = _MarketStructureEngine || (typeof window !== 'undefined' ? window.MarketStructureEngine : null);
    const LE = _LiquidityEngine || (typeof window !== 'undefined' ? window.LiquidityEngine : null);
    const ME = _MtfEngine || (typeof window !== 'undefined' ? window.MtfEngine : null);
    const SE = _ScoringEngine || (typeof window !== 'undefined' ? window.ScoringEngine : null);

    this.structureEngine = MSE ? new MSE({ pivotLookback: this.options.pivotLookback }) : null;
    this.liquidityEngine = LE ? new LE() : null;
    this.mtfEngine = ME || null;
    this.scoringEngine = SE ? new SE({ autoTradeMinScore: this.options.autoTradeMinScore }) : null;

    this.resetState();
  }

  resetState() {
    this.lastSignalBar = -100;
    this.activeDirection = 0; // 1 = Long, -1 = Short, 0 = Flat
    this.activeTrade = null;
    this.lastHighWaterMark = null;
    this.lastLowWaterMark = null;
    this.pendingBullRetest = false;
    this.pendingBearRetest = false;
    this.lastBreakoutBar = -100;
    this.lastBreakoutLevel = null;
  }

  updateSettings(newOptions) {
    this.options = Object.assign(this.options, newOptions);
  }

  // --- Math Utilities ---
  static calcSMA(values, length) {
    const res = new Array(values.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= length) sum -= values[i - length];
      if (i >= length - 1) res[i] = sum / length;
    }
    return res;
  }

  static calcEMA(values, length) {
    const res = new Array(values.length).fill(NaN);
    if (values.length < length) return res;
    const k = 2 / (length + 1);
    let sum = 0;
    for (let i = 0; i < length; i++) sum += values[i];
    let ema = sum / length;
    res[length - 1] = ema;
    for (let i = length; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
      res[i] = ema;
    }
    return res;
  }

  static calcRMA(values, length) {
    const res = new Array(values.length).fill(NaN);
    if (values.length < length) return res;
    const alpha = 1 / length;
    let sum = 0;
    for (let i = 0; i < length; i++) sum += values[i];
    let rma = sum / length;
    res[length - 1] = rma;
    for (let i = length; i < values.length; i++) {
      rma = alpha * values[i] + (1 - alpha) * rma;
      res[i] = rma;
    }
    return res;
  }

  static calcRSI(closes, length = 14) {
    const res = new Array(closes.length).fill(NaN);
    if (closes.length <= length) return res;
    const gains = new Array(closes.length).fill(0);
    const losses = new Array(closes.length).fill(0);
    for (let i = 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains[i] = diff;
      else losses[i] = -diff;
    }
    const avgGain = ScalperEngine.calcRMA(gains, length);
    const avgLoss = ScalperEngine.calcRMA(losses, length);
    for (let i = length; i < closes.length; i++) {
      if (isNaN(avgGain[i]) || isNaN(avgLoss[i])) continue;
      if (avgLoss[i] === 0) {
        res[i] = 100;
      } else {
        const rs = avgGain[i] / avgLoss[i];
        res[i] = 100 - (100 / (1 + rs));
      }
    }
    return res;
  }

  static calcMACD(closes, fastLen = 12, slowLen = 26, signalLen = 9) {
    const fastEma = ScalperEngine.calcEMA(closes, fastLen);
    const slowEma = ScalperEngine.calcEMA(closes, slowLen);
    const macdLine = new Array(closes.length).fill(NaN);
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(fastEma[i]) && !isNaN(slowEma[i])) {
        macdLine[i] = fastEma[i] - slowEma[i];
      }
    }
    // Filter non-NaN for signal EMA calculation
    const validStart = slowLen - 1;
    const validMacd = macdLine.slice(validStart);
    const validSignal = ScalperEngine.calcEMA(validMacd, signalLen);
    const signalLine = new Array(closes.length).fill(NaN);
    for (let i = 0; i < validSignal.length; i++) {
      signalLine[validStart + i] = validSignal[i];
    }
    const histogram = new Array(closes.length).fill(NaN);
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
        histogram[i] = macdLine[i] - signalLine[i];
      }
    }
    return { macdLine, signalLine, histogram };
  }

  static calcATR(highs, lows, closes, length = 14) {
    const tr = new Array(closes.length).fill(0);
    tr[0] = highs[0] - lows[0];
    for (let i = 1; i < closes.length; i++) {
      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      tr[i] = Math.max(hl, hc, lc);
    }
    return ScalperEngine.calcRMA(tr, length);
  }

  static calcADX(highs, lows, closes, length = 14) {
    const n = closes.length;
    const adx = new Array(n).fill(NaN);
    const plusDI = new Array(n).fill(NaN);
    const minusDI = new Array(n).fill(NaN);
    if (n <= length * 2) return { adx, plusDI, minusDI };

    const tr = new Array(n).fill(0);
    const plusDM = new Array(n).fill(0);
    const minusDM = new Array(n).fill(0);

    tr[0] = highs[0] - lows[0];
    for (let i = 1; i < n; i++) {
      const up = highs[i] - highs[i - 1];
      const down = lows[i - 1] - lows[i];
      plusDM[i] = (up > down && up > 0) ? up : 0;
      minusDM[i] = (down > up && down > 0) ? down : 0;

      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      tr[i] = Math.max(hl, hc, lc);
    }

    const trSmoothed = ScalperEngine.calcRMA(tr, length);
    const plusDMSmoothed = ScalperEngine.calcRMA(plusDM, length);
    const minusDMSmoothed = ScalperEngine.calcRMA(minusDM, length);

    const dx = new Array(n).fill(NaN);
    for (let i = length - 1; i < n; i++) {
      if (trSmoothed[i] > 0) {
        plusDI[i] = (plusDMSmoothed[i] / trSmoothed[i]) * 100;
        minusDI[i] = (minusDMSmoothed[i] / trSmoothed[i]) * 100;
        const sum = plusDI[i] + minusDI[i];
        dx[i] = sum > 0 ? (Math.abs(plusDI[i] - minusDI[i]) / sum) * 100 : 0;
      }
    }

    // ADX is RMA of DX
    const validStart = length - 1;
    const validDx = dx.slice(validStart);
    const validAdx = ScalperEngine.calcRMA(validDx, length);
    for (let i = 0; i < validAdx.length; i++) {
      adx[validStart + i] = validAdx[i];
    }

    return { adx, plusDI, minusDI };
  }

  static calcVWAP(bars) {
    const vwap = new Array(bars.length).fill(NaN);
    let cumVol = 0;
    let cumTypicalVol = 0;
    let currentDay = null;

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const barDate = new Date(bar.time * 1000).getUTCDate();

      // Reset on new UTC day for session VWAP
      if (currentDay !== barDate) {
        currentDay = barDate;
        cumVol = 0;
        cumTypicalVol = 0;
      }

      const typicalPrice = (bar.high + bar.low + bar.close) / 3;
      cumTypicalVol += typicalPrice * bar.volume;
      cumVol += bar.volume;

      vwap[i] = cumVol > 0 ? cumTypicalVol / cumVol : typicalPrice;
    }
    return vwap;
  }

  static calcPivots(highs, lows, lookback = 5) {
    const pivotHighs = new Array(highs.length).fill(NaN);
    const pivotLows = new Array(lows.length).fill(NaN);

    for (let i = lookback; i < highs.length - lookback; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= lookback; j++) {
        if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
        if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
      }
      if (isHigh) pivotHighs[i] = highs[i];
      if (isLow) pivotLows[i] = lows[i];
    }
    return { pivotHighs, pivotLows };
  }

  /**
   * Run the complete multi-factor analysis on historical + live bars.
   * @param {Array} bars Array of { time, open, high, low, close, volume }
   * @param {Array} htfBars Optional array of higher timeframe closed bars for MTF trend
   * @returns {Object} Comprehensive analysis state including telemetry, HUD, and latest signals.
   */
  analyze(bars, htfBars = null) {
    if (!bars || bars.length < 50) return null;

    const n = bars.length;
    const closes = bars.map(b => b.close);
    const opens = bars.map(b => b.open);
    const highs = bars.map(b => b.high);
    const lows = bars.map(b => b.low);
    const volumes = bars.map(b => b.volume);

    // Indicator vectors
    const fastEma = ScalperEngine.calcEMA(closes, this.options.fastEmaLen);
    const slowEma = ScalperEngine.calcEMA(closes, this.options.slowEmaLen);
    const trendEma = ScalperEngine.calcEMA(closes, this.options.trendEmaLen);
    const vwap = ScalperEngine.calcVWAP(bars);
    const rsi = ScalperEngine.calcRSI(closes, this.options.rsiLen);
    const rsiMa = ScalperEngine.calcSMA(rsi, 9);
    const { macdLine, signalLine, histogram } = ScalperEngine.calcMACD(
      closes, this.options.macdFastLen, this.options.macdSlowLen, this.options.macdSignalLen
    );
    const atr = ScalperEngine.calcATR(highs, lows, closes, this.options.atrLen);
    const atrSma = ScalperEngine.calcSMA(atr, 20);
    const volSma = ScalperEngine.calcSMA(volumes, this.options.volSmaLen);
    const { adx, plusDI, minusDI } = ScalperEngine.calcADX(highs, lows, closes, this.options.adxLen);
    const { pivotHighs, pivotLows } = ScalperEngine.calcPivots(highs, lows, this.options.pivotLookback);

    // HTF Trend Analysis
    let htfBullish = true;
    let htfBearish = true;
    if (this.options.enableMtf && htfBars && htfBars.length >= this.options.htfEmaLen) {
      const htfCloses = htfBars.map(b => b.close);
      const htfEma = ScalperEngine.calcEMA(htfCloses, this.options.htfEmaLen);
      const lastHtfClose = htfCloses[htfCloses.length - 1];
      const lastHtfEma = htfEma[htfEma.length - 1];
      htfBullish = !isNaN(lastHtfEma) && lastHtfClose > lastHtfEma;
      htfBearish = !isNaN(lastHtfEma) && lastHtfClose < lastHtfEma;
    }

    // Historical signal loop to build state without repainting
    const signals = [];
    let lastPivotHigh = null;
    let lastPivotLow = null;
    let lastPivotHighBar = 0;
    let lastPivotLowBar = 0;
    let activeDirection = 0;
    let lastSignalBar = -100;
    let activeTrade = null;
    let highWater = 0;
    let lowWater = Infinity;

    // Enhanced Institutional Market Structure & Liquidity Analysis
    let marketStructureResult = null;
    let liquiditySweepResult = null;
    if (this.structureEngine) {
      marketStructureResult = this.structureEngine.analyze(bars);
    }
    if (this.liquidityEngine) {
      liquiditySweepResult = this.liquidityEngine.detectSweep(bars, marketStructureResult);
    }

    for (let i = 25; i < n; i++) {
      const bar = bars[i];
      const prevBar = bars[i - 1];
      const curClose = closes[i];
      const curOpen = opens[i];
      const curHigh = highs[i];
      const curLow = lows[i];
      const curVol = volumes[i];
      const curAtr = atr[i] || (curHigh - curLow);
      const curAtrSma = atrSma[i] || curAtr;
      const curFastEma = fastEma[i];
      const curSlowEma = slowEma[i];
      const curTrendEma = trendEma[i];
      const curVwap = vwap[i];
      const curRsi = rsi[i];
      const curRsiMa = rsiMa[i];
      const curMacd = macdLine[i];
      const curSig = signalLine[i];
      const curHist = histogram[i];
      const prevHist = histogram[i - 1];
      const curAdx = adx[i];
      const curVolSma = volSma[i];

      // Update confirmed pivots
      const pivotIndex = i - this.options.pivotLookback;
      if (pivotIndex >= 0) {
        if (!isNaN(pivotHighs[pivotIndex])) {
          lastPivotHigh = pivotHighs[pivotIndex];
          lastPivotHighBar = pivotIndex;
        }
        if (!isNaN(pivotLows[pivotIndex])) {
          lastPivotLow = pivotLows[pivotIndex];
          lastPivotLowBar = pivotIndex;
        }
      }

      // Candle structure
      const candleRange = curHigh - curLow;
      const candleBody = Math.abs(curClose - curOpen);
      const isBullCandle = curClose > curOpen && (candleBody >= candleRange * 0.55);
      const isBearCandle = curClose < curOpen && (candleBody >= candleRange * 0.55);
      const isTinyCandle = candleBody <= (candleRange * 0.20) || candleRange < (curAtr * 0.25);
      const isLiquidationWick = candleRange > (curAtr * 3.5);

      // Breakouts
      const isBullBreakout = lastPivotHigh && (curClose > lastPivotHigh + (curAtr * this.options.breakoutAtrFrac)) && (prevBar.close <= lastPivotHigh);
      const isBearBreakout = lastPivotLow && (curClose < lastPivotLow - (curAtr * this.options.breakoutAtrFrac)) && (prevBar.close >= lastPivotLow);

      if (isBullBreakout) {
        this.pendingBullRetest = true;
        this.lastBreakoutLevel = lastPivotHigh;
        this.lastBreakoutBar = i;
      }
      if (isBearBreakout) {
        this.pendingBearRetest = true;
        this.lastBreakoutLevel = lastPivotLow;
        this.lastBreakoutBar = i;
      }

      // Retest logic
      let bullRetest = false;
      let bearRetest = false;
      if (this.options.enableRetestDetection && this.pendingBullRetest && this.lastBreakoutLevel) {
        if (curLow <= this.lastBreakoutLevel + (curAtr * 0.2) && curClose > this.lastBreakoutLevel && isBullCandle) {
          bullRetest = true;
          this.pendingBullRetest = false;
        }
      }
      if (this.options.enableRetestDetection && this.pendingBearRetest && this.lastBreakoutLevel) {
        if (curHigh >= this.lastBreakoutLevel - (curAtr * 0.2) && curClose < this.lastBreakoutLevel && isBearCandle) {
          bearRetest = true;
          this.pendingBearRetest = false;
        }
      }

      if (i - this.lastBreakoutBar > 15) {
        this.pendingBullRetest = false;
        this.pendingBearRetest = false;
      }

      // False signal filters
      const isAtrValid = curAtr >= (curAtrSma * this.options.minAtrMult);
      const isEmaCompressed = Math.abs(curFastEma - curSlowEma) / curClose < 0.0008;
      const isRsiDeadZone = curRsi >= 46.0 && curRsi <= 54.0;
      const isMarketChoppy = (curAdx < this.options.adxThresh) || isEmaCompressed;
      const isWickTrap = this.options.filterLiquidationSpikes && isLiquidationWick;
      const isMarketTradeable = isAtrValid && !isMarketChoppy && !isWickTrap && !isTinyCandle;

      // 8-Factor Bullish Scoring (0 - 8)
      let bScore = 0;
      const bFactors = {};
      bFactors.trend = curFastEma > curSlowEma; if (bFactors.trend) bScore++;
      bFactors.macro = !this.options.use200EmaFilter || isNaN(curTrendEma) || curClose > curTrendEma; if (bFactors.macro) bScore++;
      bFactors.rsi = curRsi > 51.0 && curRsi < this.options.rsiOverbought && curRsi > (curRsiMa || 50); if (bFactors.rsi) bScore++;
      bFactors.macd = curMacd > curSig && (curHist > 0 || (curHist - prevHist) > 0); if (bFactors.macd) bScore++;
      const isVolHigh = curVol >= (curVolSma * this.options.volMultiplier);
      const isVolExpanding = curVol > prevBar.volume && prevBar.volume > bars[i - 2].volume;
      bFactors.vol = isVolHigh || isVolExpanding; if (bFactors.vol) bScore++;
      bFactors.vwap = !this.options.useVwapFilter || curClose > curVwap; if (bFactors.vwap) bScore++;
      bFactors.pa = isBullCandle && curClose > Math.max(curOpen, prevBar.close); if (bFactors.pa) bScore++;
      bFactors.breakout = isBullBreakout || bullRetest || curClose > curFastEma * 1.001; if (bFactors.breakout) bScore++;

      // 8-Factor Bearish Scoring (0 - 8)
      let sScore = 0;
      const sFactors = {};
      sFactors.trend = curFastEma < curSlowEma; if (sFactors.trend) sScore++;
      sFactors.macro = !this.options.use200EmaFilter || isNaN(curTrendEma) || curClose < curTrendEma; if (sFactors.macro) sScore++;
      sFactors.rsi = curRsi < 49.0 && curRsi > this.options.rsiOversold && curRsi < (curRsiMa || 50); if (sFactors.rsi) sScore++;
      sFactors.macd = curMacd < curSig && (curHist < 0 || (curHist - prevHist) < 0); if (sFactors.macd) sScore++;
      sFactors.vol = isVolHigh || isVolExpanding; if (sFactors.vol) sScore++;
      sFactors.vwap = !this.options.useVwapFilter || curClose < curVwap; if (sFactors.vwap) sScore++;
      sFactors.pa = isBearCandle && curClose < Math.min(curOpen, prevBar.close); if (sFactors.pa) sScore++;
      sFactors.breakout = isBearBreakout || bearRetest || curClose < curFastEma * 0.999; if (sFactors.breakout) sScore++;

      // Stop Loss calculations
      let longSl, shortSl;
      if (this.options.slMethod === 'ATR') {
        longSl = curClose - (curAtr * this.options.atrSlMult);
        shortSl = curClose + (curAtr * this.options.atrSlMult);
      } else {
        const lookbackLow = Math.min(...lows.slice(Math.max(0, i - this.options.swingBars), i + 1));
        const lookbackHigh = Math.max(...highs.slice(Math.max(0, i - this.options.swingBars), i + 1));
        longSl = Math.min(curClose - (curAtr * 0.5), lookbackLow);
        shortSl = Math.max(curClose + (curAtr * 0.5), lookbackHigh);
      }

      const longRiskDist = curClose - longSl;
      const longTp2 = curClose + (longRiskDist * this.options.tp2RMult);
      const longRR = longRiskDist > 0 ? (longTp2 - curClose) / longRiskDist : 0;

      const shortRiskDist = shortSl - curClose;
      const shortTp2 = curClose - (shortRiskDist * this.options.tp2RMult);
      const shortRR = shortRiskDist > 0 ? (curClose - shortTp2) / shortRiskDist : 0;

      // Trailing Stop Management for open trade
      if (this.options.enableTrailing && activeTrade) {
        if (activeTrade.direction === 1) {
          if (curHigh > highWater) highWater = curHigh;
          const candidateTrail = highWater - (curAtr * this.options.trailAtrMult);
          if (candidateTrail > activeTrade.trail) activeTrade.trail = candidateTrail;
        } else if (activeTrade.direction === -1) {
          if (curLow < lowWater) lowWater = curLow;
          const candidateTrail = lowWater + (curAtr * this.options.trailAtrMult);
          if (candidateTrail < activeTrade.trail) activeTrade.trail = candidateTrail;
        }
      }

      // Check Exits for active trade
      let exitSignal = null;
      if (activeTrade) {
        const effectiveSl = this.options.enableTrailing ? 
          (activeTrade.direction === 1 ? Math.max(activeTrade.sl, activeTrade.trail) : Math.min(activeTrade.sl, activeTrade.trail)) : 
          activeTrade.sl;

        if (activeTrade.direction === 1) {
          if (curLow <= effectiveSl) {
            exitSignal = { type: 'EXIT_LONG', reason: 'STOP LOSS / TRAIL HIT', price: effectiveSl, barIndex: i, time: bar.time };
          } else if (curHigh >= activeTrade.tp3) {
            exitSignal = { type: 'EXIT_LONG', reason: 'MAX TP3 REACHED', price: activeTrade.tp3, barIndex: i, time: bar.time };
          } else if (curFastEma < curSlowEma && curRsi < 42.0) {
            exitSignal = { type: 'EXIT_LONG', reason: 'MOMENTUM FAILURE', price: curClose, barIndex: i, time: bar.time };
          }
        } else if (activeTrade.direction === -1) {
          if (curHigh >= effectiveSl) {
            exitSignal = { type: 'EXIT_SHORT', reason: 'STOP LOSS / TRAIL HIT', price: effectiveSl, barIndex: i, time: bar.time };
          } else if (curLow <= activeTrade.tp3) {
            exitSignal = { type: 'EXIT_SHORT', reason: 'MAX TP3 REACHED', price: activeTrade.tp3, barIndex: i, time: bar.time };
          } else if (curFastEma > curSlowEma && curRsi > 58.0) {
            exitSignal = { type: 'EXIT_SHORT', reason: 'MOMENTUM FAILURE', price: curClose, barIndex: i, time: bar.time };
          }
        }

        if (exitSignal) {
          signals.push(exitSignal);
          activeTrade = null;
          activeDirection = 0;
        }
      }

      // Cooldown check
      const barsSinceLast = i - lastSignalBar;

      // BUY Signal Evaluation
      let bScore100 = Math.round((bScore / 8) * 100);
      let bScoreDetails = null;
      if (this.scoringEngine) {
        bScoreDetails = this.scoringEngine.evaluate({
          side: 'BUY',
          price: curClose,
          candles: bars.slice(0, i + 1),
          emas: { ema20: curFastEma, ema50: curSlowEma, ema200: curTrendEma },
          vwap: curVwap,
          rsi: curRsi,
          macd: { macd: curMacd, signal: curSig, hist: curHist },
          adx: curAdx,
          volume: curVol,
          volSma: curVolSma,
          marketStructure: marketStructureResult,
          liquiditySweep: liquiditySweepResult,
          mtfAlignment: { score: htfBullish ? 8 : 2, reasons: htfBullish ? ['Multi-timeframe trend aligns Bullish'] : [] }
        });
        bScore100 = bScoreDetails.score;
      }

      const rawBuy = isMarketTradeable && htfBullish && (bScore >= this.options.minBuyScore) && (longRR >= this.options.minAcceptableRR);
      const validBuy = rawBuy && (barsSinceLast >= this.options.signalCooldown) && (activeDirection !== 1);

      if (validBuy) {
        activeDirection = 1;
        lastSignalBar = i;
        highWater = curHigh;
        activeTrade = {
          direction: 1,
          entryPrice: curClose,
          sl: longSl,
          tp1: curClose + (longRiskDist * this.options.tp1RMult),
          tp2: curClose + (longRiskDist * this.options.tp2RMult),
          tp3: curClose + (longRiskDist * this.options.tp3RMult),
          trail: longSl,
          score: bScore,
          score100: bScore100,
          strengthPct: bScore100,
          grade: ScalperEngine.getGrade(bScore),
          classification: bScoreDetails ? bScoreDetails.classification : (bScore100 >= 85 ? 'HIGH_CONFIDENCE' : 'MODERATE'),
          barIndex: i,
          time: bar.time,
          factors: bFactors,
          breakdown: bScoreDetails ? bScoreDetails.breakdown : null,
          reasons: bScoreDetails ? bScoreDetails.reasons : ['High confluence buy signal']
        };
        signals.push(Object.assign({ type: 'BUY', price: curClose }, activeTrade));
      }

      // SELL Signal Evaluation
      let sScore100 = Math.round((sScore / 8) * 100);
      let sScoreDetails = null;
      if (this.scoringEngine) {
        sScoreDetails = this.scoringEngine.evaluate({
          side: 'SELL',
          price: curClose,
          candles: bars.slice(0, i + 1),
          emas: { ema20: curFastEma, ema50: curSlowEma, ema200: curTrendEma },
          vwap: curVwap,
          rsi: curRsi,
          macd: { macd: curMacd, signal: curSig, hist: curHist },
          adx: curAdx,
          volume: curVol,
          volSma: curVolSma,
          marketStructure: marketStructureResult,
          liquiditySweep: liquiditySweepResult,
          mtfAlignment: { score: htfBearish ? 8 : 2, reasons: htfBearish ? ['Multi-timeframe trend aligns Bearish'] : [] }
        });
        sScore100 = sScoreDetails.score;
      }

      const rawSell = isMarketTradeable && htfBearish && (sScore >= this.options.minSellScore) && (shortRR >= this.options.minAcceptableRR);
      const validSell = rawSell && (barsSinceLast >= this.options.signalCooldown) && (activeDirection !== -1);

      if (validSell) {
        activeDirection = -1;
        lastSignalBar = i;
        lowWater = curLow;
        activeTrade = {
          direction: -1,
          entryPrice: curClose,
          sl: shortSl,
          tp1: curClose - (shortRiskDist * this.options.tp1RMult),
          tp2: curClose - (shortRiskDist * this.options.tp2RMult),
          tp3: curClose - (shortRiskDist * this.options.tp3RMult),
          trail: shortSl,
          score: sScore,
          score100: sScore100,
          strengthPct: sScore100,
          grade: ScalperEngine.getGrade(sScore),
          classification: sScoreDetails ? sScoreDetails.classification : (sScore100 >= 85 ? 'HIGH_CONFIDENCE' : 'MODERATE'),
          barIndex: i,
          time: bar.time,
          factors: sFactors,
          breakdown: sScoreDetails ? sScoreDetails.breakdown : null,
          reasons: sScoreDetails ? sScoreDetails.reasons : ['High confluence sell signal']
        };
        signals.push(Object.assign({ type: 'SELL', price: curClose }, activeTrade));
      }
    }

    // Market Regime for latest bar
    const lastIdx = n - 1;
    const latestAtr = atr[lastIdx];
    const latestAtrSma = atrSma[lastIdx];
    const latestAdx = adx[lastIdx];
    const latestRsi = rsi[lastIdx];
    const latestClose = closes[lastIdx];
    const latestFast = fastEma[lastIdx];
    const latestSlow = slowEma[lastIdx];
    const latestTrend = trendEma[lastIdx];
    const latestVol = volumes[lastIdx];
    const latestVolSma = volSma[lastIdx];
    const latestRange = highs[lastIdx] - lows[lastIdx];

    let marketRegime = 'NEUTRAL';
    let regimeColor = '#787b86';

    const isDeadAtr = latestAtr < (latestAtrSma * this.options.minAtrMult);
    const isWickSpike = this.options.filterLiquidationSpikes && (latestRange > latestAtr * 3.5);
    const isChoppy = (latestAdx < this.options.adxThresh) || (Math.abs(latestFast - latestSlow) / latestClose < 0.0008);

    if (isDeadAtr || isWickSpike) {
      marketRegime = 'NO TRADE';
      regimeColor = '#f23645';
    } else if (isChoppy || (latestRsi >= 46 && latestRsi <= 54)) {
      marketRegime = 'NEUTRAL';
      regimeColor = '#787b86';
    } else if (latestClose > latestTrend && latestFast > latestSlow && latestAdx >= 25.0 && latestRsi > 56.0) {
      marketRegime = 'STRONG BULLISH';
      regimeColor = '#00e676';
    } else if (latestClose > latestTrend && latestFast > latestSlow) {
      marketRegime = 'BULLISH';
      regimeColor = '#089981';
    } else if (latestClose < latestTrend && latestFast < latestSlow && latestAdx >= 25.0 && latestRsi < 44.0) {
      marketRegime = 'STRONG BEARISH';
      regimeColor = '#d50000';
    } else if (latestClose < latestTrend && latestFast < latestSlow) {
      marketRegime = 'BEARISH';
      regimeColor = '#f23645';
    }

    // Latest 100-Point Confluence Evaluation
    let latest100Details = null;
    if (this.scoringEngine) {
      const candidateSide = latestFast >= latestSlow ? 'BUY' : 'SELL';
      latest100Details = this.scoringEngine.evaluate({
        side: candidateSide,
        price: latestClose,
        candles: bars,
        emas: { ema20: latestFast, ema50: latestSlow, ema200: latestTrend },
        vwap: vwap[lastIdx],
        rsi: latestRsi,
        macd: { macd: macdLine[lastIdx], signal: signalLine[lastIdx], hist: histogram[lastIdx] },
        adx: latestAdx,
        volume: latestVol,
        volSma: latestVolSma,
        marketStructure: marketStructureResult,
        liquiditySweep: liquiditySweepResult,
        mtfAlignment: { score: htfBullish ? 8 : (htfBearish ? 8 : 4), reasons: [] }
      });
    }

    return {
      vectors: {
        fastEma,
        slowEma,
        trendEma,
        vwap,
        rsi,
        macdLine,
        signalLine,
        histogram,
        atr,
        adx,
        pivotHighs,
        pivotLows
      },
      signals,
      latest: {
        price: latestClose,
        regime: marketRegime,
        regimeColor,
        adx: latestAdx,
        atr: latestAtr,
        rsi: latestRsi,
        isVolHigh: latestVol >= (latestVolSma * this.options.volMultiplier),
        htfBullish,
        htfBearish,
        activeTrade,
        marketStructure: marketStructureResult,
        liquiditySweep: liquiditySweepResult,
        score100: latest100Details ? latest100Details.score : 0,
        classification100: latest100Details ? latest100Details.classification : 'NO_TRADE',
        reasons100: latest100Details ? latest100Details.reasons : []
      }
    };
  }

  static getGrade(score) {
    const pct = (score / 8) * 100;
    if (pct >= 85) return 'VERY STRONG';
    if (pct >= 70) return 'STRONG';
    if (pct >= 60) return 'MODERATE';
    return 'WEAK';
  }
}

// Export for module/browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScalperEngine;
}
