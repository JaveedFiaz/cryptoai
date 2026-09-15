/**
 * SECURITY & AUTHENTICATION MODULE
 * - Enforces two-step authorization before enabling real-money auto-trading
 * - Sanitizes sensitive credentials to prevent any leakage to client
 * - Token-based session verification
 */

const crypto = require('crypto');

class SecurityManager {
  constructor() {
    this.adminSecret = process.env.ADMIN_PASSWORD || 'scalper_admin_2026';
    this.activeTokens = new Set();
  }

  /**
   * Verify activation password or auth token
   */
  verifyAuth(passwordOrToken) {
    if (!passwordOrToken) return false;
    if (this.activeTokens.has(passwordOrToken)) return true;
    if (passwordOrToken === this.adminSecret) {
      const token = 'TOKEN_' + crypto.randomBytes(16).toString('hex');
      this.activeTokens.add(token);
      return token;
    }
    return false;
  }

  /**
   * Generates sanitized view of exchange credentials
   */
  sanitizeCredentials(apiKey) {
    if (!apiKey || apiKey.length < 8) return 'NOT_CONFIGURED';
    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  }
}

module.exports = new SecurityManager();
