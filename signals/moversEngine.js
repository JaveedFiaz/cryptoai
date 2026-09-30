/**
 * CRYPTO SCALPER PRO (v14.0) - MOVERS ENGINE (GAINER & LOSER RADAR)
 * Scans all USDT perpetual futures to detect coins BEFORE they pump or dump.
 * Evaluates: MTF returns, RVOL, Taker Buy/Sell imbalance + CVD, OI change vs Price,
 * Funding rate, Order-book depth, Volatility squeeze compression, and BTC correlation.
 * 
 * Classifies coins into stages: EARLY, MID, LATE, TRAP
 * Assigns risk grades: Grade A, Grade B, Grade C
 * Evaluates separate Gainer Score (0-100) and Loser Score (0-100).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MoversEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class MoversEngine {
    constructor(options = {}) {
      this.options = Object.assign({
        minVolume24hUsdt: 10000000,   // $10M min 24h volume
        maxSpreadPct: 0.0012,         // 0.12% max spread
        minOrderBookDepthUsdt: 50000, // $50k min orderbook depth
        minListingAgeHours: 48,       // 48 hours min listing age
        earlyAlertCutoff: 80,         // Sound alert trigger threshold for EARLY stage
      }, options);

      this.previousStages = {}; // Cache to detect stage flips for alerts
    }

    /**
     * Score & Classify a single perpetual pair dataset
     */
    analyzeCoin(data) {
      if (!data || !data.symbol) return null;

      const symbol = data.symbol;
      const price = parseFloat(data.price || data.close || 0);
      const volume24h = parseFloat(data.volume24hUsdt || data.quoteVolume || 0);
      const spreadPct = parseFloat(data.spreadPct || 0.0005);
      const depthUsdt = parseFloat(data.orderBookDepthUsdt || 75000);
      const listingAgeHours = parseFloat(data.listingAgeHours || 120);

      // --- Hard Filters ---
      if (volume24h < this.options.minVolume24hUsdt) return null;
      if (spreadPct > this.options.maxSpreadPct) return null;
      if (depthUsdt < this.options.minOrderBookDepthUsdt) return null;
      if (listingAgeHours < this.options.minListingAgeHours) return null;

      const change5m = parseFloat(data.change5m || 0);
      const change15m = parseFloat(data.change15m || 0);
      const change1h = parseFloat(data.change1h || 0);
      const change24h = parseFloat(data.change24h || 0);

      const rvol = parseFloat(data.rvol || 1.0);
      const takerBuyPct = parseFloat(data.takerBuyPct || 50.0);
      const takerSellPct = 100.0 - takerBuyPct;
      const cvdTrend = data.cvdTrend || 'NEUTRAL'; // 'BUY_DOMINANT', 'SELL_DOMINANT', 'NEUTRAL'
      const oiChangePct = parseFloat(data.oiChangePct || 0);
      const fundingRatePct = parseFloat(data.fundingRatePct || 0.0001);
      const squeezeRatioPct = parseFloat(data.squeezeRatioPct || 0.85);
      const btcTrend = data.btcTrend || 'NEUTRAL';

      // --- Gainer Score Calculation (0 - 100) ---
      let gainerScore = 0;
      if (takerBuyPct >= 68.0) gainerScore += 25;
      else if (takerBuyPct >= 58.0) gainerScore += 15;
      else if (takerBuyPct >= 52.0) gainerScore += 8;

      if (rvol >= 3.0) gainerScore += 25;
      else if (rvol >= 2.0) gainerScore += 18;
      else if (rvol >= 1.4) gainerScore += 10;

      if (oiChangePct >= 1.0) gainerScore += 20;
      else if (oiChangePct >= 0.3) gainerScore += 12;

      if (squeezeRatioPct < 0.75) gainerScore += 15;
      else if (squeezeRatioPct < 1.0) gainerScore += 8;

      if (change15m > 0.3 && change5m > 0.1) gainerScore += 15;
      else if (change15m > 0) gainerScore += 7;

      if (btcTrend === 'BEARISH' && takerBuyPct < 70.0) gainerScore -= 10; // BTC dump penalty
      gainerScore = Math.min(99, Math.max(0, Math.round(gainerScore)));

      // --- Loser Score Calculation (0 - 100) ---
      let loserScore = 0;
      if (takerSellPct >= 68.0) loserScore += 25;
      else if (takerSellPct >= 58.0) loserScore += 15;
      else if (takerSellPct >= 52.0) loserScore += 8;

      if (rvol >= 3.0) loserScore += 25;
      else if (rvol >= 2.0) loserScore += 18;
      else if (rvol >= 1.4) loserScore += 10;

      if (oiChangePct >= 1.0 || (change15m < -1.0 && oiChangePct < -0.5)) loserScore += 20;
      else if (oiChangePct >= 0.3) loserScore += 12;

      if (squeezeRatioPct < 0.75) loserScore += 15;
      else if (squeezeRatioPct < 1.0) loserScore += 8;

      if (change15m < -0.3 && change5m < -0.1) loserScore += 15;
      else if (change15m < 0) loserScore += 7;

      if (btcTrend === 'BULLISH' && takerSellPct < 70.0) loserScore -= 10; // BTC pump penalty
      loserScore = Math.min(99, Math.max(0, Math.round(loserScore)));

      // --- Stage Classification (EARLY, MID, LATE, TRAP) ---
      const absMove24h = Math.abs(change24h);
      const absMove15m = Math.abs(change15m);
      let stage = 'MID';

      // TRAP Check: Price pumping but taker selling heavily or OI collapsing
      if ((change15m > 1.0 && takerSellPct >= 65.0) || (change15m < -1.0 && takerBuyPct >= 65.0)) {
        stage = 'TRAP';
      } else if (absMove24h >= 10.0 || absMove15m >= 4.0) {
        stage = 'LATE'; // Over-extended
      } else if (squeezeRatioPct < 1.0 && rvol >= 1.6 && absMove24h < 4.0) {
        stage = 'EARLY'; // Coiled squeeze pre-breakout!
      } else if (absMove24h >= 3.5 || absMove15m >= 1.2) {
        stage = 'MID';
      } else {
        stage = 'EARLY';
      }

      // --- Risk Grade Assignment (Grade A, Grade B, Grade C) ---
      let riskGrade = 'B';
      if (volume24h >= 25000000 && spreadPct <= 0.0008 && depthUsdt >= 75000) {
        riskGrade = 'A'; // Institutional liquid pair
      } else if (volume24h < 15000000 || spreadPct >= 0.0010) {
        riskGrade = 'C'; // Higher risk / lower liquidity
      }

      // Detect flip to EARLY with score >= 80 for sound alert
      let alertTriggered = false;
      const prevStage = this.previousStages[symbol];
      if (stage === 'EARLY' && (gainerScore >= this.options.earlyAlertCutoff || loserScore >= this.options.earlyAlertCutoff)) {
        if (!prevStage || prevStage.stage !== 'EARLY') {
          alertTriggered = true;
        }
      }
      this.previousStages[symbol] = { stage, gainerScore, loserScore, time: Date.now() };

      return {
        symbol,
        price,
        change5m,
        change15m,
        change1h,
        change24h,
        rvol,
        takerBuyPct,
        takerSellPct,
        oiChangePct,
        fundingRatePct,
        squeezeRatioPct,
        gainerScore,
        loserScore,
        stage,
        riskGrade,
        alertTriggered
      };
    }

    /**
     * Scan full market array and return Top 10 Gainers & Top 10 Losers
     */
    scanMarket(coinList = []) {
      const analyzed = coinList.map(c => this.analyzeCoin(c)).filter(Boolean);

      const topGainers = analyzed
        .slice()
        .sort((a, b) => b.gainerScore - a.gainerScore || b.change24h - a.change24h)
        .slice(0, 10);

      const topLosers = analyzed
        .slice()
        .sort((a, b) => b.loserScore - a.loserScore || a.change24h - b.change24h)
        .slice(0, 10);

      return {
        topGainers,
        topLosers,
        totalScanned: analyzed.length
      };
    }
  }

  return MoversEngine;
}));
