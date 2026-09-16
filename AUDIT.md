# AUDIT.md — Crypto Scalper Pro v7
**Generated:** 2026-09-16  
**Auditor:** Antigravity AI (Senior Engineering Review)  
**Scope:** Phase 0 — Full codebase audit before any rework touches a single line.

---

## 1. Stack Inventory

| Item | Value |
|---|---|
| Runtime | Node.js >= 18.0.0 (built-in `fetch` required) |
| HTTP framework | **None** — raw `http.createServer()` in `server.js` |
| External npm dependencies | **Zero** — only Node built-ins (`http`, `fs`, `path`, `crypto`, `os`, `child_process`) |
| Frontend framework | **None** — vanilla JavaScript (one 4657-line `ScalperApp` class) |
| Chart library | Lightweight Charts (loaded from CDN in `index.html`) |
| Database | Custom JSON flat-file store (`database/db.js`) — SQLite was planned but never implemented |
| Deployment config | `package.json` => `node server.js`; `railway.json`; `Procfile` |
| Build step | **None** — static serving of `index.html` + `.js` + `.css` |
| Entry point | `server.js` |
| Start command | `node server.js` (Railway: same) |
| Port | `process.env.PORT || 3000`, bound to `0.0.0.0` |
| Mobile / CDN mode | `app.js` detects non-localhost and activates standalone mode |
| Surge CDN URL | `https://crypto-scalper-live.surge.sh` |

---

## 2. Module Map

### 2a. Market Data

| File | Role |
|---|---|
| `server.js:114-147` | Background `pollMarketPrices()` — polls Binance Futures `/fapi/v1/ticker/24hr` every 1 second for 6 symbols; feeds `tradingEngine.updatePrice()` and broadcasts via SSE |
| `app.js` (WS init) | Client-side WebSocket to `stream.binance.com` — 1-min kline stream for selected pair |
| `app.js` (ticker WS) | Separate WS for real-time tick price updates |
| `scanner/marketScanner.js` | Fetches 100 klines per symbol from `fapi.binance.com/fapi/v1/klines` every 20 seconds for 6 pairs |

### 2b. Indicator Computation

| File | Role |
|---|---|
| `engine.js` | All indicators: EMA (SMA seed), RMA (Wilder), RSI, MACD, ATR, ADX/DMI, VWAP (session-reset), Pivot Highs/Lows |
| `signals/scoringEngine.js` | 100-point confluence scorer — called from `engine.js:analyze()` per bar |
| `signals/marketStructure.js` | Swing pivot detection, HH/HL/LH/LL labelling, BOS/CHoCH detection, S/R zones |
| `signals/liquidityEngine.js` | Equal-highs/equal-lows detection, liquidity sweep (stop-hunt) detection with wick-ratio filter |
| `signals/mtfEngine.js` | Multi-timeframe alignment evaluator (15m macro, 5m structure, 1m trigger) |

### 2c. A+ Detection Engine

See Section 3 below.

### 2d. Signal Storage

| File | Role |
|---|---|
| `database/db.js` | `signals_audit` collection => `data/signals_audit.json` (capped at 500 entries) |
| `execution/orderRouter.js` | In-memory `auditLogs[]` array (up to 200 entries, lost on restart) |
| `app.js` (localStorage) | Signal cards stored client-side only; no server persistence |

### 2e. Order Execution

| File | Role |
|---|---|
| `execution/orderRouter.js` | Routes orders to MEXC real or paper broker based on `this.mode` |
| `execution/executionFilter.js` | 15-point pre-flight gate — ALL 15 must pass before order reaches exchange |
| `exchanges/mexcClient.js` | MEXC Contract API v1 client — HMAC-SHA256 signing, isolated margin |
| `exchanges/mockExchange.js` | Sandboxed mock exchange for paper mode |
| `tradingEngine.js` | Paper broker — manages simulated positions, PnL, liquidation, fees |
| `clientTradingEngine.js` | Browser-side paper engine for standalone/CDN mode |

### 2f. UI

| File | Role |
|---|---|
| `index.html` (~1411 lines) | HTML shell, all modal markup, mobile tabs |
| `styles.css` (~52 KB) | All CSS |
| `app.js` (~4657 lines) | Single `ScalperApp` class — DOM manipulation, chart rendering, event handlers |
| `alertService.js` (~708 lines) | Client-side alert dispatcher — Discord, ntfy.sh, Telegram, WhatsApp/CallMeBot |

### 2g. Background Workers

| Location | Worker | Interval |
|---|---|---|
| `server.js:103-107` | `marketScanner.scanAll()` | every 20 s |
| `server.js:146` | `pollMarketPrices()` | every 1 s |
| `server.js:108` | Initial scan warm-up | once at +3 s startup |
| `app.js` (chart loop) | Engine analyze + chart update | on each kline WS bar close |

