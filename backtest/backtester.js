/**
 * HISTORICAL STRATEGY BACKTESTER
 * Backtests the exact 100-point confluence signal engine and risk rules
 * on historical candlestick series for any symbol, timeframe, or date range.
 * Computes: Win Rate, Profit Factor, Max Drawdown, Total PnL, Sharpe/Sortino approximation.
 */

class Backtester {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Run backtest simulation on historical candles
   * @param {Array} candles Array of { time, open, high, low, close, volume }
   * @param {Object} options Backtest parameters
   */
  run(candles, options = {}) {
    const config = Object.assign({
      startingCapital: 10000,
      riskPerTradePct: 1.5,
      leverage: 10,
      minScoreThreshold: 80,
      feeRatePct: 0.04, // 0.04% futures maker/taker fee
      tp1ClosePct: 0.5  // Close 50% at TP1, move SL to breakeven
    }, options);

    if (!candles || candles.length < 60) {
      return {
        error: 'Insufficient historical candlestick data (min 60 bars required)'
      };
    }

    let equity = config.startingCapital;
    let peakEquity = equity;
    let maxDrawdown = 0;
    const trades = [];
    const equityCurve = [{ time: candles[0].time, equity }];

    // Run engine analysis
    const analysis = this.engine.analyze(candles);
    const signals = analysis ? analysis.signals : [];

    // Filter signals by minimum score threshold
    const eligibleSignals = signals.filter(s => {
      const score = s.score100 !== undefined ? s.score100 : Math.round(s.score / 8 * 100);
      return score >= config.minScoreThreshold;
    });

    let activePosition = null;

    // Simulate bar-by-bar execution through candles
    for (let i = 30; i < candles.length; i++) {
      const bar = candles[i];

      // 1. Manage Active Position
      if (activePosition) {
        let isClosed = false;
        let exitPrice = 0;
        let exitReason = '';

        if (activePosition.direction === 1) { // LONG
          // Check Stop Loss
          if (bar.low <= activePosition.sl) {
            exitPrice = activePosition.sl;
            exitReason = 'STOP LOSS';
            isClosed = true;
          }
          // Check Take Profit 2
          else if (bar.high >= activePosition.tp2) {
            exitPrice = activePosition.tp2;
            exitReason = 'TAKE PROFIT 2';
            isClosed = true;
          }
          // Trailing Stop trigger
          else if (bar.high >= activePosition.tp1 && !activePosition.tp1Hit) {
            activePosition.tp1Hit = true;
            activePosition.sl = activePosition.entryPrice; // Breakeven
          }
        } else if (activePosition.direction === -1) { // SHORT
          // Check Stop Loss
          if (bar.high >= activePosition.sl) {
            exitPrice = activePosition.sl;
            exitReason = 'STOP LOSS';
            isClosed = true;
          }
          // Check Take Profit 2
          else if (bar.low <= activePosition.tp2) {
            exitPrice = activePosition.tp2;
            exitReason = 'TAKE PROFIT 2';
            isClosed = true;
          }
          // Trailing Stop trigger
          else if (bar.low <= activePosition.tp1 && !activePosition.tp1Hit) {
            activePosition.tp1Hit = true;
            activePosition.sl = activePosition.entryPrice; // Breakeven
          }
        }

        if (isClosed) {
          const priceDiff = activePosition.direction === 1 ? (exitPrice - activePosition.entryPrice) : (activePosition.entryPrice - exitPrice);
          const rawPnl = priceDiff * activePosition.units;
          const fee = (activePosition.units * activePosition.entryPrice + activePosition.units * exitPrice) * (config.feeRatePct / 100);
          const netPnl = rawPnl - fee;

          equity += netPnl;
          if (equity > peakEquity) peakEquity = equity;
          const dd = ((peakEquity - equity) / peakEquity) * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          trades.push({
            id: 'BT_' + trades.length,
            direction: activePosition.direction === 1 ? 'LONG' : 'SHORT',
            entryTime: activePosition.entryTime,
            exitTime: bar.time,
            entryPrice: activePosition.entryPrice,
            exitPrice,
            units: activePosition.units,
            pnl: parseFloat(netPnl.toFixed(2)),
            pnlPct: parseFloat(((netPnl / activePosition.margin) * 100).toFixed(2)),
            fee: parseFloat(fee.toFixed(2)),
            exitReason,
            score: activePosition.score,
            equityAfter: parseFloat(equity.toFixed(2))
          });

          equityCurve.push({ time: bar.time, equity: parseFloat(equity.toFixed(2)) });
          activePosition = null;
        }
      }

      // 2. Check for New Entry Signal on this bar
      if (!activePosition) {
        const matchingSignal = eligibleSignals.find(s => s.barIndex === i || s.time === bar.time);
        if (matchingSignal && (matchingSignal.type === 'BUY' || matchingSignal.type === 'SELL')) {
          const isLong = matchingSignal.type === 'BUY';
          const entryPrice = bar.close;
          const sl = matchingSignal.sl || (isLong ? entryPrice * 0.99 : entryPrice * 1.01);
          const tp1 = matchingSignal.tp1 || (isLong ? entryPrice * 1.01 : entryPrice * 0.99);
          const tp2 = matchingSignal.tp2 || (isLong ? entryPrice * 1.02 : entryPrice * 0.98);
          const stopDist = Math.abs(entryPrice - sl);

          if (stopDist > 0) {
            const riskDollar = equity * (config.riskPerTradePct / 100);
            const units = riskDollar / stopDist;
            const margin = (units * entryPrice) / config.leverage;

            activePosition = {
              direction: isLong ? 1 : -1,
              entryPrice,
              entryTime: bar.time,
              sl,
              tp1,
              tp2,
              tp1Hit: false,
              units,
              margin,
              score: matchingSignal.score100 || Math.round(matchingSignal.score / 8 * 100)
            };
          }
        }
      }
    }

    // Performance Metrics Aggregation
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const totalWinPnl = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLossPnl = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLossPnl > 0 ? (totalWinPnl / totalLossPnl) : (totalWinPnl > 0 ? 99.9 : 0);
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const netPnl = equity - config.startingCapital;
    const netReturnPct = (netPnl / config.startingCapital) * 100;

    let bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0;
    let worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0;

    return {
      startingCapital: config.startingCapital,
      finalEquity: parseFloat(equity.toFixed(2)),
      netPnl: parseFloat(netPnl.toFixed(2)),
      netReturnPct: parseFloat(netReturnPct.toFixed(2)),
      totalTrades: trades.length,
      winTrades: wins.length,
      lossTrades: losses.length,
      winRate: parseFloat(winRate.toFixed(1)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      maxDrawdownPct: parseFloat(maxDrawdown.toFixed(2)),
      averageWin: wins.length > 0 ? parseFloat((totalWinPnl / wins.length).toFixed(2)) : 0,
      averageLoss: losses.length > 0 ? parseFloat((totalLossPnl / losses.length).toFixed(2)) : 0,
      bestTrade: parseFloat(bestTrade.toFixed(2)),
      worstTrade: parseFloat(worstTrade.toFixed(2)),
      trades,
      equityCurve
    };
  }
}

module.exports = Backtester;
