/**
 * ENTERPRISE RISK MANAGEMENT SYSTEM
 * Capital preservation, position sizing, circuit breakers, and emergency controls.
 * - Strict daily loss limits
 * - Maximum open position limits
 * - Consecutive loss circuit breakers
 * - Position sizing by risk percentage
 * - Emergency stop kill-switch
 * - Default AUTO-TRADING = OFF on server startup / crash restart
 */

class RiskManager {
  constructor(options = {}) {
    this.options = Object.assign({
      maxRiskPerTradePct: 1.5,       // Max 1.5% account equity risked per trade
      maxDailyLossPct: 5.0,          // Max 5% daily realized loss limit
      maxOpenPositions: 3,           // Max 3 concurrent open positions
      maxDrawdownPct: 10.0,          // Max 10% drawdown from peak
      consecutiveLossLimit: 3,       // Max 3 consecutive losses before circuit breaker
      maxSpreadPct: 0.001,           // Max 0.1% bid/ask spread
      maxSlippagePct: 0.0015,        // Max 0.15% acceptable slippage
      defaultAutoTradeMinScore: 85   // Auto-trade threshold (default 85/100)
    }, options);

    // CRITICAL SAFETY REQUIREMENT:
    // Auto Trading MUST ALWAYS default to false on server startup or reboot!
    this.autoTradingEnabled = false;
    this.emergencyStopTriggered = false;
    this.circuitBreakerTripped = false;
    this.circuitBreakerReason = null;

    // Daily & historical tracking
    this.currentDayUtc = new Date().toISOString().slice(0, 10);
    this.dailyRealizedPnl = 0;
    this.dailyStartingEquity = 10000;
    this.consecutiveLosses = 0;
    this.peakEquity = 10000;
    this.lastTradeTime = 0;
  }

  /**
   * Resets daily counters when a new UTC day begins
   */
  checkDayRollover(currentEquity) {
    const today = new Date().toISOString().slice(0, 10);
    if (this.currentDayUtc !== today) {
      this.currentDayUtc = today;
      this.dailyRealizedPnl = 0;
      this.dailyStartingEquity = currentEquity || this.dailyStartingEquity;
      if (this.circuitBreakerTripped && this.circuitBreakerReason?.includes('Daily')) {
        this.circuitBreakerTripped = false;
        this.circuitBreakerReason = null;
      }
    }
  }

