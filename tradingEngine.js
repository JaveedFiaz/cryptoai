/**
 * CRYPTO SCALPER PRO - BACKEND DEMO TRADING ENGINE
 * Authoritative matching and risk engine for simulated crypto and metals futures trading.
 * Implements: Market & Limit orders, Isolated Margin, Leverage (1x-100x),
 * Real-time Mark PnL, Liquidation Engine, Automated SL/TP, Partial Exits, Fees & Spread.
 */

const { INSTRUMENTS, calculateLiquidationPrice, calculateRequiredMargin } = require('./models');
const storage = require('./storage');

class TradingEngine {
  constructor() {
    this.storage = storage;
    this.instruments = INSTRUMENTS;
    
    // Live price cache by symbol: { bid, ask, mark, last, time, high24h, low24h, volume24h, change24h }
    this.prices = {};
    
    // Callbacks for broadcasting events (e.g. WebSocket updates)
    this.listeners = [];

    // Initialize default prices for all instruments to prevent undefined lookups
    for (const sym of Object.keys(INSTRUMENTS)) {
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
  }

  isConfigured() {
    return true;
  }

  get state() {
    return this.storage.state;
  }

  on(listener) {
    this.listeners.push(listener);
  }

  emit(eventType, data) {
    for (const fn of this.listeners) {
      try {
        fn(eventType, data);
      } catch (err) {
        console.error('Listener notification error:', err);
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

    // Calculate spread if bid/ask not explicitly provided
    const spread = last * (inst.spreadFactor || 0.00005);
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

    // 1. Process pending limit orders that are now touched/marketable
    this.checkLimitOrders(symbol);

    // 2. Evaluate open positions PnL, SL, TP, and Liquidation triggers
    this.checkOpenPositions(symbol);

    // 3. Update account equity & margin ratio
    this.recalculateAccount();
  }

  // =========================================================================
  // ORDER PLACEMENT (MARKET & LIMIT)
  // =========================================================================
  placeOrder(orderParams) {
    const {
      symbol,
      side,          // 'BUY' (Long) or 'SELL' (Short)
      type = 'MARKET', // 'MARKET' or 'LIMIT'
      quantity,
      price = null,   // required for LIMIT
      leverage = 10,
      stopLoss = null,
      takeProfit = null
    } = orderParams;

    const inst = this.instruments[symbol];
    if (!inst) {
      throw new Error(`Unsupported trading symbol: ${symbol}`);
    }

    const cleanSide = (side || '').toUpperCase();
    if (cleanSide !== 'BUY' && cleanSide !== 'SELL') {
      throw new Error('Order side must be BUY or SELL.');
    }

    const cleanType = (type || 'MARKET').toUpperCase();
    if (cleanType !== 'MARKET' && cleanType !== 'LIMIT') {
      throw new Error('Order type must be MARKET or LIMIT.');
    }

    const lev = Math.min(inst.maxLeverage, Math.max(1, parseInt(leverage, 10) || inst.defaultLeverage));
    const qty = Number(parseFloat(quantity).toFixed(inst.qtyDecimals));

    if (isNaN(qty) || qty < inst.minQty) {
      throw new Error(`Minimum order quantity for ${symbol} is ${inst.minQty}.`);
    }
    if (qty > inst.maxQty) {
      throw new Error(`Maximum order quantity for ${symbol} is ${inst.maxQty}.`);
    }

    const currentPrice = this.prices[symbol];
    if (!currentPrice || currentPrice.last <= 0) {
      throw new Error(`Market data currently unavailable for ${symbol}. Please wait for live feed.`);
    }

    // Determine execution reference price
    let execPrice;
    if (cleanType === 'MARKET') {
      execPrice = cleanSide === 'BUY' ? currentPrice.ask : currentPrice.bid;
    } else {
      execPrice = Number(parseFloat(price).toFixed(inst.priceDecimals));
      if (isNaN(execPrice) || execPrice <= 0) {
        throw new Error('Valid limit price is required for Limit orders.');
      }
    }

    // Calculate required isolated margin and initial fee
    const requiredMargin = calculateRequiredMargin(qty, execPrice, lev);
    const estimatedFee = (qty * execPrice) * inst.takerFeeRate;
    const totalRequired = requiredMargin + estimatedFee;

    // Strict available balance validation
    if (this.state.account.availableBalance < totalRequired) {
      throw new Error(`Insufficient available margin. Required: $${totalRequired.toFixed(2)}, Available: $${this.state.account.availableBalance.toFixed(2)}.`);
    }

    // SL/TP Validation
    const sl = stopLoss ? Number(parseFloat(stopLoss).toFixed(inst.priceDecimals)) : null;
    const tp = takeProfit ? Number(parseFloat(takeProfit).toFixed(inst.priceDecimals)) : null;

    if (sl !== null) {
      if (cleanSide === 'BUY' && sl >= execPrice) {
        throw new Error('Long stop loss must be below the entry price.');
      }
      if (cleanSide === 'SELL' && sl <= execPrice) {
        throw new Error('Short stop loss must be above the entry price.');
      }
    }

    if (tp !== null) {
      if (cleanSide === 'BUY' && tp <= execPrice) {
        throw new Error('Long take profit must be above the entry price.');
      }
      if (cleanSide === 'SELL' && tp >= execPrice) {
        throw new Error('Short take profit must be below the entry price.');
      }
    }

    const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

    // If LIMIT order and not immediately marketable: save to pending orders
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
        this.storage.save();

        this.emit('order_created', newOrder);
        return { order: newOrder, position: null };
      }
      // If limit price crossed the market, execute immediately at limit/better
    }

    // MARKET EXECUTION
    const positionSide = cleanSide === 'BUY' ? 'LONG' : 'SHORT';
    const fee = (qty * execPrice) * inst.takerFeeRate;
    const maintenanceMargin = qty * execPrice * inst.maintenanceMarginRate;
    const liqPrice = calculateLiquidationPrice(positionSide, execPrice, lev, inst.maintenanceMarginRate);

    // Deduct entry fee immediately from wallet balance
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

    const filledOrder = {
      id: orderId,
      symbol,
      side: cleanSide,
      type: cleanType,
      price: execPrice,
      quantity: qty,
      leverage: lev,
      requiredMargin,
      stopLoss: sl,
      takeProfit: tp,
      status: 'FILLED',
      fee,
      createdAt: Date.now(),
      filledAt: Date.now()
    };

    this.state.auditLog.unshift({
      id: 'audit-' + Date.now(),
      action: 'ORDER_FILLED',
      details: `${cleanSide} ${qty} ${symbol} filled at ${execPrice} (${lev}x). Initial Margin: $${requiredMargin.toFixed(2)}`,
      timestamp: Date.now()
    });

    this.recalculateAccount();
    this.storage.save();

    this.emit('position_opened', newPosition);
    this.emit('order_filled', filledOrder);

    return { order: filledOrder, position: newPosition };
  }

  // =========================================================================
  // LIMIT ORDERS CHECKER
  // =========================================================================
  checkLimitOrders(symbol) {
    const priceData = this.prices[symbol];
    if (!priceData) return;

    const remainingOrders = [];
    for (const ord of this.state.orders) {
      if (ord.symbol !== symbol || ord.status !== 'NEW') {
        remainingOrders.push(ord);
        continue;
      }

      let fill = false;
      let fillPrice = ord.price;

      if (ord.side === 'BUY' && priceData.ask <= ord.price) {
        fill = true;
        fillPrice = Math.min(ord.price, priceData.ask);
      } else if (ord.side === 'SELL' && priceData.bid >= ord.price) {
        fill = true;
        fillPrice = Math.max(ord.price, priceData.bid);
      }

      if (fill) {
        // Execute filled limit order
        try {
          const inst = this.instruments[symbol];
          const positionSide = ord.side === 'BUY' ? 'LONG' : 'SHORT';
          const fee = (ord.quantity * fillPrice) * inst.makerFeeRate;
          const requiredMargin = calculateRequiredMargin(ord.quantity, fillPrice, ord.leverage);
          const mm = ord.quantity * fillPrice * inst.maintenanceMarginRate;
          const liqPrice = calculateLiquidationPrice(positionSide, fillPrice, ord.leverage, inst.maintenanceMarginRate);

          this.state.account.balance -= fee;
          this.state.account.totalFees += fee;

          const newPosition = {
            id: 'pos-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            symbol: ord.symbol,
            side: positionSide,
            quantity: ord.quantity,
            entryPrice: fillPrice,
            leverage: ord.leverage,
            margin: requiredMargin,
            maintenanceMargin: mm,
            liquidationPrice: Number(liqPrice.toFixed(inst.priceDecimals)),
            stopLoss: ord.stopLoss,
            takeProfit: ord.takeProfit,
            unrealizedPnL: 0,
            unrealizedPnLPct: 0,
            realizedPnL: 0,
            totalFees: fee,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          this.state.positions.push(newPosition);

          ord.status = 'FILLED';
          ord.filledAt = Date.now();
          ord.price = fillPrice;
          ord.fee = fee;

          this.state.auditLog.unshift({
            id: 'audit-' + Date.now(),
            action: 'LIMIT_ORDER_FILLED',
            details: `Limit ${ord.side} ${ord.quantity} ${symbol} filled at ${fillPrice}`,
            timestamp: Date.now()
          });

          this.emit('position_opened', newPosition);
          this.emit('order_filled', ord);
        } catch (err) {
          console.error('Failed to fill limit order:', err);
          remainingOrders.push(ord);
        }
      } else {
        remainingOrders.push(ord);
      }
    }

    this.state.orders = remainingOrders;
  }

  // =========================================================================
  // OPEN POSITIONS MONITOR (REAL-TIME PNL, SL, TP, LIQUIDATION)
  // =========================================================================
  checkOpenPositions(symbol) {
    const priceData = this.prices[symbol];
    if (!priceData) return;

    const remainingPositions = [];

    for (const pos of this.state.positions) {
      if (pos.symbol !== symbol) {
        remainingPositions.push(pos);
        continue;
      }

      const inst = this.instruments[symbol];
      const mark = priceData.mark;
      const isLong = pos.side === 'LONG';

      // 1. Calculate Real-Time Unrealized PnL
      // Long PnL = (Mark - Entry) * Quantity
      // Short PnL = (Entry - Mark) * Quantity
      const rawPnL = isLong ? (mark - pos.entryPrice) * pos.quantity : (pos.entryPrice - mark) * pos.quantity;
      pos.unrealizedPnL = Number(rawPnL.toFixed(2));
      pos.unrealizedPnLPct = Number(((rawPnL / pos.margin) * 100).toFixed(2));
      pos.updatedAt = Date.now();

      // 2. Check Liquidation Condition
      let liquidated = false;
      if (isLong && mark <= pos.liquidationPrice) {
        liquidated = true;
      } else if (!isLong && mark >= pos.liquidationPrice) {
        liquidated = true;
      }

      if (liquidated) {
        this.executePositionClose(pos, pos.quantity, pos.liquidationPrice, 'LIQUIDATION');
        continue;
      }

      // 3. Check Stop Loss Trigger
      let slTriggered = false;
      if (pos.stopLoss !== null) {
        if (isLong && priceData.bid <= pos.stopLoss) {
          slTriggered = true;
        } else if (!isLong && priceData.ask >= pos.stopLoss) {
          slTriggered = true;
        }
      }

      if (slTriggered) {
        const exitPrice = isLong ? priceData.bid : priceData.ask;
        this.executePositionClose(pos, pos.quantity, exitPrice, 'SL');
        continue;
      }

      // 4. Check Take Profit Trigger
      let tpTriggered = false;
      if (pos.takeProfit !== null) {
        if (isLong && priceData.bid >= pos.takeProfit) {
          tpTriggered = true;
        } else if (!isLong && priceData.ask <= pos.takeProfit) {
          tpTriggered = true;
        }
      }

      if (tpTriggered) {
        const exitPrice = isLong ? priceData.bid : priceData.ask;
        this.executePositionClose(pos, pos.quantity, exitPrice, 'TP');
        continue;
      }

      remainingPositions.push(pos);
    }

    this.state.positions = remainingPositions;
  }

  // =========================================================================
  // POSITION CLOSING (FULL OR PARTIAL)
  // =========================================================================
  closePosition(positionId, closeQuantity = null, reason = 'MANUAL') {
    const pos = this.state.positions.find(p => p.id === positionId);
    if (!pos) {
      throw new Error(`Position ${positionId} not found or already closed.`);
    }

    const priceData = this.prices[pos.symbol];
    if (!priceData || priceData.last <= 0) {
      throw new Error(`Market price unavailable to close ${pos.symbol}.`);
    }

    const isLong = pos.side === 'LONG';
    const exitPrice = isLong ? priceData.bid : priceData.ask;

    const requestedQty = closeQuantity ? parseFloat(closeQuantity) : pos.quantity;
    const qtyToClose = Math.min(pos.quantity, Math.max(0.001, requestedQty));

    return this.executePositionClose(pos, qtyToClose, exitPrice, reason);
  }

  executePositionClose(pos, qtyToClose, exitPrice, reason = 'MANUAL') {
    const inst = this.instruments[pos.symbol];
    const isLong = pos.side === 'LONG';
    const cleanCloseQty = Number(qtyToClose.toFixed(inst.qtyDecimals));

    // Calculate gross PnL on closed quantity
    const grossPnL = isLong ? (exitPrice - pos.entryPrice) * cleanCloseQty : (pos.entryPrice - exitPrice) * cleanCloseQty;

    // Closing fee
    const closeFee = (cleanCloseQty * exitPrice) * inst.takerFeeRate;
    const netPnL = grossPnL - closeFee;

    // Released margin proportional to closed quantity
    const marginRatio = cleanCloseQty / pos.quantity;
    const releasedMargin = pos.margin * marginRatio;

    // Return released margin + netPnL to wallet balance
    this.state.account.balance += (releasedMargin + netPnL);
    this.state.account.realizedPnL += netPnL;
    this.state.account.totalFees += closeFee;

    const tradeRecord = {
      id: 'trd-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      positionId: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: Number(exitPrice.toFixed(inst.priceDecimals)),
      quantity: cleanCloseQty,
      leverage: pos.leverage,
      grossPnL: Number(grossPnL.toFixed(2)),
      fee: Number(closeFee.toFixed(2)),
      netPnL: Number(netPnL.toFixed(2)),
      exitReason: reason, // 'TP', 'SL', 'MANUAL', 'PARTIAL', 'LIQUIDATION'
      durationMs: Date.now() - pos.createdAt,
      createdAt: pos.createdAt,
      closedAt: Date.now()
    };

    this.state.trades.unshift(tradeRecord);

    // Audit entry
    this.state.auditLog.unshift({
      id: 'audit-' + Date.now(),
      action: reason === 'LIQUIDATION' ? 'POSITION_LIQUIDATED' : 'POSITION_CLOSED',
      details: `${pos.side} ${cleanCloseQty} ${pos.symbol} closed at ${exitPrice} (${reason}). Net PnL: $${netPnL.toFixed(2)}`,
      timestamp: Date.now()
    });

    if (cleanCloseQty >= pos.quantity) {
      // Full close: remove from positions
      this.state.positions = this.state.positions.filter(p => p.id !== pos.id);
    } else {
      // Partial close: adjust remaining position
      pos.quantity = Number((pos.quantity - cleanCloseQty).toFixed(inst.qtyDecimals));
      pos.margin = pos.margin - releasedMargin;
      pos.maintenanceMargin = pos.quantity * pos.entryPrice * inst.maintenanceMarginRate;
      pos.realizedPnL += netPnL;
      pos.totalFees += closeFee;
      pos.updatedAt = Date.now();
    }

    this.recalculateAccount();
    this.storage.save();

    this.emit('position_closed', { trade: tradeRecord, position: pos, fullClose: cleanCloseQty >= pos.quantity });

    return tradeRecord;
  }

  // =========================================================================
  // POSITION MODIFICATION (SL / TP)
  // =========================================================================
  modifyPosition(positionId, { stopLoss = null, takeProfit = null }) {
    const pos = this.state.positions.find(p => p.id === positionId);
    if (!pos) {
      throw new Error(`Position ${positionId} not found.`);
    }

    const inst = this.instruments[pos.symbol];
    const isLong = pos.side === 'LONG';

    const sl = (stopLoss !== null && stopLoss !== '') ? Number(parseFloat(stopLoss).toFixed(inst.priceDecimals)) : null;
    const tp = (takeProfit !== null && takeProfit !== '') ? Number(parseFloat(takeProfit).toFixed(inst.priceDecimals)) : null;

    if (sl !== null) {
      if (isLong && sl >= pos.entryPrice) {
        throw new Error('Long stop loss must be below entry price.');
      }
      if (!isLong && sl <= pos.entryPrice) {
        throw new Error('Short stop loss must be above entry price.');
      }
    }

    if (tp !== null) {
      if (isLong && tp <= pos.entryPrice) {
        throw new Error('Long take profit must be above entry price.');
      }
      if (!isLong && tp >= pos.entryPrice) {
        throw new Error('Short take profit must be below entry price.');
      }
    }

    pos.stopLoss = sl;
    pos.takeProfit = tp;
    pos.updatedAt = Date.now();

    this.state.auditLog.unshift({
      id: 'audit-' + Date.now(),
      action: 'POSITION_MODIFIED',
      details: `${pos.side} ${pos.symbol} modified: SL=${sl || 'None'}, TP=${tp || 'None'}`,
      timestamp: Date.now()
    });

    this.storage.save();
    this.emit('position_updated', pos);
    return pos;
  }

  // =========================================================================
  // CANCEL ORDER
  // =========================================================================
  cancelOrder(orderId) {
    const ord = this.state.orders.find(o => o.id === orderId);
    if (!ord) {
      throw new Error(`Order ${orderId} not found.`);
    }

    this.state.orders = this.state.orders.filter(o => o.id !== orderId);
    this.recalculateAccount();
    this.storage.save();

    this.emit('order_cancelled', { orderId });
    return { success: true, orderId };
  }

  // =========================================================================
  // ACCOUNT BALANCE & MARGIN AGGREGATION
  // =========================================================================
  recalculateAccount() {
    let totalUsedMargin = 0;
    let totalUnrealizedPnL = 0;

    // Used margin from open positions
    for (const pos of this.state.positions) {
      totalUsedMargin += pos.margin;
      totalUnrealizedPnL += pos.unrealizedPnL;
    }

    // Margin reserved for pending limit orders
    for (const ord of this.state.orders) {
      if (ord.status === 'NEW') {
        totalUsedMargin += (ord.requiredMargin || 0);
      }
    }

    const account = this.state.account;
    account.usedMargin = Number(totalUsedMargin.toFixed(2));
    account.unrealizedPnL = Number(totalUnrealizedPnL.toFixed(2));
    account.equity = Number((account.balance + totalUnrealizedPnL).toFixed(2));
    account.availableBalance = Math.max(0, Number((account.balance - totalUsedMargin).toFixed(2)));

    account.marginRatio = account.equity > 0 ? Number(((totalUsedMargin / account.equity) * 100).toFixed(2)) : 0;
    account.updatedAt = Date.now();

    this.emit('account_updated', account);
  }

  // =========================================================================
  // DEMO RESET
  // =========================================================================
  resetDemoAccount(startingBalance = 10000, clearHistory = false) {
    const newState = this.storage.resetAccount(startingBalance, clearHistory);
    this.recalculateAccount();
    this.emit('account_reset', newState.account);
    return newState;
  }
}

module.exports = new TradingEngine();
