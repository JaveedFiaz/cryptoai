# CHANGELOG.md — Crypto Scalper Pro v7

All notable changes, bug fixes, removals, and structural enhancements are documented in this file.

---

## [7.1.0] - 2026-09-16

### 🛡️ Phase 1 — Bug Kills (Execution, Data, and Risk Safety)
- **B1 / RF-1 (CRITICAL):** Removed fake signal object fallback (`score100: 90`) in `server.js` `/api/mexc/order` endpoint. Manual orders without a valid signal object are now rejected with HTTP 400.
- **B2 / RF-3 (CRITICAL):** Removed silent position size fallback (`equity * 0.05 / price`). Orders are now explicitly rejected if position sizing fails, preventing dangerous contract over-sizing on low-price assets (e.g. DOGE).
- **B3 (HIGH):** Changed default `tradingMode` in `app.js` constructor from `MEXC_REAL` to `PAPER` to prevent accidental live-money executions on startup.
- **B4 / RF-2 (HIGH):** Blocked real MEXC execution in standalone/CDN mode (`app.js`). Standalone mode is strictly paper-simulation because client-side code lacks backend risk filters.
- **RF-4 (HIGH):** Added safety reset on standalone init to ensure `autoTradingEnabled` is forced `false` on every session load rather than restoring silently from `localStorage`.
- **B6 (HIGH):** Parallelized `marketScanner.scanAll()` using `Promise.all()`, reducing 6-pair scanner scan time from >18s to <3s.
- **B7 (MEDIUM):** Added `/api/autotrade/set-score` endpoint and wired UI score selector to sync threshold changes to server in real time.
- **RF-6 (MEDIUM):** Added `persistState()` and `loadState()` in `RiskManager` so Emergency Stop and Circuit Breaker states persist to disk (`data/risk_state.json`) and survive server restarts.
- **RF-7 (LOW):** Added explicit HTTP 429 rate-limit detection and exponential backoff retry (up to 2 retries, 2s/4s delays) in `mexcClient.js`.
- **B12 / RF-5 (LOW):** Updated server startup console output to MEXC Live branding and added Railway environment detection warning regarding ephemeral filesystem variables.
- **B13 (LOW):** Aligned default alert filter score from 70 to 85 to match the minimum auto-trade threshold.

### 🎨 Phase 2 — Professional Terminal UI
- **Design System Tokens:** Enforced dark monochrome palette (`#0b0e14` base, `#131722` cards, `#1e222d` elevated) with two semantic accents (`#00e676` buy, `#ff3b30` sell) and amber warning (`#ff9800`).
- **Typography & Tabular Alignment:** Applied `font-variant-numeric: tabular-nums;` to all ticker prices, position quantities, PnL displays, and audit tables to prevent column jittering.
- **Emoji Removal:** Stripped decorative emojis from header controls, tabs, modals, and signal badges in `index.html` for an institutional Bloomberg-style appearance.

### 🧹 Phase 3 — Dead Weight Removal
- **Removed `generate_icons.js`:** One-time PWA icon generator script removed.
- **Removed `vercel.json`:** Dead Vercel configuration removed (app is deployed on Railway + Surge).

### 📈 Phase 4 & 5 — Chart & Engine Hardening
- **Indicator Management:** Indicators default to clean single-pane candlestick overlay; auto-open of RSI/MACD sub-panels removed unless explicitly toggled by user.
- **Health & Telemetry:** Added `/health` and `/api/health` endpoints returning server health, market data connection, MEXC authentication, and auto-trade state.

### 🤖 Phase 6, 7 & 8 — Execution, FSM & Observability
- **Direct Safeguard Endpoints:** Verified `/api/risk/emergency-stop` (Kill Switch) and `/api/risk/close-all` (Flatten-All) function directly at server level.
- **Pre-Flight Filter:** All auto-trade entries must pass the 15-point `ExecutionFilter` before dispatching to MEXC API.
- **Persistent Audit Log:** Every pre-flight decision (approval or rejection with failed check reasons) recorded to `data/signals_audit.json`.

### 🚀 Phase 9 — Railway Deployment
- **Healthcheck Path:** Updated `railway.json` with `healthcheckPath: "/health"` for automated Railway deployment verification.
- **Environment Variable Protocol:** Documented that production MEXC keys must be configured as Railway environment variables (`MEXC_API_KEY`, `MEXC_API_SECRET`).
