/**
 * CRYPTO SCALPER PRO - QUANTITATIVE STRATEGY CONFIGURATION
 * All thresholds and parameters are named variables that can be tuned
 * without modifying strategy execution code.
 */

const StrategyConfig = {
  // --- Confluence Scoring Thresholds ---
  minConfluenceScore: 80,           // Minimum score (0-100) required to emit an A+ signal
  sniperMinScore: 90,               // Score threshold for ultra-high conviction sniper trades
  maxSignalsPerHour: 5,             // Target max A+ signals per hour across all pairs

  // --- 1. Higher-Timeframe (HTF) Trend Filter (Mandatory) ---
  htfTrend: {
    enabled: true,                  // Mandatory HTF trend filter (No counter-trend scalps)
    tf15mFastEma: 21,               // 15m Fast EMA period
    tf15mSlowEma: 55,               // 15m Slow EMA period
    tf1hFastEma: 21,                // 1h Fast EMA period
    tf1hSlowEma: 55,                // 1h Slow EMA period
    requireVwapAlignment: true,     // Price must be above VWAP for Long, below VWAP for Short
  },

  // --- 2. Market Structure & Liquidity ---
  structure: {
    pivotLookback: 5,               // Left/right lookback for swing high/low pivots
    eqTolerancePct: 0.0015,         // Equal Highs / Lows tolerance (0.15%)
    minSweepWickPct: 0.35,          // Minimum wick ratio (35%) required for liquidity sweep
    requireReclaimClose: true,      // Must reclaim and close back inside range after sweep
    bosLookbackBars: 20,            // Lookback bars to verify BOS / CHoCH on 1m/5m
    orderBlockWindow: 15,           // Lookback bars for active Order Block / FVG retest
  },

  // --- 3. Volume & Momentum Confirmation ---
  momentum: {
    minRvol: 1.5,                   // RVOL threshold (1.5x 20-period volume SMA)
    requireTakerImbalance: true,    // Require taker buy/sell imbalance delta confirmation
    minTakerBuyPct: 58.0,           // Minimum taker buy % for Longs
    maxTakerBuyPct: 42.0,           // Maximum taker buy % for Shorts (>= 58% Sell)
    rsiOverbought: 70.0,            // RSI overbought guard for Longs (unless sweep reversal)
    rsiOversold: 30.0,              // RSI oversold guard for Shorts (unless sweep reversal)
    rsiOptimalLongMin: 45.0,        // Prime RSI range for Long momentum continuation
    rsiOptimalLongMax: 65.0,
    rsiOptimalShortMin: 35.0,
    rsiOptimalShortMax: 55.0,
  },

  // --- 4. Volatility & Session Filters ---
  filters: {
    atrPeriod: 14,                  // ATR calculation period
    minAtrPct: 0.002,               // Minimum ATR % of price (0.2%) — ensure volatility room
    maxAtrPct: 0.035,               // Maximum ATR % of price (3.5%) — skip chaotic wicks
    sessionFilterEnabled: true,     // Prefer high-liquidity London/NY sessions
    highLiquidityHoursUTC: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], // 07:00 to 20:00 UTC
    newsFilterEnabled: true,        // Skip signals around major high-impact news windows
    newsBlockWindowMinutes: 15,     // Block signals 15 mins before/after high-impact news
  },

  // --- 5. Market Context Filters ---
  context: {
    btcFilterEnabled: true,         // Skip Longs if BTC 5m dumping, skip Shorts if BTC 5m pumping
    btcEmaPeriod: 20,               // BTC 5m trend EMA benchmark
    maxSpreadPct: 0.001,            // Maximum allowed spread % (0.1%)
    maxFundingRatePct: 0.001,       // Funding rate extreme check (0.1% per 8h)
  },

  // --- Risk & Trade Rules ---
  risk: {
    riskPerTradePct: 1.0,           // Risk 1% of equity per trade
    minAcceptableRR: 2.0,           // REJECT any signal with R:R < 1:2.0
    slMethod: 'STRUCTURE',          // 'STRUCTURE' (swing high/low + ATR buffer) or 'ATR'
    slAtrBuffer: 0.5,               // ATR buffer beyond swing high/low for SL
    slMinAtrMult: 1.5,              // Minimum ATR multiplier for SL
    tp1RMult: 1.0,                  // TP1: 1R (Partial exit 50% + move SL to breakeven)
    tp2RMult: 2.0,                  // TP2: 2R
    tp3RMult: 3.0,                  // TP3: 3R (Trail remaining using structure/ATR)
    trailingAtrMult: 1.5,           // Trailing stop ATR distance
    cooldownMinutes: 30,            // No repeat signal on same pair for 30 min after signal/loss
    maxConcurrentOpenTrades: 3,     // Max 3 active concurrent trades
    maxDailyLossPct: 3.0,           // Daily stop-out after 3.0% cumulative daily loss
  },

  // --- Execution & Paper Trading Modes ---
  execution: {
    paperModeOnly: true,            // Shadow/Paper mode ON by default (safe verification)
    liveAutoExecuteEnabled: false,  // Live MEXC futures auto-execution toggle (OFF by default)
    makerFeeRate: 0.0002,           // 0.02% Maker Fee
    takerFeeRate: 0.0005,           // 0.05% Taker Fee
    slippageRate: 0.0002,           // 0.02% estimated execution slippage
    fundingRate8h: 0.0001           // 0.01% estimated funding cost per 8h
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StrategyConfig;
} else if (typeof window !== 'undefined') {
  window.StrategyConfig = StrategyConfig;
}