### 2h. Config / Environment

| Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP server port | 3000 |
| `MEXC_API_KEY` | MEXC futures API key | — |
| `MEXC_API_SECRET` | MEXC futures API secret | — |
| `MEXC_BASE_URL` | MEXC contract base URL | `https://contract.mexc.com` |
| `ADMIN_PASSWORD` | Auth token for enabling auto-trade | `scalper_admin_2026` |
| `MAX_RISK_PER_TRADE_PCT` | Risk per trade % | 1.5 |
| `MAX_DAILY_LOSS_PCT` | Daily loss limit | 5.0 |
| `MAX_OPEN_POSITIONS` | Max concurrent positions | 3 |
| `DEFAULT_AUTO_TRADE_MIN_SCORE` | Score threshold for auto-trade | 85 |
| `DEFAULT_TRADING_MODE` | `PAPER` or `MEXC_REAL` | `PAPER` |

---

## 3. A+ Detection Spec (Reverse-Engineered)

### 3a. Market Tradeable Gate (all 4 must pass)

| Check | Logic |
|---|---|
| `isAtrValid` | `ATR(14) >= ATR_SMA(20) * 0.75` |
| `!isMarketChoppy` | `ADX(14) >= 20.0` AND `abs(EMA9 - EMA21) / close >= 0.08%` |
| `!isWickTrap` | Candle range `< ATR * 3.5` |
| `!isTinyCandle` | Body `> 20%` of range AND range `> ATR * 0.25` |

### 3b. 8-Factor Raw Score (minimum 6/8 required)

| # | Factor | LONG condition | SHORT condition |
|---|---|---|---|
| 1 | trend | EMA9 > EMA21 | EMA9 < EMA21 |
| 2 | macro | Close > EMA200 (or EMA200 unavailable) | Close < EMA200 |
| 3 | rsi | RSI > 51 AND RSI < 70 AND RSI > RSI_SMA9 | RSI < 49 AND RSI > 30 AND RSI < RSI_SMA9 |
| 4 | macd | MACD > Signal AND (Hist > 0 OR Hist rising) | MACD < Signal AND (Hist < 0 OR Hist falling) |
| 5 | vol | Volume >= VolSMA*1.1 OR 3-bar volume expansion | Same |
| 6 | vwap | Close > VWAP | Close < VWAP |
| 7 | pa | Bullish candle (body >= 55% range) AND Close > max(Open, PrevClose) | Bearish candle AND Close < min(Open, PrevClose) |
| 8 | breakout | Pivot high breakout OR bull-retest OR Close > EMA9*1.001 | Pivot low breakdown OR bear-retest OR Close < EMA9*0.999 |

### 3c. Risk/Reward Gate
- `(TP2 - Close) / (Close - SL) >= 1.2` (LONG)
- `(Close - TP2) / (SL - Close) >= 1.2` (SHORT)

### 3d. Cooldown Gate
`barsSinceLast >= 4` bars

