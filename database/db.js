/**
 * MULTI-COLLECTION JSON DATABASE MANAGER
 * Safely persists and separates:
 * - paper_trades.json: Simulated paper trades and balance
 * - real_trades.json: Confirmed MEXC orders and positions
 * - signals_audit.json: 100-pt signal audit log and 15-point check outcomes
 * - risk_state.json: Daily PnL, circuit breaker status, emergency stop state
 * - app_settings.json: Configured risk parameters and score thresholds
 */

const fs = require('fs');
const path = require('path');

class Database {
  constructor(dataDir = null) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'data');
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (e) {}
    }
  }

  getFilePath(collection) {
    return path.join(this.dataDir, `${collection}.json`);
  }

  read(collection, defaultValue = []) {
    const file = this.getFilePath(collection);
    try {
      if (!fs.existsSync(file)) {
        return defaultValue;
      }
      const raw = fs.readFileSync(file, 'utf8');
      return raw ? JSON.parse(raw) : defaultValue;
    } catch (err) {
      console.warn(`[DB] Error reading ${collection}:`, err.message);
      return defaultValue;
    }
  }

  write(collection, data) {
    const file = this.getFilePath(collection);
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error(`[DB] Error writing ${collection}:`, err.message);
      return false;
    }
  }

  // Collections helpers
  getPaperTrades() {
    return this.read('paper_trades', []);
  }

  savePaperTrades(trades) {
    return this.write('paper_trades', trades);
  }

  getRealTrades() {
    return this.read('real_trades', []);
  }

  saveRealTrades(trades) {
    return this.write('real_trades', trades);
  }

  getAuditLogs() {
    return this.read('signals_audit', []);
  }

  saveAuditLogs(logs) {
    return this.write('signals_audit', logs.slice(0, 500)); // Cap at 500
  }

  getRiskState() {
    return this.read('risk_state', {});
  }

  saveRiskState(state) {
    return this.write('risk_state', state);
  }

  getSettings() {
    return this.read('app_settings', {
      maxRiskPerTradePct: 1.5,
      maxDailyLossPct: 5.0,
      maxOpenPositions: 3,
      autoTradeMinScore: 85,
      autoTradeMode: 'PAPER'
    });
  }

  saveSettings(settings) {
    return this.write('app_settings', settings);
  }
}

module.exports = new Database();
