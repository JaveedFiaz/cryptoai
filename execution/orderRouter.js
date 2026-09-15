/**
 * ORDER ROUTER & DUAL EXECUTION CONTROLLER
 * Routes trade orders to either Paper Trading or MEXC Real Exchange
 * Enforces pre-flight filter validation and logs audit history.
 */

class OrderRouter {
  constructor(options = {}) {
    this.mode = options.mode || 'PAPER'; // 'PAPER' or 'MEXC_REAL'
    this.paperBroker = options.paperBroker;
    this.mexcClient = options.mexcClient;
    this.mockExchange = options.mockExchange;
    this.executionFilter = options.executionFilter;
    this.riskManager = options.riskManager;
    this.auditLogs = [];
  }

  setMode(mode) {
    if (mode !== 'PAPER' && mode !== 'MEXC_REAL') {
      throw new Error(`Invalid trading mode: ${mode}. Must be PAPER or MEXC_REAL.`);
    }
    this.mode = mode;
    return { success: true, mode: this.mode };
  }

  getActiveBroker() {
    if (this.mode === 'MEXC_REAL') {
      if (this.mexcClient && this.mexcClient.isConfigured()) {
        return this.mexcClient;
      }
      // Fallback to mock exchange if MEXC is unconfigured
      return this.mockExchange;
    }
    return this.paperBroker;
  }

  /**
   * Routes and executes an order through the 15-point pre-flight validation gate
   */
  async routeOrder(orderContext) {
    const {
      signal,
      symbol,
      side,
      currentPrice,
      bid,
      ask,
      lastTickTime,
      openPositions,
      account,
      leverage = 10,
      isAutoTrade = false
    } = orderContext;

    const activeBroker = this.getActiveBroker();

    // Run 15-point pre-flight validation
    const validation = this.executionFilter.validate({
      signal,
      symbol,
      side,
      currentPrice,
      bid,
      ask,
      lastTickTime,
      openPositions,
      account,
      exchangeClient: activeBroker,
      minScoreThreshold: this.riskManager.options.defaultAutoTradeMinScore
    });

    const auditEntry = {
      id: 'AUDIT_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      time: Date.now(),
      symbol,
      side,
      mode: this.mode,
      isAutoTrade,
      score: signal?.score100 || (signal?.score ? Math.round(signal.score / 8 * 100) : 0),
      passedChecks: validation.passedCount,
      failedChecks: validation.failedCount,
      approved: validation.approved,
      summary: validation.summary,
      failedList: validation.failedChecks.map(f => f.name)
    };

    if (!validation.approved) {
      auditEntry.status = 'REJECTED';
      this.auditLogs.unshift(auditEntry);
      if (this.auditLogs.length > 200) this.auditLogs.pop();
      return {
        success: false,
        status: 'REJECTED',
        validation,
        auditEntry
      };
    }

    // Determine quantity/vol from calculated position size
    const posSize = validation.positionSize;
    const quantity = posSize?.units || (account?.equity * 0.05 / currentPrice);

    try {
      let executionResult;

      if (this.mode === 'MEXC_REAL' && this.mexcClient && this.mexcClient.isConfigured()) {
        // Execute real order on MEXC
        executionResult = await this.mexcClient.submitOrder({
          symbol,
          side: side === 'BUY' ? 'OPEN_LONG' : 'OPEN_SHORT',
          type: 'MARKET',
          vol: quantity,
          price: currentPrice,
          leverage,
          stopLoss: signal?.sl,
          takeProfit: signal?.tp2 || signal?.tp1
        });
      } else if (this.mode === 'MEXC_REAL' && this.mockExchange) {
        // Mock exchange execution
        executionResult = await this.mockExchange.submitOrder({
          symbol,
          side: side === 'BUY' ? 'OPEN_LONG' : 'OPEN_SHORT',
          type: 'MARKET',
          vol: quantity,
          price: currentPrice,
          leverage,
          stopLoss: signal?.sl,
          takeProfit: signal?.tp2 || signal?.tp1
        });
      } else if (this.paperBroker) {
        // Paper trading engine
        executionResult = this.paperBroker.placeOrder({
          symbol,
          side,
          type: 'MARKET',
          quantity,
          leverage,
          stopLoss: signal?.sl,
          takeProfit: signal?.tp2 || signal?.tp1
        });
      }

      auditEntry.status = 'EXECUTED';
      auditEntry.execution = executionResult;
      this.auditLogs.unshift(auditEntry);
      if (this.auditLogs.length > 200) this.auditLogs.pop();

      return {
        success: true,
        status: 'EXECUTED',
        mode: this.mode,
        validation,
        executionResult,
        auditEntry
      };
    } catch (err) {
      auditEntry.status = 'EXECUTION_ERROR';
      auditEntry.error = err.message;
      this.auditLogs.unshift(auditEntry);
      if (this.auditLogs.length > 200) this.auditLogs.pop();

      return {
        success: false,
        status: 'EXECUTION_ERROR',
        error: err.message,
        validation,
        auditEntry
      };
    }
  }

  getAuditLogs(limit = 50) {
    return this.auditLogs.slice(0, limit);
  }
}

module.exports = OrderRouter;