### 3e. Direction Gate
`activeDirection != 1` for LONG (engine won't flip without an exit first)

### 3f. HTF Alignment Gate
HTF = 5m klines. `htfBullish = close > EMA50(htf)` required for LONG.

### 3g. 100-Point Scorer (ScoringEngine — runs per signal)

| Category | Max pts |
|---|---|
| Trend Alignment (EMA stack, VWAP, ADX) | 20 |
| Market Structure & Price Action (BOS, CHoCH) | 20 |
| Momentum & Oscillators (RSI zone, MACD) | 15 |
| Volume Confirmation (ratio vs SMA) | 15 |
| Liquidity & Sweeps | 10 |
| Multi-Timeframe Alignment | 10 |
| Entry Quality & Candlestick Anatomy | 10 |
| **Total** | **100** |

### 3h. Score Classification

| Score | Class | Auto-Trade? |
|---|---|---|
| 90-100 | VERY_HIGH_CONFIDENCE | Always yes |
| 80-89 | HIGH_CONFIDENCE | Yes if score >= autoTradeMinScore (default 85) |
| 70-79 | MODERATE | Display only |
| 60-69 | WEAK | Informational |
| 0-59 | NO_TRADE | Suppressed |

### 3i. SL/TP Calculation

- **SL**: `Close - ATR * 1.5` (LONG) / `Close + ATR * 1.5` (SHORT)
- **TP1**: `Close +/- risk * 1.0`
- **TP2**: `Close +/- risk * 2.0`
- **TP3**: `Close +/- risk * 3.0`
- **Trailing**: `HighWater - ATR * 1.5` updated each bar

### 3j. Exit Conditions

- SL / trailing stop hit
- TP3 reached
- Momentum failure: EMA9 < EMA21 AND RSI < 42 (LONG) / EMA9 > EMA21 AND RSI > 58 (SHORT)

**=> DO NOT TOUCH ANY OF THE ABOVE. THESE ARE THE PROTECTED ENGINE RULES.**

---

## 4. Bug Register

### Tier 1 — Execution Bugs (Can lose real money)

| ID | Severity | Location | Bug Description |
|---|---|---|---|
| B1 | CRITICAL | `server.js:413` | Manual `/api/mexc/order` handler uses `body.signal || { score100: 90, htfBullish: true }` as fallback. A manual order without a `signal` field is given a fake A+ score of 90 — bypassing the executionFilter's score check entirely. Any client call to this endpoint without a signal will be approved. |
| B2 | CRITICAL | `orderRouter.js:101` | Fallback qty: `posSize?.units || (account.equity * 0.05 / currentPrice)`. If position sizing throws (e.g., SL equals entry), silently defaults to 5% equity / price. Can produce extreme contract sizes on low-price assets (e.g. DOGE). No error surfaced. |
| B3 | CRITICAL | `app.js:25-26` | `tradingMode = 'MEXC_REAL'` hardcoded in constructor. App initializes in live-money mode by default. If credentials are configured and auto-trade is on, real orders fire immediately without user choosing live mode. Should default to `PAPER`. |
| B4 | HIGH | `app.js` (executeAutoTrade) | Standalone/CDN mode calls `clientEngine.placeOrder()` directly — bypasses `executionFilter`, `riskManager`, circuit breaker, emergency stop, max positions check. All risk controls are server-side only and never execute in CDN mode. |

### Tier 2 — Data / Signal Bugs

| ID | Severity | Location | Bug Description |
|---|---|---|---|
| B5 | HIGH | `engine.js:84` | `this.mtfEngine = ME || null` stores the MtfEngine **class**, not an instance. `MtfEngine.checkAlignment()` is a static method but is never called inside `analyze()`. HTF score passed to scoringEngine is hardcoded `htfBullish ? 8 : 2`. Real MTF alignment scoring never runs. |
| B6 | HIGH | `server.js:103-107` | Market scanner runs 6 sequential Binance fetches in a for-loop every 20s. At latency > 3s/fetch, one cycle takes >18s, overlapping the next interval tick. No debounce beyond `isScanning` flag. |
| B7 | MEDIUM | `orderRouter.js:69` | `riskManager.options.defaultAutoTradeMinScore` is seeded from `db.getSettings()` at startup only. If user updates score threshold via UI during runtime, in-memory threshold never updates. Old threshold sticks until restart. |
| B8 | MEDIUM | `database/db.js` | Comments claim SQLite but actual implementation is JSON flat files. `data/` is in `.gitignore` so Railway deployments lose all audit logs, real trades, and settings on every redeploy. |
| B9 | MEDIUM | `signals/marketStructure.js:148-191` | BOS/CHoCH detection only checks the last two candles vs the swing high/low level. BOS is detected for one bar then lost — any signal bar after that sees no BOS and loses up to 20 structure points from the 100-pt scorer. |

### Tier 3 — UI / UX Bugs

| ID | Severity | Location | Bug Description |
|---|---|---|---|
| B10 | MEDIUM | `app.js:65` | `visibleIndicators` defaults to `rsi: false, macd: false` but chart init code adds RSI/MACD panels regardless. User sees indicators they haven't enabled. |
| B11 | MEDIUM | `app.js:26` | `tradingMode = 'MEXC_REAL'` in constructor but UI badge reads from SSE state. Mode label in UI may not match actual execution mode. |
| B12 | LOW | `server.js:703` | Startup log still prints "REAL-TIME DEMO TERMINAL" — stale branding post MEXC-live upgrade. |
| B13 | LOW | `alertService.js:39` | Alert filter default `minScore100: 70` is below auto-trade threshold 85. Users receive Discord/ntfy alerts for signals that will not auto-execute, creating confusion. |
| B14 | LOW | `executionFilter.js:114-115` | Data freshness check `dataAge <= 3000ms` may block orders for up to 3s after WS reconnection with no UI warning. |

---

## 5. Dead Weight List

| Component | File(s) | Verdict | Reason |
|---|---|---|---|
| `generate_icons.js` | `generate_icons.js` | **REMOVE** | Icon generation script. Icons already generated. Not used at runtime. |
| `deploy_cloud.bat` | `deploy_cloud.bat` | **KEEP** | One-click Surge redeploy. Useful. |
| `run_app.bat` | `run_app.bat` | **KEEP** | One-click local server start. Useful. |
| `push_to_github.bat` | `push_to_github.bat` | **REMOVE after push** | One-time setup helper. |
| `vercel.json` | `vercel.json` | **REMOVE** | Project is on Railway + Surge, not Vercel. Dead config. |
| `CNAME` | `CNAME` | **KEEP** | Required for Surge CDN custom domain. |
| `manifest.json` | `manifest.json` | **KEEP** | PWA manifest for mobile "Add to Home Screen". |
| `storage.js` | `storage.js` | **ASK ME** | Thin JSON wrapper used by `tradingEngine.js`. Will be superseded if real DB is added. |
| Paper engines | `tradingEngine.js`, `clientTradingEngine.js` | **KEEP** | Paper mode is mandatory for safe pre-live testing. |
| `backtest/backtester.js` | `backtest/backtester.js` | **ASK ME** | Wired to API endpoint but no visible UI to trigger it. Confirm if there's a backtest UI. |
| WhatsApp Meta API vars | `.env.example:30-31` | **REMOVE** | `WHATSAPP_PHONE_ID` / `WHATSAPP_ACCESS_TOKEN` are for Meta Cloud API, not CallMeBot. Dead if CallMeBot is chosen path. |

---

## 6. Risk Findings

### RF-1 — CRITICAL: Fake Signal Bypasses Score Gate
**File:** `server.js:413`  
Fallback `signal: { score100: 90, htfBullish: true }` in manual order handler means any POST to `/api/mexc/order` without a signal field auto-passes the executionFilter with a phantom A+ score of 90.

**Required fix:** Remove fallback. Return 400 if signal is missing.

---

### RF-2 — CRITICAL: Standalone Mode Has No Risk Controls
**File:** `app.js` executeAutoTrade  
CDN/standalone mode calls `clientEngine.placeOrder()` directly. No executionFilter, no riskManager, no circuit breaker, no emergency stop, no max position check, no R:R check.

**Required fix:** Disable real-money auto-trade in standalone mode entirely. Require server mode for live execution.

---

### RF-3 — HIGH: Position Size Fallback Can Over-Size on Low-Price Pairs
**File:** `orderRouter.js:101`  
If `riskManager.calculatePositionSize()` throws, fallback is `equity * 0.05 / price`. On DOGE at $0.10 with $10k equity: 5,000 contracts. No maximum contract check.

**Required fix:** Replace fallback with explicit error — reject order rather than defaulting.

---

### RF-4 — HIGH: Auto-Trade Restores From localStorage Without Re-Confirmation
**File:** `app.js` init  
In standalone mode, `autoTradingEnabled` is loaded from `localStorage`. If user enabled auto-trade, closed the tab, and reopens — auto-trade resumes silently with no confirmation prompt.

**Required fix:** Always initialize `autoTradingEnabled = false` in standalone mode. Require explicit re-confirmation per session.

---

### RF-5 — MEDIUM: API Secret Stored in Plaintext .env on Disk
**File:** `server.js:335-348`  
Credentials are written to `.env` in plaintext. On Railway, `.env` file is ephemeral — credentials appear saved but are lost on redeploy.

**Required fix:** Detect Railway environment and instruct user to set `MEXC_API_KEY`/`MEXC_API_SECRET` as Railway environment variables instead.

---

### RF-6 — MEDIUM: Emergency Stop State Not Persisted
**File:** `riskManager.js:28`  
`emergencyStopTriggered` and `circuitBreakerTripped` are in-memory only. A server crash or Railway restart silently resets these flags.

**Required fix:** Persist these flags to `data/risk_state.json` and restore on startup.

---

### RF-7 — LOW: No MEXC Rate-Limit Backoff
**File:** `exchanges/mexcClient.js`  
HTTP 429 from MEXC throws a generic error with no retry or backoff. High-frequency account/position fetches before each order can trigger rate limits.

**Required fix:** Add explicit 429 detection and exponential backoff.

---

## 7. Phase Readiness Summary

| Area | Status | Blocker |
|---|---|---|
| A+ Detection Engine | INTACT — well-implemented, no changes needed | None |
| MEXC Client | Correct HMAC signing | B1 / RF-1 must be fixed before live |
| Execution Filter (15-pt) | Implemented correctly | Bypassed by fake signal (RF-1) |
| Risk Manager | Circuit breaker + emergency stop present | State not persisted (RF-6) |
| Chart / UI | Functional with known indicator bugs | B10, B11 |
| Standalone / CDN Mode | Works but bypasses all safety layers | RF-2, RF-4 are live-money blockers |
| Database / Persistence | JSON files functional | Data lost on Railway redeploy (B8) |
| MTF Engine | Class exists, never invoked | B5: MTF score is simulated |
| Auto-Trade State Machine | Basic toggle only | Needs Phase 7 hardening |

---

*End of AUDIT.md — Stopping here. Awaiting your go-ahead before proceeding to Phase 1 or the REMOVE list.*
