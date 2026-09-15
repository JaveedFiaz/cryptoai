/**
 * MOCK MEXC EXCHANGE
 * High-fidelity simulated broker implementing the exact MEXC Contract API interface
 * Used for automated testing, sandbox verification, and zero-risk terminal testing.
 */

class MockExchange {
  constructor(options = {}) {
    this.currency = 'USDT';
    this.balance = options.startingBalance || 10000;
    this.equity = this.balance;
    this.positions = [];
    this.orders = [];
    this.trades = [];
    this.isMock = true;
  }

  isConfigured() {
    return true;
  }

  async ping() {
    return { success: true, latency: 12, data: { msg: 'PONG (Mock Engine)' } };
  }

  async getServerTime() {
    return Date.now();
  }

  async getAccountAssets() {
    let unrealizedPnl = 0;
    let usedMargin = 0;

    for (const p of this.positions) {
      unrealizedPnl += p.unrealizedPnl || 0;
      usedMargin += p.margin || 0;
    }

    this.equity = this.balance + unrealizedPnl;
    const available = Math.max(0, this.equity - usedMargin);

    return {
      currency: 'USDT',
      equity: this.equity,
      availableBalance: available,
      frozenBalance: 0,
      positionMargin: usedMargin,
      unrealizedPnl: unrealizedPnl,
      bonus: 0
    };
  }

  async getOpenPositions(symbol = null) {
    if (symbol) {
      return this.positions.filter(p => p.symbol === symbol);
    }
    return this.positions;
  }

  async submitOrder(order) {
    const isLong = order.side === 'BUY' || order.side === 'OPEN_LONG';
    const isShort = order.side === 'SELL' || order.side === 'OPEN_SHORT';
    const isClose = order.side === 'CLOSE_LONG' || order.side === 'CLOSE_SHORT';

    const orderId = 'MOCK_ORD_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const leverage = parseInt(order.leverage || 10, 10);
    const price = parseFloat(order.price || 50000);
    const vol = parseFloat(order.vol || order.quantity || 0.1);
    const notional = vol * price;
    const margin = notional / leverage;

    if (isClose) {
      const idx = this.positions.findIndex(p => p.symbol === order.symbol);
      if (idx !== -1) {
        const closed = this.positions.splice(idx, 1)[0];
        const pnl = closed.unrealizedPnl || 0;
        this.balance += pnl;
        return {
          success: true,
          orderId,
          status: 'FILLED',
          pnl,
          symbol: order.symbol,
          side: order.side
        };
      }
      return { success: true, orderId, status: 'FILLED', note: 'No open position found to close' };
    }

    if (isLong || isShort) {
      const pos = {
        positionId: 'MOCK_POS_' + Date.now(),
        symbol: order.symbol,
        mexcSymbol: order.symbol.replace('USDT', '_USDT'),
        holdVol: vol,
        positionType: isLong ? 'LONG' : 'SHORT',
        openPrice: price,
        liquidatePrice: isLong ? price * (1 - 1 / leverage * 0.9) : price * (1 + 1 / leverage * 0.9),
        unrealizedPnl: 0,
        leverage: leverage,
        margin: margin,
        isolated: true,
        stopLoss: order.stopLoss || null,
        takeProfit: order.takeProfit || null
      };
      this.positions.push(pos);
      return {
        success: true,
        orderId,
        symbol: order.symbol,
        side: order.side,
        status: 'FILLED',
        position: pos
      };
    }

    return { success: true, orderId, status: 'SUBMITTED' };
  }

  async cancelOrder(orderIdList) {
    return { success: true, cancelled: orderIdList };
  }

  async closePositions(symbol = null) {
    const results = [];
    const toClose = symbol ? this.positions.filter(p => p.symbol === symbol) : [...this.positions];
    for (const p of toClose) {
      const res = await this.submitOrder({
        symbol: p.symbol,
        side: p.positionType === 'LONG' ? 'CLOSE_LONG' : 'CLOSE_SHORT',
        type: 'MARKET',
        vol: p.holdVol
      });
      results.push(res);
    }
    return results;
  }
}

module.exports = MockExchange;
