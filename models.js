/**
 * CRYPTO SCALPER PRO - DEMO TRADING DATA MODELS & SPECIFICATIONS
 * Defines contract specifications, account, position, order, and trade models.
 */

// =============================================================================
// INSTRUMENT SPECIFICATIONS
// =============================================================================
const INSTRUMENTS = {
  'BTCUSDT': {
    symbol: 'BTCUSDT',
    name: 'Bitcoin / Tether',
    category: 'CRYPTO',
    feedSymbol: 'BTCUSDT',
    feedType: 'FUTURES',
    contractSize: 1.0,
    tickSize: 0.1,
    priceDecimals: 1,
    minQty: 0.001,
    maxQty: 50.0,
    qtyStep: 0.001,
    qtyDecimals: 3,
    maxLeverage: 100,
    defaultLeverage: 10,
    availableLeverages: [1, 2, 3, 5, 10, 20, 30, 50, 100],
    maintenanceMarginRate: 0.004,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    spreadFactor: 0.00004
  },
  'ETHUSDT': {
    symbol: 'ETHUSDT',
    name: 'Ethereum / Tether',
    category: 'CRYPTO',
    feedSymbol: 'ETHUSDT',
    feedType: 'FUTURES',
    contractSize: 1.0,
    tickSize: 0.01,
    priceDecimals: 2,
    minQty: 0.01,
    maxQty: 250.0,
    qtyStep: 0.01,
    qtyDecimals: 2,
    maxLeverage: 100,
    defaultLeverage: 10,
    availableLeverages: [1, 2, 3, 5, 10, 20, 30, 50, 100],
    maintenanceMarginRate: 0.005,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    spreadFactor: 0.00005
  },
  'SOLUSDT': {
    symbol: 'SOLUSDT',
    name: 'Solana / Tether',
    category: 'CRYPTO',
    feedSymbol: 'SOLUSDT',
    feedType: 'FUTURES',
    contractSize: 1.0,
    tickSize: 0.01,
    priceDecimals: 2,
    minQty: 0.1,
    maxQty: 2000.0,
    qtyStep: 0.1,
    qtyDecimals: 1,
    maxLeverage: 50,
    defaultLeverage: 10,
    availableLeverages: [1, 2, 3, 5, 10, 20, 30, 50],
    maintenanceMarginRate: 0.01,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    spreadFactor: 0.00008
  },
  'BNBUSDT': {
    symbol: 'BNBUSDT',
    name: 'BNB / Tether',
    category: 'CRYPTO',
    feedSymbol: 'BNBUSDT',
    feedType: 'FUTURES',
    contractSize: 1.0,
    tickSize: 0.01,
    priceDecimals: 2,
    minQty: 0.05,
    maxQty: 500.0,
    qtyStep: 0.01,
    qtyDecimals: 2,
    maxLeverage: 50,
    defaultLeverage: 10,
    availableLeverages: [1, 2, 3, 5, 10, 20, 30, 50],
    maintenanceMarginRate: 0.01,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    spreadFactor: 0.00008
  },
  'XRPUSDT': {
    symbol: 'XRPUSDT',
    name: 'Ripple / Tether',
    category: 'CRYPTO',
    feedSymbol: 'XRPUSDT',
    feedType: 'FUTURES',
    contractSize: 1.0,
    tickSize: 0.0001,
    priceDecimals: 4,
    minQty: 1.0,
    maxQty: 50000.0,
    qtyStep: 1.0,
    qtyDecimals: 0,
    maxLeverage: 50,
    defaultLeverage: 10,
    availableLeverages: [1, 2, 3, 5, 10, 20, 30, 50],
    maintenanceMarginRate: 0.01,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    spreadFactor: 0.0001
  },
  'DOGEUSDT': {
    symbol: 'DOGEUSDT',
    name: 'Dogecoin / Tether',
    category: 'CRYPTO',
    feedSymbol: 'DOGEUSDT',
    feedType: 'FUTURES',
    contractSize: 1.0,
    tickSize: 0.00001,
    priceDecimals: 5,
    minQty: 10.0,
    maxQty: 1000000.0,
    qtyStep: 1.0,
    qtyDecimals: 0,
    maxLeverage: 50,
    defaultLeverage: 10,
    availableLeverages: [1, 2, 3, 5, 10, 20, 30, 50],
    maintenanceMarginRate: 0.01,
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    spreadFactor: 0.0001
  }
};

// =============================================================================
// FACTORY FUNCTIONS FOR PERSISTENT STATE
// =============================================================================

function createInitialAccount(startingBalance = 10000) {
  return {
    id: 'demo-wallet',
    startingBalance: Number(startingBalance),
    balance: Number(startingBalance),
    usedMargin: 0,
    availableBalance: Number(startingBalance),
    unrealizedPnL: 0,
    realizedPnL: 0,
    totalFees: 0,
    equity: Number(startingBalance),
    marginRatio: 0, // (usedMargin / equity) * 100
    currency: 'USD',
    updatedAt: Date.now()
  };
}

/**
 * Calculate exact isolated liquidation price:
 * For LONG: Entry * (1 - 1/Leverage + MaintenanceMarginRate)
 * For SHORT: Entry * (1 + 1/Leverage - MaintenanceMarginRate)
 */
function calculateLiquidationPrice(side, entryPrice, leverage, mmr) {
  const lev = Math.max(1, Number(leverage));
  const rate = Number(mmr);
  const entry = Number(entryPrice);

  if (side === 'LONG' || side === 'BUY') {
    const liq = entry * (1 - (1 / lev) + rate);
    return Math.max(0, liq);
  } else {
    const liq = entry * (1 + (1 / lev) - rate);
    return liq;
  }
}

/**
 * Calculate required initial isolated margin:
 * Margin = (Quantity * Price) / Leverage
 */
function calculateRequiredMargin(quantity, price, leverage) {
  const notional = Number(quantity) * Number(price);
  return notional / Math.max(1, Number(leverage));
}

if (typeof window !== 'undefined') {
  window.INSTRUMENTS = INSTRUMENTS;
  window.createInitialAccount = createInitialAccount;
  window.calculateLiquidationPrice = calculateLiquidationPrice;
  window.calculateRequiredMargin = calculateRequiredMargin;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    INSTRUMENTS,
    createInitialAccount,
    calculateLiquidationPrice,
    calculateRequiredMargin
  };
}
