/**
 * CRYPTO SCALPER PRO - PERSISTENT STORAGE MODULE
 * Handles persistent state for demo account, positions, orders, and trade history.
 * Data survives server restarts and browser refreshes.
 */

const fs = require('fs');
const path = require('path');
const { createInitialAccount } = require('./models');

const DATA_DIR = path.join(__dirname, 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'demo_storage.json');

class StorageManager {
  constructor() {
    this.ensureDirectory();
    this.state = this.load();
  }

  ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (err) {
        console.error('Failed to create data directory:', err);
      }
    }
  }

  getInitialState() {
    return {
      account: createInitialAccount(10000),
      positions: [],
      orders: [],
      trades: [],
      auditLog: [
        {
          id: 'init-1',
          action: 'SYSTEM_INIT',
          details: 'Demo trading account initialized with $10,000.00 USD',
          timestamp: Date.now()
        }
      ]
    };
  }

  load() {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.account && Array.isArray(parsed.positions)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to load storage, initializing fresh state:', err.message);
    }
    const fresh = this.getInitialState();
    this.saveDirect(fresh);
    return fresh;
  }

  save() {
    this.saveDirect(this.state);
  }

  saveDirect(stateObj) {
    try {
      this.ensureDirectory();
      const tmpFile = `${STORAGE_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(stateObj, null, 2), 'utf8');
      fs.renameSync(tmpFile, STORAGE_FILE);
    } catch (err) {
      console.error('Failed to write storage file:', err);
    }
  }

  resetAccount(startingBalance = 10000, clearHistory = false) {
    this.state.account = createInitialAccount(startingBalance);
    this.state.positions = [];
    this.state.orders = [];
    if (clearHistory) {
      this.state.trades = [];
    }
    this.state.auditLog.unshift({
      id: 'reset-' + Date.now(),
      action: 'DEMO_RESET',
      details: `Account reset to $${Number(startingBalance).toFixed(2)}. All open positions and orders cleared.`,
      timestamp: Date.now()
    });
    this.save();
    return this.state;
  }
}

module.exports = new StorageManager();
