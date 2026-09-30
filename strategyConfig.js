/**
 * CRYPTO SCALPER PRO (v14.0) - QUANTITATIVE STRATEGY CONFIGURATION
 * Centralized tunable parameters for Signal Engine, Movers Radar, Risk Management,
 * and Backtesting Framework.
 */

const StrategyConfig = {
  // --- Confluence Scoring Thresholds ---
  minConfluenceScore: 80,           // Score threshold (0-100) required to emit an A+ signal
  sniperMinScore: 90,               // Ultra-high conviction score threshold
  maxSignalsPerHour: 5,             // Target max A+ signals per hour across all pairs

  // --- 1. BTC Regime & Trend Filter (3-State: BULL / NEUTRAL / BEAR) ---
  btcRegime: {
    enabled: true,                  // 3-State BTC Regime Filter
    ema15mPeriod: 21,               // 15m EMA for slope calculation
    slopeThresholdPct: 0.0008,      // 0.08% slope threshold for trend bias
    return5mThresholdPct: 0.0025,   // 0.25% 5m return threshold for impulse detection
    // Regime Rules:
    // BULLISH: Longs allowed, Shorts blocked
    // BEARISH: Shorts allowed, Longs blocked
    // NEUTRAL: Both Longs & Shorts allowed if score >= minConfluenceScore
  },

  // --- 2. Higher-Timeframe (HTF) Trend Alignment ---
  htfTrend: {
    enabled: true,                  // Mandatory HTF trend filter
    tf15mFastEma: 21,
    tf15mSlowEma: 55,
    tf1hFastEma: 21,
    tf1hSlowEma: 55,
    requireVwapAlignment: true,     // Price > VWAP for Long, < VWAP for Short
  },

  // --- 3. Market Structure & Liquidity Targets ---
  structure: {
    pivotLookback: 5,               // Pivot lookback bars
    eqTolerancePct: 0.0015,         // 0.15% EQH/EQL tolerance
    minSweepWickPct: 0.35,          // Min wick ratio for sweep detection
    requireReclaimClose: true,      // Must close back inside range after sweep
    bosLookbackBars: 20,            // Lookback bars for BOS / CHoCH
    orderBlockWindow: 15,           // Lookback bars for active Order Block / FVG retest
  },

  // --- 4. Volume & Momentum Confirmation ---
  momentum: {
    minRvol: 1.5,                   // RVOL >= 1.5x 20-period SMA
    requireTakerImbalance: true,    // Taker buy/sell delta confirmation
    minTakerBuyPct: 58.0,           // Min Taker Buy % for Longs
    maxTakerBuyPct: 42.0,           // Max Taker Buy % for Shorts (>= 58% Sell)
    rsiOverbought: 70.0,
    rsiOversold: 30.0,
    lowAdxRangingCutoff: 16.0,      // Block momentum trades if ADX < 16 (dead range)
  },

  // --- 5. Volatility & Microstructure Filters ---
  filters: {
    atrPeriod: 14,
    minAtrPct: 0.002,               // Min 0.2% ATR to ensure volatility room for 1:2 R:R
    maxAtrPct: 0.035,               // Max 3.5% ATR to skip chaotic wicks
    maxSlAtrMult: 2.5,              // Cap Stop Loss distance at 2.5x ATR maximum
    maxSpreadPct: 0.001,            // Max allowed spread (0.10%)
    minOrderBookDepthUsdt: 50000,   // Min $50,000 top-5 bid/ask liquidity depth
    maxFundingRatePct: 0.0012,      // 0.12% per 8h funding crowding threshold
    sessionFilterEnabled: true,
    highLiquidityHoursUTC: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  },

  // --- 6. Tab 4: MOVERS RADAR (Gainer / Loser Engine) Config ---
  movers: {
    scanIntervalMs: 30000,          // 30s scan interval
    minVolume24hUsdt: 10000000,     // Min $10M 24h volume
    maxSpreadPct: 0.0012,           // Max 0.12% spread
    minListingAgeHours: 48,         // Exclude new listings < 48 hours old
    earlyAlertScoreCutoff: 80,      // Play sound alert when coin flips to EARLY with score >= 80
    stageThresholds: {
      earlyRvolMin: 2.0,            // EARLY stage: high RVOL, early squeeze expansion
      midPriceMovePct: 3.5,         // MID stage: move in progress
      latePriceMovePct: 10.0,       // LATE stage: over-extended move (> 10% 24h)
      trapOrderflowImbalance: 75.0, // TRAP stage: price pumping but taker selling heavily
    }
  },

  // --- 7. Risk & Trade Management Rules ---
  risk: {
    riskPerTradePct: 1.0,           // 1% equity risk per trade
    minAcceptableRR: 2.0,           // REJECT any signal with R:R < 1:2.0
    slMethod: 'STRUCTURE',          // Structure Swing + ATR buffer (capped at 2.5x ATR)
    tp1RMult: 1.0,                  // TP1: 1R (Partial 50% exit + move SL to breakeven)
    tp2RMult: 2.0,                  // TP2: Structure-derived or 2R
    tp3RMult: 3.0,                  // TP3: Structure-derived opposing OB or 3R
    cooldownMinutes: 30,            // 30 min cooldown per pair after signal/loss
    maxConcurrentOpenTrades: 3,     // Max 3 active open positions
    maxDailyLossPct: 3.0,           // Daily stop-out limit (3.0% cumulative loss)
    maxLeverageCap: 10,             // Max 10x leverage cap for safety
  },

  // --- 8. Execution & Paper Trading ---
  execution: {
    paperModeOnly: true,            // Shadow/Paper mode default (NO live execution)
    liveAutoExecuteEnabled: false,  // Live MEXC futures toggle (OFF by default)
    makerFeeRate: 0.0002,           // 0.02% Maker fee
    takerFeeRate: 0.0005,           // 0.05% Taker fee
    slippageRate: 0.0002,           // 0.02% Slippage
    fundingRate8h: 0.0001           // 0.01% Funding cost estimate
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StrategyConfig;
} else if (typeof window !== 'undefined') {
  window.StrategyConfig = StrategyConfig;
}
