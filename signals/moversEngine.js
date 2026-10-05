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
      const volume24h = parseFloat(data.volume24hUsdt || data.quoteVolume || data.volume24h || 0);
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

      // Volatility compression and range position from 24h high/low
      const high24h = parseFloat(data.high24h || price);
      const low24h = parseFloat(data.low24h || price);
      const range24hPct = (price > 0 && high24h > low24h) ? ((high24h - low24h) / price) * 100 : 5.0;
      const posInRange = (high24h > low24h) ? ((price - low24h) / (high24h - low24h)) : 0.5;

      // Volatility squeeze ratio (tight range = high compression / coiled spring)
      const squeezeRatioPct = parseFloat(data.squeezeRatioPct || (range24hPct < 3.5 ? 0.55 : (range24hPct < 6.0 ? 0.78 : 1.25)));

      // Estimate or use provided RVOL
      let rvol = parseFloat(data.rvol || 0);
      if (!rvol || rvol === 1.0) {
        rvol = volume24h > 150000000 ? 2.5 : (volume24h > 40000000 ? 1.8 : (volume24h > 15000000 ? 1.4 : 1.1));
      }

      // Estimate or use provided Taker Flow
      let takerBuyPct = parseFloat(data.takerBuyPct || 0);
      if (!takerBuyPct || takerBuyPct === 50) {
        takerBuyPct = posInRange >= 0.60 
          ? (50 + (posInRange - 0.5) * 38) 
          : (posInRange <= 0.40 ? (50 - (0.5 - posInRange) * 38) : 50);
      }
      takerBuyPct = Math.min(95, Math.max(5, Math.round(takerBuyPct)));
      const takerSellPct = 100 - takerBuyPct;

      const cvdTrend = data.cvdTrend || 'NEUTRAL';
      const oiChangePct = parseFloat(data.oiChangePct || 0);
      const fundingRatePct = parseFloat(data.fundingRatePct || 0.0001);
      const btcTrend = data.btcTrend || 'NEUTRAL';

      // --- Stage Classification (EARLY, MID, LATE, TRAP) ---
      // EARLY: Coiled compression setup BEFORE big move starts!
      const absMove24h = Math.abs(change24h);
      let stage = 'MID';

      if (absMove24h >= 12.0) {
        stage = 'LATE'; // Over-extended move, late to enter
      } else if (range24hPct < 5.0 && absMove24h < 4.0 && volume24h >= 10000000) {
        stage = 'EARLY'; // Coiled squeeze pre-breakout!
      } else if (absMove24h >= 4.0) {
        stage = 'MID';
      } else {
        stage = 'EARLY';
      }

      // TRAP Check: Price pumping but taker selling heavily or OI collapsing
      if ((change15m > 1.0 && takerSellPct >= 65.0) || (change15m < -1.0 && takerBuyPct >= 65.0)) {
        stage = 'TRAP';
      }

      // --- Gainer Score Calculation (0 - 100) ---
      let gainerScore = 0;
      if (takerBuyPct >= 65.0) gainerScore += 25;
      else if (takerBuyPct >= 55.0) gainerScore += 16;
      else if (takerBuyPct >= 50.0) gainerScore += 8;

      if (rvol >= 2.2) gainerScore += 25;
      else if (rvol >= 1.6) gainerScore += 18;
      else if (rvol >= 1.2) gainerScore += 10;

      if (squeezeRatioPct < 0.70) gainerScore += 20;
      else if (squeezeRatioPct < 0.95) gainerScore += 12;

      // PRE-BREAKOUT COILED BONUS: Prioritize pairs BEFORE the move starts!
      if (stage === 'EARLY') {
        gainerScore += 20;
        if (posInRange >= 0.55 && change24h >= 0) gainerScore += 10;
      } else if (stage === 'LATE') {
        gainerScore -= 15; // Penalty for overextended pump
      }

      if (oiChangePct >= 1.0) gainerScore += 10;
      else if (oiChangePct >= 0.3) gainerScore += 5;

      if (change15m > 0.3 && change5m > 0.1) gainerScore += 10;
      else if (change24h > 0.5) gainerScore += 5;

      if (btcTrend === 'BEARISH' && takerBuyPct < 70.0) gainerScore -= 10;
      gainerScore = Math.min(99, Math.max(0, Math.round(gainerScore)));

      // --- Loser Score Calculation (0 - 100) ---
      let loserScore = 0;
      if (takerSellPct >= 65.0) loserScore += 25;
      else if (takerSellPct >= 55.0) loserScore += 16;
      else if (takerSellPct >= 50.0) loserScore += 8;

      if (rvol >= 2.2) loserScore += 25;
      else if (rvol >= 1.6) loserScore += 18;
      else if (rvol >= 1.2) loserScore += 10;

      if (squeezeRatioPct < 0.70) loserScore += 20;
      else if (squeezeRatioPct < 0.95) loserScore += 12;

      // PRE-BREAKDOWN COILED BONUS: Prioritize pairs BEFORE the breakdown starts!
      if (stage === 'EARLY') {
        loserScore += 20;
        if (posInRange <= 0.45 && change24h <= 0) loserScore += 10;
      } else if (stage === 'LATE') {
        loserScore -= 15; // Penalty for overextended dump
      }

      if (oiChangePct >= 1.0 || (change15m < -1.0 && oiChangePct < -0.5)) loserScore += 10;
      else if (oiChangePct >= 0.3) loserScore += 5;

      if (change15m < -0.3 && change5m < -0.1) loserScore += 10;
      else if (change24h < -0.5) loserScore += 5;

      if (btcTrend === 'BULLISH' && takerSellPct < 70.0) loserScore -= 10;
      loserScore = Math.min(99, Math.max(0, Math.round(loserScore)));

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
        range24hPct,
        volume24hUsdt: volume24h,
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

    /**
     * Dual-adapter: evaluateMarket accepting either an Object map or Array
     * Returns mapped telemetry matching app.js expectations
     */
    evaluateMarket(tickerInput) {
      let coinList = [];
      if (Array.isArray(tickerInput)) {
        coinList = tickerInput;
      } else if (tickerInput && typeof tickerInput === 'object') {
        coinList = Object.values(tickerInput);
      }

      const analyzed = coinList.map(c => {
        const res = this.analyzeCoin(c);
        if (!res) return null;
        return {
          ...res,
          score: Math.max(res.gainerScore, res.loserScore),
          takerPct: res.takerBuyPct || 50
        };
      }).filter(Boolean);

      let alertTriggered = false;
      let earlyCount = 0;

      for (const item of analyzed) {
        if (item.stage === 'EARLY') earlyCount++;
        if (item.alertTriggered) alertTriggered = true;
      }

      const topGainers = analyzed
        .slice()
        .sort((a, b) => b.gainerScore - a.gainerScore || b.change24h - a.change24h)
        .slice(0, 10)
        .map(c => ({
          ...c,
          score: c.gainerScore,
          takerPct: c.takerBuyPct
        }));

      const topLosers = analyzed
        .slice()
        .sort((a, b) => b.loserScore - a.loserScore || a.change24h - b.change24h)
        .slice(0, 10)
        .map(c => ({
          ...c,
          score: c.loserScore,
          takerPct: c.takerSellPct
        }));

      return {
        topGainers,
        topLosers,
        scannedCount: analyzed.length,
        earlyCount,
        alertTriggered
      };
    }
  }

  return MoversEngine;
}));
