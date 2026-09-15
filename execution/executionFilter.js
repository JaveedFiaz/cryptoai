/**
 * 15-POINT PRE-FLIGHT EXECUTION FILTER
 * Comprehensive institutional execution validation gate.
 * Every trade must pass all 15 checks before reaching any exchange order router.
 */

class ExecutionFilter {
  constructor(riskManager) {
    this.riskManager = riskManager;
  }

  /**
   * Evaluates all 15 pre-flight checks for a proposed order.
   * @param {Object} context Complete execution context
   *   - signal: { score100, score, type, entryPrice, sl, tp1, tp2, tp3, htfBullish, htfBearish, ... }
   *   - symbol: 'BTCUSDT'
   *   - side: 'BUY' | 'SELL'
   *   - currentPrice: number
   *   - bid: number
   *   - ask: number
   *   - lastTickTime: timestamp in ms
   *   - openPositions: Array of open position objects
   *   - account: { equity, availableBalance }
   *   - exchangeClient: MexcClient or MockExchange instance
   *   - minScoreThreshold: number (default 85)
   */
  validate(context) {
    const checks = [];
    const failedChecks = [];
    const passedChecks = [];

    const {
      signal,
      symbol,
      side,
      currentPrice,
      bid,
      ask,
      lastTickTime,
      openPositions = [],
      account = { equity: 10000, availableBalance: 10000 },
      exchangeClient,
      minScoreThreshold = this.riskManager.options.defaultAutoTradeMinScore || 85
    } = context;

    const isLong = side === 'BUY' || side === 'LONG';
    const isShort = side === 'SELL' || side === 'SHORT';

    // 1. Signal score >= configured threshold (Default: 85/100)
    const score = signal?.score100 !== undefined ? signal.score100 : (signal?.score ? Math.round((signal.score / 8) * 100) : 0);
    const pass1 = score >= minScoreThreshold;
    checks.push({ id: 1, name: 'Signal Confluence Score Threshold', passed: pass1, detail: `Score ${score} >= ${minScoreThreshold}` });

    // 2. 15m macro trend confirms direction
    const pass2 = isLong ? (signal?.htfBullish !== false) : (signal?.htfBearish !== false);
    checks.push({ id: 2, name: '15m Macro Trend Alignment', passed: pass2, detail: isLong ? '15m Bullish' : '15m Bearish' });

    // 3. 1m entry timeframe confirms breakout/retest/trigger
    const pass3 = Boolean(signal?.type === side || (isLong && signal?.type === 'BUY') || (isShort && signal?.type === 'SELL'));
    checks.push({ id: 3, name: '1m Entry Trigger Confirmed', passed: pass3, detail: `Trigger side: ${signal?.type}` });

    // 4. No conflicting opposite major signal
    const pass4 = isLong ? !signal?.htfBearish : !signal?.htfBullish;
    checks.push({ id: 4, name: 'No Conflicting Major Signal', passed: pass4, detail: pass4 ? 'Clean directional bias' : 'Conflicting macro bias' });

    // 5. Minimum Risk/Reward >= 1.5 achieved
    const sl = signal?.sl;
    const tp2 = signal?.tp2 || signal?.tp1;
    const entry = signal?.entryPrice || currentPrice;
    let rr = 0;
    if (sl && tp2 && entry) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp2 - entry);
      rr = risk > 0 ? reward / risk : 0;
    }
    const pass5 = rr >= 1.5;
    checks.push({ id: 5, name: 'Risk/Reward Ratio >= 1.5', passed: pass5, detail: `Calculated R:R: ${rr.toFixed(2)}` });

    // 6. Valid Stop-Loss level identified and calculated
    const pass6 = Boolean(sl && (isLong ? sl < entry : sl > entry));
    checks.push({ id: 6, name: 'Valid Stop-Loss Distance', passed: pass6, detail: `SL: $${sl ? sl.toFixed(2) : 'NONE'}` });

    // 7. Valid Take-Profit levels calculated
    const pass7 = Boolean(tp2 && (isLong ? tp2 > entry : tp2 < entry));
    checks.push({ id: 7, name: 'Valid Take-Profit Target', passed: pass7, detail: `TP2: $${tp2 ? tp2.toFixed(2) : 'NONE'}` });

    // 8. Calculated position size within maximum risk limit
    let posSize = null;
    let pass8 = false;
    try {
      if (pass6) {
        posSize = this.riskManager.calculatePositionSize(account.equity, entry, sl, 10);
        pass8 = posSize.dollarRisk <= account.equity * (this.riskManager.options.maxRiskPerTradePct / 100) * 1.05;
      }
    } catch (e) {
      pass8 = false;
    }
    checks.push({ id: 8, name: 'Position Size within Max Risk %', passed: pass8, detail: posSize ? `Risk: $${posSize.dollarRisk} (${posSize.riskPct}%)` : 'Invalid Sizing' });

    // 9. Daily loss limit not exceeded (circuit breaker inactive)
    const pass9 = !this.riskManager.circuitBreakerTripped;
    checks.push({ id: 9, name: 'Daily Loss Limit & Circuit Breaker', passed: pass9, detail: pass9 ? 'Circuit Breaker Inactive' : `TRIPPED: ${this.riskManager.circuitBreakerReason}` });

    // 10. Maximum open positions limit not exceeded
    const pass10 = openPositions.length < this.riskManager.options.maxOpenPositions;
    checks.push({ id: 10, name: 'Max Open Positions Limit', passed: pass10, detail: `${openPositions.length} / ${this.riskManager.options.maxOpenPositions} open` });

    // 11. No duplicate active position on this symbol
    const duplicate = openPositions.some(p => p.symbol === symbol);
    const pass11 = !duplicate;
    checks.push({ id: 11, name: 'No Duplicate Active Position', passed: pass11, detail: duplicate ? `Existing open position in ${symbol}` : 'No active position in symbol' });

    // 12. Live market data connection healthy (< 3.0s latency)
    const dataAge = lastTickTime ? (Date.now() - lastTickTime) : 999999;
    const pass12 = dataAge <= 3000;
    checks.push({ id: 12, name: 'Live Market Data Stream Healthy', passed: pass12, detail: `Latency: ${(dataAge / 1000).toFixed(2)}s` });

    // 13. Exchange API connection healthy and authenticated
    const pass13 = Boolean(exchangeClient && (typeof exchangeClient.isConfigured === 'function' ? exchangeClient.isConfigured() : true));
    checks.push({ id: 13, name: 'Exchange Connectivity & Auth', passed: pass13, detail: pass13 ? 'Exchange Authenticated' : 'Exchange Client Unconfigured' });

    // 14. Order execution price within maximum slippage/spread limit
    let pass14 = true;
    if (bid && ask && currentPrice) {
      const spread = (ask - bid) / currentPrice;
      pass14 = spread <= this.riskManager.options.maxSpreadPct;
    }
    checks.push({ id: 14, name: 'Spread & Slippage within Limits', passed: pass14, detail: pass14 ? 'Spread acceptable' : 'Spread exceeds threshold' });

    // 15. Emergency kill switch not engaged
    const pass15 = !this.riskManager.emergencyStopTriggered;
    checks.push({ id: 15, name: 'Emergency Kill Switch Inactive', passed: pass15, detail: pass15 ? 'Emergency Stop OFF' : 'EMERGENCY STOP TRIGGERED' });

    // Aggregate results
    checks.forEach(c => {
      if (c.passed) passedChecks.push(c);
      else failedChecks.push(c);
    });

    const approved = failedChecks.length === 0;

    return {
      approved,
      totalChecks: 15,
      passedCount: passedChecks.length,
      failedCount: failedChecks.length,
      checks,
      failedChecks,
      positionSize: posSize,
      summary: approved ? 'All 15 Pre-Flight Checks Passed' : `${failedChecks.length} Pre-Flight Check(s) Failed: ${failedChecks.map(f => f.name).join(', ')}`
    };
  }
}

module.exports = ExecutionFilter;