  /**
   * Records a closed trade to update risk metrics
   */
  recordTradeResult(trade) {
    const pnl = parseFloat(trade.pnl || trade.realizedPnl || 0);
    this.dailyRealizedPnl += pnl;

    if (pnl < 0) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= this.options.consecutiveLossLimit) {
        this.tripCircuitBreaker(`Consecutive Loss Limit reached (${this.consecutiveLosses} losses in a row)`);
      }
    } else if (pnl > 0) {
      this.consecutiveLosses = 0;
    }

    // Check daily loss limit
    const maxAllowedLoss = -(this.dailyStartingEquity * (this.options.maxDailyLossPct / 100));
    if (this.dailyRealizedPnl <= maxAllowedLoss) {
      this.tripCircuitBreaker(`Daily Loss Limit exceeded: $${this.dailyRealizedPnl.toFixed(2)} / limit $${maxAllowedLoss.toFixed(2)}`);
    }
  }

  /**
   * Trips the circuit breaker, stopping all automated trades immediately
   */
  tripCircuitBreaker(reason) {
    this.circuitBreakerTripped = true;
    this.circuitBreakerReason = reason;
    this.autoTradingEnabled = false;
    console.warn(`[CIRCUIT BREAKER TRIPPED] ${reason}. Auto-trading disabled.`);
  }

  /**
   * Activates Emergency Kill Switch
   */
  triggerEmergencyStop(reason = 'Manual Emergency Stop Button Pressed') {
    this.emergencyStopTriggered = true;
    this.autoTradingEnabled = false;
    console.error(`[EMERGENCY STOP TRIGGERED] ${reason}. All auto-trading halted.`);
    return { success: true, emergencyStop: true, reason };
  }

  /**
   * Resets Emergency Stop
   */
  resetEmergencyStop() {
    this.emergencyStopTriggered = false;
    return { success: true, emergencyStop: false };
  }

  /**
   * Toggles auto-trading status with safety validation
   */
  setAutoTrading(enabled, authConfirmed = false) {
    if (enabled) {
      if (this.emergencyStopTriggered) {
        throw new Error('Cannot enable Auto-Trading: Emergency Stop is currently active. Reset Emergency Stop first.');
      }
      if (this.circuitBreakerTripped) {
        throw new Error(`Cannot enable Auto-Trading: Circuit Breaker is active (${this.circuitBreakerReason}).`);
      }
      if (!authConfirmed) {
        throw new Error('Authentication & confirmation required to activate real-money auto-trading.');
      }
      this.autoTradingEnabled = true;
    } else {
      this.autoTradingEnabled = false;
    }
    return { success: true, autoTradingEnabled: this.autoTradingEnabled };
  }

  /**
   * Calculate position size based on dollar risk and stop loss distance
   * Formula: Position Size = (Account Equity * Risk %) / (Entry - SL)
   */
  calculatePositionSize(accountEquity, entryPrice, stopLossPrice, leverage = 10) {
    const riskPct = this.options.maxRiskPerTradePct / 100;
    const maxDollarRisk = accountEquity * riskPct;
    const stopDistance = Math.abs(entryPrice - stopLossPrice);

    if (stopDistance <= 0) {
      throw new Error('Invalid Stop Loss distance: Stop Loss cannot equal Entry Price');
    }

    const rawUnits = maxDollarRisk / stopDistance;
    const notionalValue = rawUnits * entryPrice;
    const requiredMargin = notionalValue / leverage;

    // Safety cap: Margin cannot exceed 40% of available equity
    const maxAllowedMargin = accountEquity * 0.4;
    let finalUnits = rawUnits;
    if (requiredMargin > maxAllowedMargin) {
      finalUnits = (maxAllowedMargin * leverage) / entryPrice;
    }

    return {
      units: parseFloat(finalUnits.toFixed(4)),
      notional: parseFloat((finalUnits * entryPrice).toFixed(2)),
      margin: parseFloat(((finalUnits * entryPrice) / leverage).toFixed(2)),
      dollarRisk: parseFloat((finalUnits * stopDistance).toFixed(2)),
      riskPct: parseFloat(((finalUnits * stopDistance / accountEquity) * 100).toFixed(2))
    };
  }

  /**
   * Returns current safety and risk status for API telemetry
   */
  getStatus(currentEquity = 10000) {
    this.checkDayRollover(currentEquity);
    return {
      autoTradingEnabled: this.autoTradingEnabled,
      emergencyStopTriggered: this.emergencyStopTriggered,
      circuitBreakerTripped: this.circuitBreakerTripped,
      circuitBreakerReason: this.circuitBreakerReason,
      dailyRealizedPnl: this.dailyRealizedPnl,
      dailyLossLimitDollar: -(this.dailyStartingEquity * (this.options.maxDailyLossPct / 100)),
      dailyLossLimitPct: this.options.maxDailyLossPct,
      consecutiveLosses: this.consecutiveLosses,
      consecutiveLossLimit: this.options.consecutiveLossLimit,
      maxRiskPerTradePct: this.options.maxRiskPerTradePct,
      maxOpenPositions: this.options.maxOpenPositions,
      autoTradeMinScore: this.options.defaultAutoTradeMinScore
    };
  }

  /**
   * [RF-6 FIX] Persist safety-critical state to disk so circuit breaker and emergency stop
   * survive server restarts and Railway redeployments.
   * @param {Object} db Instance of the Database class from database/db.js
   */
  persistState(db) {
    if (!db) return;
    try {
      db.saveRiskState({
        emergencyStopTriggered: this.emergencyStopTriggered,
        circuitBreakerTripped: this.circuitBreakerTripped,
        circuitBreakerReason: this.circuitBreakerReason,
        consecutiveLosses: this.consecutiveLosses,
        dailyRealizedPnl: this.dailyRealizedPnl,
        currentDayUtc: this.currentDayUtc,
        savedAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[RiskManager] Failed to persist risk state:', e.message);
    }
  }

  /**
   * [RF-6 FIX] Restore safety-critical state from disk on startup.
   * @param {Object} db Instance of the Database class from database/db.js
   */
  loadState(db) {
    if (!db) return;
    try {
      const saved = db.getRiskState();
      if (!saved || !saved.savedAt) return;

      // Only restore same-day state — daily loss counters reset on a new UTC day
      const today = new Date().toISOString().slice(0, 10);
      if (saved.emergencyStopTriggered) {
        this.emergencyStopTriggered = true;
        console.warn('[RiskManager] ⚠️  Emergency Stop restored from disk — was active before restart.');
      }
      if (saved.circuitBreakerTripped) {
        this.circuitBreakerTripped = true;
        this.circuitBreakerReason = saved.circuitBreakerReason || 'Restored from previous session';
        console.warn(`[RiskManager] ⚠️  Circuit Breaker restored from disk: ${this.circuitBreakerReason}`);
      }
      if (saved.currentDayUtc === today) {
        this.dailyRealizedPnl = saved.dailyRealizedPnl || 0;
        this.consecutiveLosses = saved.consecutiveLosses || 0;
      }
    } catch (e) {
      console.warn('[RiskManager] Failed to load persisted risk state:', e.message);
    }
  }
}

module.exports = RiskManager;

