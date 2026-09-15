/**
 * CRYPTO SCALPER PRO - AUTONOMOUS BROWSER TRADING ENGINE [v1.0]
 * Complete client-side matching engine for simulated crypto futures trading.
 * Runs 100% inside mobile / desktop browsers with ZERO PC / server dependency.
 * Persists demo wallet, positions, orders, and trade history in localStorage.
 */

class ClientTradingEngine {
  constructor() {
    this.storageKey = 'crypto_scalper_demo_state_v1';
    this.instruments = (typeof window !== 'undefined' && window.INSTRUMENTS) 
      ? window.INSTRUMENTS 
      : ((typeof INSTRUMENTS !== 'undefined') ? INSTRUMENTS : {});
    this.prices = {};
    this.listeners = [];
    
    // Initialize default prices for instruments
    for (const sym of Object.keys(this.instruments)) {
      this.prices[sym] = {
        symbol: sym,
        price: 0,
        bid: 0,
        ask: 0,
        mark: 0,
        last: 0,
        time: Date.now(),
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        change24h: 0
      };
    }

    this.state = this.loadState();
  }

  loadState() {
    const defaultState = {
      account: {
        id: 'demo-wallet',
        startingBalance: 10000,
        balance: 10000,
        usedMargin: 0,
        availableBalance: 10000,
        unrealizedPnL: 0,
        realizedPnL: 0,
        totalFees: 0,
        equity: 10000,
        marginRatio: 0,
        currency: 'USD',
        updatedAt: Date.now()
      },
      positions: [],
      orders: [],
      trades: [],
      auditLog: []
    };

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.account && Array.isArray(parsed.positions)) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('LocalStorage unavailable, using in-memory state');
    }
    return defaultState;
  }

  saveState() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
      }
    } catch (e) {}
  }

  on(listener) {
    this.listeners.push(listener);
  }

  emit(eventType, data) {
    for (const fn of this.listeners) {
      try {
        fn(eventType, data);
      } catch (err) {
        console.error('ClientEngine listener error:', err);
      }
    }
  }

  // =========================================================================
  // REAL-TIME PRICE STREAM INGESTION & TRIGGER CHECKER
  // =========================================================================
  updatePrice(symbol, tick) {
    const inst = this.instruments[symbol];
    if (!inst) return;

    const last = Number(tick.price || tick.last || tick.close || 0);
    if (last <= 0) return;

    const spread = last * (inst.spreadFactor || 0.00004);
    const bid = Number(tick.bid || (last - spread / 2));
    const ask = Number(tick.ask || (last + spread / 2));
    const mark = Number(tick.mark || last);

    this.prices[symbol] = {
      symbol,
      price: Number(last.toFixed(inst.priceDecimals)),
      bid: Number(bid.toFixed(inst.priceDecimals)),
      ask: Number(ask.toFixed(inst.priceDecimals)),
      mark: Number(mark.toFixed(inst.priceDecimals)),
      last: Number(last.toFixed(inst.priceDecimals)),
      time: tick.time || Date.now(),
      high24h: Number(tick.high24h || tick.high || last),
      low24h: Number(tick.low24h || tick.low || last),
      volume24h: Number(tick.volume24h || tick.volume || 0),
      change24h: Number(tick.change24h || 0)
    };

    this.checkLimitOrders(symbol);
    this.checkOpenPositions(symbol);
    this.recalculateAccount();
  }

  checkLimitOrders(symbol) {
    const currentPrice = this.prices[symbol];
    if (!currentPrice || currentPrice.last <= 0) return;

    const remainingOrders = [];
    let stateChanged = false;

    for (const order of this.state.orders) {
      if (order.symbol !== symbol || order.status !== 'NEW') {
        remainingOrders.push(order);
        continue;
      }

      const isFilled = (order.side === 'BUY' && currentPrice.ask <= order.price) ||
                       (order.side === 'SELL' && currentPrice.bid >= order.price);

      if (isFilled) {
        stateChanged = true;
        const fillPrice = order.price;
        const inst = this.instruments[symbol];
        const positionSide = order.side === 'BUY' ? 'LONG' : 'SHORT';
        const fee = (order.quantity * fillPrice) * inst.makerFeeRate;
        const maintenanceMargin = order.quantity * fillPrice * inst.maintenanceMarginRate;
        const liqPrice = (typeof calculateLiquidationPrice !== 'undefined')
          ? calculateLiquidationPrice(positionSide, fillPrice, order.leverage, inst.maintenanceMarginRate)
          : (positionSide === 'LONG' ? fillPrice * (1 - 1/order.leverage + inst.maintenanceMarginRate) : fillPrice * (1 + 1/order.leverage - inst.maintenanceMarginRate));

        this.state.account.balance -= fee;
        this.state.account.totalFees += fee;

        const newPosition = {
          id: 'pos-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          symbol: order.symbol,
          side: positionSide,
          quantity: order.quantity,
          entryPrice: fillPrice,
          leverage: order.leverage,
          margin: order.requiredMargin,
          maintenanceMargin,
          liquidationPrice: Number(liqPrice.toFixed(inst.priceDecimals)),
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          unrealizedPnL: 0,
          unrealizedPnLPct: 0,
          realizedPnL: 0,
          totalFees: fee,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        this.state.positions.push(newPosition);

        order.status = 'FILLED';
        order.filledAt = Date.now();
        order.fillPrice = fillPrice;

        this.emit('order_filled', order);
        this.emit('position_opened', newPosition);
      } else {
        remainingOrders.push(order);
      }
    }

    if (stateChanged) {
      this.state.orders = remainingOrders;
      this.saveState();
      this.recalculateAccount();
    }
  }

  checkOpenPositions(symbol) {
    const currentPrice = this.prices[symbol];
    if (!currentPrice || currentPrice.last <= 0) return;

    const mark = currentPrice.mark;
    const positionsToKeep = [];
    let stateChanged = false;

    for (const pos of this.state.positions) {
      if (pos.symbol !== symbol) {
        positionsToKeep.push(pos);
        continue;
      }

      // Unrealized PnL Calculation
      const priceDiff = pos.side === 'LONG' ? (mark - pos.entryPrice) : (pos.entryPrice - mark);
      const grossPnL = pos.quantity * priceDiff;
      const roePct = (grossPnL / pos.margin) * 100;

      pos.unrealizedPnL = Number(grossPnL.toFixed(2));
      pos.unrealizedPnLPct = Number(roePct.toFixed(2));
      pos.markPrice = mark;
      pos.updatedAt = Date.now();

      // 1. LIQUIDATION TRIGGER
      const isLiquidated = (pos.side === 'LONG' && mark <= pos.liquidationPrice) ||
                           (pos.side === 'SHORT' && mark >= pos.liquidationPrice);

      if (isLiquidated) {
        stateChanged = true;
        this.liquidatePosition(pos, mark);
        continue;
      }

      // 2. TAKE PROFIT TRIGGER
      if (pos.takeProfit !== null && pos.takeProfit !== undefined) {
        const isTakeProfit = (pos.side === 'LONG' && mark >= pos.takeProfit) ||
                             (pos.side === 'SHORT' && mark <= pos.takeProfit);
        if (isTakeProfit) {
          stateChanged = true;
          this.closePositionInternal(pos, pos.takeProfit, null, 'TP');
          continue;
        }
      }

      // 3. STOP LOSS TRIGGER
      if (pos.stopLoss !== null && pos.stopLoss !== undefined) {
        const isStopLoss = (pos.side === 'LONG' && mark <= pos.stopLoss) ||
                           (pos.side === 'SHORT' && mark >= pos.stopLoss);
        if (isStopLoss) {
          stateChanged = true;
          this.closePositionInternal(pos, pos.stopLoss, null, 'SL');
          continue;
        }
      }

      positionsToKeep.push(pos);
    }

    if (stateChanged) {
      this.state.positions = positionsToKeep;
      this.saveState();
      this.recalculateAccount();
    }
  }

  // =========================================================================
  // ORDER PLACEMENT (MARKET & LIMIT)
  // =========================================================================
  placeOrder(orderParams) {
    const {
      symbol,
      side,
      type = 'MARKET',
      quantity,
      price = null,
      leverage = 10,
      stopLoss = null,
      takeProfit = null
    } = orderParams;

    const inst = this.instruments[symbol];
    if (!inst) throw new Error(`Unsupported trading symbol: ${symbol}`);

    const cleanSide = (side || '').toUpperCase();
    if (cleanSide !== 'BUY' && cleanSide !== 'SELL') throw new Error('Order side must be BUY or SELL.');

    const cleanType = (type || 'MARKET').toUpperCase();
    if (cleanType !== 'MARKET' && cleanType !== 'LIMIT') throw new Error('Order type must be MARKET or LIMIT.');

    const lev = Math.min(inst.maxLeverage, Math.max(1, parseInt(leverage, 10) || inst.defaultLeverage));
    const qty = Number(parseFloat(quantity).toFixed(inst.qtyDecimals));

    if (isNaN(qty) || qty < inst.minQty) throw new Error(`Minimum order quantity for ${symbol} is ${inst.minQty}.`);
    if (qty > inst.maxQty) throw new Error(`Maximum order quantity for ${symbol} is ${inst.maxQty}.`);

    let currentPrice = this.prices[symbol];
    if (!currentPrice || currentPrice.last <= 0) {
      if (typeof window !== 'undefined' && window.scalperApp && window.scalperApp.bars && window.scalperApp.bars.length > 0) {
        const lastBar = window.scalperApp.bars[window.scalperApp.bars.length - 1];
        if (lastBar && lastBar.close > 0) {
          this.updatePrice(symbol, { price: lastBar.close, mark: lastBar.close, bid: lastBar.close * 0.99998, ask: lastBar.close * 1.00002 });
          currentPrice = this.prices[symbol];
        }
      }
    }
    if (!currentPrice || currentPrice.last <= 0) {
      throw new Error(`Market data currently unavailable for ${symbol}. Please wait for live feed.`);
    }

    let execPrice;
    if (cleanType === 'MARKET') {
      execPrice = cleanSide === 'BUY' ? currentPrice.ask : currentPrice.bid;
    } else {
      execPrice = Number(parseFloat(price).toFixed(inst.priceDecimals));
      if (isNaN(execPrice) || execPrice <= 0) throw new Error('Valid limit price is required for Limit orders.');
    }

    const requiredMargin = Number(((qty * execPrice) / lev).toFixed(2));
    const estimatedFee = (qty * execPrice) * inst.takerFeeRate;
    const totalRequired = requiredMargin + estimatedFee;

    if (this.state.account.availableBalance < totalRequired) {
      throw new Error(`Insufficient available margin. Required: $${totalRequired.toFixed(2)}, Available: $${this.state.account.availableBalance.toFixed(2)}.`);
    }

    const sl = stopLoss ? Number(parseFloat(stopLoss).toFixed(inst.priceDecimals)) : null;
    const tp = takeProfit ? Number(parseFloat(takeProfit).toFixed(inst.priceDecimals)) : null;

    if (sl !== null) {
      if (cleanSide === 'BUY' && sl >= execPrice) throw new Error('Long stop loss must be below entry price.');
      if (cleanSide === 'SELL' && sl <= execPrice) throw new Error('Short stop loss must be above entry price.');
    }
    if (tp !== null) {
      if (cleanSide === 'BUY' && tp <= execPrice) throw new Error('Long take profit must be above entry price.');
      if (cleanSide === 'SELL' && tp >= execPrice) throw new Error('Short take profit must be below entry price.');
    }

    const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

    if (cleanType === 'LIMIT') {
      const isMarketable = (cleanSide === 'BUY' && execPrice >= currentPrice.ask) ||
                           (cleanSide === 'SELL' && execPrice <= currentPrice.bid);

      if (!isMarketable) {
        const newOrder = {
          id: orderId,
          symbol,
          side: cleanSide,
          type: 'LIMIT',
          price: execPrice,
          quantity: qty,
          leverage: lev,
          requiredMargin,
          stopLoss: sl,
          takeProfit: tp,
          status: 'NEW',
          fee: estimatedFee,
          createdAt: Date.now()
        };

        this.state.orders.push(newOrder);
        this.recalculateAccount();
        this.saveState();
        this.emit('order_created', newOrder);
        return { order: newOrder, position: null };
      }
    }

    // Market Execution
    const positionSide = cleanSide === 'BUY' ? 'LONG' : 'SHORT';
    const fee = (qty * execPrice) * inst.takerFeeRate;
    const maintenanceMargin = qty * execPrice * inst.maintenanceMarginRate;
    const liqPrice = (typeof calculateLiquidationPrice !== 'undefined')
      ? calculateLiquidationPrice(positionSide, execPrice, lev, inst.maintenanceMarginRate)
      : (positionSide === 'LONG' ? execPrice * (1 - 1/lev + inst.maintenanceMarginRate) : execPrice * (1 + 1/lev - inst.maintenanceMarginRate));

    this.state.account.balance -= fee;
    this.state.account.totalFees += fee;

    const positionId = 'pos-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const newPosition = {
      id: positionId,
      symbol,
      side: positionSide,
      quantity: qty,
      entryPrice: execPrice,
      leverage: lev,
      margin: requiredMargin,
      maintenanceMargin,
      liquidationPrice: Number(liqPrice.toFixed(inst.priceDecimals)),
      stopLoss: sl,
      takeProfit: tp,
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
      realizedPnL: 0,
      totalFees: fee,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.state.positions.push(newPosition);
    this.recalculateAccount();
    this.saveState();

    this.emit('position_opened', newPosition);
    return { order: { id: orderId, status: 'FILLED' }, position: newPosition };
  }

  // =========================================================================
  // POSITION MANAGEMENT (CLOSE, PARTIAL CLOSE, MODIFY)
  // =========================================================================
  closePosition(positionId, quantity = null, reason = 'MANUAL') {
    const posIdx = this.state.positions.findIndex(p => p.id === positionId);
    if (posIdx === -1) throw new Error('Position not found');
    const pos = this.state.positions[posIdx];

    const currentPrice = this.prices[pos.symbol];
    if (!currentPrice || currentPrice.last <= 0) throw new Error('Live price unavailable for position close');
    const execPrice = pos.side === 'LONG' ? currentPrice.bid : currentPrice.ask;

    const trade = this.closePositionInternal(pos, execPrice, quantity, reason);

    if (quantity !== null && quantity > 0 && quantity < pos.quantity) {
      pos.quantity = Number((pos.quantity - quantity).toFixed(this.instruments[pos.symbol].qtyDecimals));
      pos.margin = Number(((pos.quantity * pos.entryPrice) / pos.leverage).toFixed(2));
      pos.updatedAt = Date.now();
    } else {
      this.state.positions.splice(posIdx, 1);
    }

    this.recalculateAccount();
    this.saveState();
    this.emit('position_closed', trade);
    return trade;
  }

  closePositionInternal(pos, exitPrice, closeQty = null, reason = 'MANUAL') {
    const inst = this.instruments[pos.symbol];
    const qty = closeQty && closeQty > 0 && closeQty <= pos.quantity ? closeQty : pos.quantity;

    const priceDiff = pos.side === 'LONG' ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice);
    const grossPnL = qty * priceDiff;
    const exitFee = (qty * exitPrice) * inst.takerFeeRate;
    const netPnL = grossPnL - exitFee;

    const marginReleased = (qty * pos.entryPrice) / pos.leverage;
    this.state.account.balance += (marginReleased + netPnL);
    this.state.account.realizedPnL += netPnL;
    this.state.account.totalFees += exitFee;

    const trade = {
      id: 'trd-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      positionId: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: Number(exitPrice.toFixed(inst.priceDecimals)),
      quantity: qty,
      leverage: pos.leverage,
      grossPnL: Number(grossPnL.toFixed(2)),
      fee: Number(exitFee.toFixed(2)),
      netPnL: Number(netPnL.toFixed(2)),
      exitReason: reason,
      durationMs: Date.now() - pos.createdAt,
      createdAt: pos.createdAt,
      closedAt: Date.now()
    };

    this.state.trades.unshift(trade);
    return trade;
  }

  liquidatePosition(pos, markPrice) {
    const inst = this.instruments[pos.symbol];
    const loss = -pos.margin;
    this.state.account.realizedPnL += loss;

    const trade = {
      id: 'liq-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      positionId: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: markPrice,
      quantity: pos.quantity,
      leverage: pos.leverage,
      grossPnL: Number(loss.toFixed(2)),
      fee: 0,
      netPnL: Number(loss.toFixed(2)),
      exitReason: 'LIQUIDATION',
      durationMs: Date.now() - pos.createdAt,
      createdAt: pos.createdAt,
      closedAt: Date.now()
    };

    this.state.trades.unshift(trade);
    this.emit('position_liquidated', { ...pos, markPrice });
  }

  modifyPosition(positionId, updates) {
    const pos = this.state.positions.find(p => p.id === positionId);
    if (!pos) throw new Error('Position not found');

    const inst = this.instruments[pos.symbol];
    if (updates.stopLoss !== undefined) {
      pos.stopLoss = updates.stopLoss !== null ? Number(parseFloat(updates.stopLoss).toFixed(inst.priceDecimals)) : null;
    }
    if (updates.takeProfit !== undefined) {
      pos.takeProfit = updates.takeProfit !== null ? Number(parseFloat(updates.takeProfit).toFixed(inst.priceDecimals)) : null;
    }

    pos.updatedAt = Date.now();
    this.saveState();
    this.emit('position_updated', pos);
    return pos;
  }

  cancelOrder(orderId) {
    const idx = this.state.orders.findIndex(o => o.id === orderId);
    if (idx === -1) throw new Error('Order not found');
    const removed = this.state.orders.splice(idx, 1)[0];
    this.recalculateAccount();
    this.saveState();
    this.emit('order_cancelled', removed);
    return { success: true, order: removed };
  }

  resetDemoAccount(startingBalance = 10000, clearHistory = true) {
    this.state.account = {
      id: 'demo-wallet',
      startingBalance,
      balance: startingBalance,
      usedMargin: 0,
      availableBalance: startingBalance,
      unrealizedPnL: 0,
      realizedPnL: 0,
      totalFees: 0,
      equity: startingBalance,
      marginRatio: 0,
      currency: 'USD',
      updatedAt: Date.now()
    };
    this.state.positions = [];
    this.state.orders = [];
    if (clearHistory) {
      this.state.trades = [];
      this.state.auditLog = [];
    }
    this.saveState();
    this.emit('account_update', this.state.account);
    return this.state;
  }

  recalculateAccount() {
    let usedMargin = 0;
    let totalUnrealizedPnL = 0;

    for (const pos of this.state.positions) {
      usedMargin += pos.margin;
      totalUnrealizedPnL += (pos.unrealizedPnL || 0);
    }

    for (const order of this.state.orders) {
      if (order.status === 'NEW') {
        usedMargin += (order.requiredMargin || 0);
      }
    }

    const equity = Number((this.state.account.balance + totalUnrealizedPnL).toFixed(2));
    const availableBalance = Math.max(0, Number((this.state.account.balance - usedMargin).toFixed(2)));
    const marginRatio = equity > 0 ? Number(((usedMargin / equity) * 100).toFixed(1)) : 0;

    this.state.account.equity = equity;
    this.state.account.usedMargin = Number(usedMargin.toFixed(2));
    this.state.account.availableBalance = availableBalance;
    this.state.account.unrealizedPnL = Number(totalUnrealizedPnL.toFixed(2));
    this.state.account.marginRatio = marginRatio;
    this.state.account.updatedAt = Date.now();

    this.emit('account_update', this.state.account);
  }
}

// Global Singleton instance for browser usage
if (typeof window !== 'undefined') {
  window.ClientTradingEngine = ClientTradingEngine;
  window.clientTradingEngine = new ClientTradingEngine();
}
