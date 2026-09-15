# ⚡ Crypto Scalper Pro [v7] — Institutional Trading Terminal

A high-frequency crypto scalping terminal and autonomous trade execution engine built for major cryptocurrency futures (BTC, ETH, SOL, BNB, XRP, DOGE) with real-time TradingView charting, 8-factor confluence detection, and MEXC Contract (Futures) execution.

---

## 🌟 Key Features

- **TradingView Real-Time Charting:** Fully interactive candlestick charts with custom timeframe switching (1m, 3m, 5m, 15m, 30m, 1h, 4h, 1D).
- **8-Factor Institutional Confluence Engine:** Multi-factor scoring (Trend EMA alignment, VWAP positioning, RSI momentum, Orderflow imbalance, Liquidity Sweeps, HTF Bias, Volatility regimes).
- **MEXC Live Futures Integration:** Direct execution via MEXC Contract API with isolated margin (1x - 100x), dynamic position sizing, and automated take-profit/stop-loss targeting.
- **Selective Confluence Thresholds:** Dedicated auto-trade selector button (`🎯 Score: 85+ ▾`) to configure automated execution thresholds (85+ default, 90+ elite, 80+, 75+, 70+, or custom).
- **Mobile Responsive & Autonomous 24/7:** Touch-optimized UI with zero horizontal scroll overflow, running standalone on mobile devices or hosted on cloud infrastructure.
- **Multi-Channel Alert Dispatcher:** Real-time signal forwarding to Discord Webhooks and phone push channels for Score >= 70/100.
- **Zero External Dependencies:** Built entirely with Node.js built-ins for lightning-fast build and start times (< 1 second).

---

## 🚀 Instant Deployment on Railway

### Step-by-Step Railway Deployment:

1. **Fork or Push to GitHub:** Ensure this repository is in your GitHub account (`https://github.com/JaveedFiaz/cryptoai`).
2. **Open Railway Dashboard:** Go to [railway.com](https://railway.com) and log in with your GitHub account.
3. **Create New Project:**
   - Click **"+ New Project"**.
   - Select **"Deploy from GitHub repo"**.
   - Choose **`JaveedFiaz/cryptoai`**.
4. **Set Environment Variables (Settings -> Variables):**
   - `PORT` = `3000`
   - `MEXC_API_KEY` = *(Your MEXC Futures API Key)*
   - `MEXC_API_SECRET` = *(Your MEXC Futures API Secret)*
   - `DISCORD_WEBHOOK_URL` = *(Optional Discord Webhook URL)*
5. **Generate Public Domain:**
   - In your Railway project, navigate to **Settings** -> **Networking**.
   - Click **"Generate Domain"** (e.g. `cryptoai-production.up.railway.app`).
6. **Launch:** Open your generated Railway domain on any browser or mobile phone for 24/7 live access!

---

## 💻 Local Running

```bash
# Clone repository
git clone https://github.com/JaveedFiaz/cryptoai.git
cd cryptoai

# Run terminal server
node server.js

# Open in browser
# http://localhost:3000
```

---

## 🛡️ Capital Protection & Security

- Secrets and API credentials are kept strictly server-side or encrypted in private client storage and are **never** committed to version control.
- Stop-Loss and Take-Profit orders are calculated and linked with every position to ensure asymmetric risk-to-reward.
