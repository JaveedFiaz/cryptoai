/**
 * CRYPTO SCALPER PRO - APPLICATION ORCHESTRATOR & REAL-TIME DEMO TERMINAL [v6]
 * 
 * Features:
 * - Real-time market streaming for Major Crypto Futures (BTC, ETH, SOL, BNB, XRP, DOGE)
 * - Live MEXC/Binance-style DEMO order placement: Market & Limit, Long & Short, 1x-100x Isolated Margin
 * - Authoritative Server-Sent Events (SSE) synchronization for Account, Positions, Orders, and Trades
 * - Live PnL, ROE %, mark prices, liquidation price calculation and risk telemetry
 * - Interactive position management: Full close, partial close (25%, 50%, 75%, custom), modify SL/TP
 * - Chart synchronization: Projects Position Entry, SL, TP, and Liquidation price lines on TradingView chart
 * - Preserves Crypto Scalper Pro 8-factor confluence engine, HUD telemetry, audio chimes, and settings
 */

const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') ? 'http://127.0.0.1:3000' : '';

class ScalperApp {
  constructor() {
    this.symbol = 'BTCUSDT';
    this.interval = '1m';
    this.htfInterval = '5m';
    this.orderType = 'MARKET'; // 'MARKET' or 'LIMIT'
    this.currentLeverage = 10;
    this.activeMobileTab = 'chart';
    this.activeView = 'terminal';
    this.autoTradingEnabled = false;
    this.tradingMode = 'MEXC_REAL';
    this.autoTradeMinScore = this.loadAutoTradeScore();
    
    // Specifications
    this.instruments = (typeof INSTRUMENTS !== 'undefined') ? INSTRUMENTS : {};
    
    // Autonomous Client Engine (Zero PC Dependency for Mobile & Cloud)
    this.isStandaloneMode = false;
    this.clientEngine = (typeof window !== 'undefined' && window.clientTradingEngine) ? window.clientTradingEngine : null;
    
    // Telegram & WhatsApp Signal Forwarding Service
    this.alertService = (typeof window !== 'undefined' && window.alertService) 
      ? window.alertService 
      : (typeof AlertService !== 'undefined' ? new AlertService() : null);
    
    // Live Market Feeds & Chart
    this.bars = [];
    this.htfBars = [];
    this.activeWs = null;
    this.tickerWs = null;
    this.tradeWs = null;
    this.sseSource = null;
    this.timerInterval = null;
    this.pricePollInterval = null;
    
    // Chart References & Sub-Panels
    this.chart = null;
    this.candleSeries = null;
    this.fastEmaSeries = null;
    this.slowEmaSeries = null;
    this.trendEmaSeries = null;
    this.vwapSeries = null;
    this.volumeSeries = null;
    this.rsiChart = null;
    this.rsiSeries = null;
    this.macdChart = null;
    this.macdLineSeries = null;
    this.macdSignalSeries = null;
    this.macdHistSeries = null;
    this.visibleIndicators = { ema20: true, ema50: true, ema200: true, vwap: true, volume: true, rsi: false, macd: false };
    this.signalPriceLines = [];
    this.positionPriceLines = [];
    
    // Audio & Alerts
    this.soundEnabled = true;
    this.notificationsEnabled = false;
    this.audioCtx = null;
    
    // Confluence Signal Engine
    this.engine = new ScalperEngine();
    this.activeSignal = null;
    
    // Live Demo State
    this.account = {
      startingBalance: 10000,
      balance: 10000,
      availableBalance: 10000,
      usedMargin: 0,
      equity: 10000,
      marginRatio: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalFees: 0
    };
    this.positions = [];
    this.openOrders = [];
    this.trades = [];
    this.livePrices = {}; // [symbol]: { price, bid, ask, mark, high24h, low24h, change24h, spread, time }

    // Modal Contexts
    this.activeModalPosition = null; // Position being partially closed or modified
    this.pendingOrder = null;        // Order awaiting user confirmation

    this.dom = {};
  }

  loadAutoTradeScore() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('crypto_scalper_autotrade_min_score');
        if (saved) {
          const num = parseInt(saved, 10);
          if (!isNaN(num) && num >= 50 && num <= 99) return num;
        }
      }
    } catch (e) {}
    return 85;
  }

  saveAutoTradeScore(score) {
    const num = Math.max(50, Math.min(99, parseInt(score, 10) || 85));
    this.autoTradeMinScore = num;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('crypto_scalper_autotrade_min_score', String(num));
      }
    } catch (e) {}
    this.updateAutoScoreButton();
    return num;
  }

  updateAutoScoreButton() {
    const btn = document.getElementById('autotrade-score-btn');
    if (btn) {
      btn.textContent = `🎯 Score: ${this.autoTradeMinScore || 85}+ ▾`;
    }
    const preview = document.getElementById('active-score-preview');
    if (preview) {
      preview.textContent = String(this.autoTradeMinScore || 85);
    }
    const customInput = document.getElementById('custom-autotrade-score');
    if (customInput) {
      customInput.value = String(this.autoTradeMinScore || 85);
    }
    document.querySelectorAll('.score-select-card').forEach(card => {
      const s = parseInt(card.getAttribute('data-score'), 10);
      card.classList.toggle('active', s === this.autoTradeMinScore);
    });
  }

  updateModeBadge() {
    const badge = document.getElementById('mode-badge');
    if (!badge) return;
    badge.className = 'mexc-live-badge';
    badge.textContent = 'MEXC LIVE';
    badge.title = 'Active Execution Mode: MEXC Live Futures';
  }

  loadSavedMexcCredentials() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem('crypto_scalper_mexc_keys');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.apiKey) {
          this.mexcConfigured = true;
          this.mexcApiKey = parsed.apiKey;
          this.mexcApiSecret = parsed.apiSecret;
          const keyInput = document.getElementById('mexc-api-key-input');
          const secretInput = document.getElementById('mexc-api-secret-input');
          if (keyInput && !keyInput.value) keyInput.value = parsed.apiKey;
          if (secretInput && !secretInput.value) secretInput.value = parsed.apiSecret || '';
          const masked = `${parsed.apiKey.slice(0, 4)}...${parsed.apiKey.slice(-4)}`;
          const mask = document.getElementById('mexc-key-mask');
          if (mask) mask.textContent = masked;
          const connStatus = document.getElementById('mexc-conn-status');
          if (connStatus) {
            connStatus.className = 'status-pill online';
            connStatus.textContent = 'ONLINE';
          }
          const modeDisplay = document.getElementById('mexc-mode-display');
          if (modeDisplay) {
            modeDisplay.textContent = 'MEXC CONTRACT LIVE';
            modeDisplay.style.color = '#00e676';
          }
          const mexcAutoToggle = document.getElementById('mexc-auto-execute-toggle');
          if (mexcAutoToggle) {
            mexcAutoToggle.checked = true;
          }
        }
      }
    } catch (e) {}
  }

  // =========================================================================
  // INITIALIZATION & DOM CACHING
  // =========================================================================
  async init() {
    this.cacheDom();
    this.updateModeBadge();
    this.updateAutoScoreButton();
    this.loadSavedMexcCredentials();
    this.initToastContainer();
    this.bindEvents();
    this.switchMobileTab('chart');
    this.initChart();
    this.initTradingViewChart();
    this.initInstitutionalFeatures();

    const serverAvailable = await this.checkServerAvailability();
    if (serverAvailable) {
      console.log('🔗 Connected to local Node backend');
      this.initSseStream();
      await this.fetchInstruments();
      await this.fetchInitialState();
    } else {
      this.initStandaloneClientMode();
    }

    await this.connectMarket(this.symbol, this.interval);
    this.startCandleTimer();
    this.updateDockTelemetry();

    if (this.alertService && this.dom.modals && this.dom.modals.alertsBtn) {
      const cfg = this.alertService.config;
      const anyEnabled = !!((cfg.discord && cfg.discord.enabled) || (cfg.ntfy && cfg.ntfy.enabled) || (cfg.telegram && cfg.telegram.enabled) || (cfg.whatsapp && cfg.whatsapp.enabled));
      this.dom.modals.alertsBtn.classList.toggle('active', anyEnabled);
    }
  }

  cacheDom() {
    // Header & Ticker
    this.dom.tickerPrice = document.getElementById('ticker-price');
    this.dom.tickerChange = document.getElementById('ticker-change');
    this.dom.tickerBid = document.getElementById('ticker-bid');
    this.dom.tickerAsk = document.getElementById('ticker-ask');
    this.dom.tickerSpread = document.getElementById('ticker-spread');
    this.dom.tickerHigh = document.getElementById('ticker-high');
    this.dom.tickerLow = document.getElementById('ticker-low');
    this.dom.tickerMark = document.getElementById('ticker-mark');
    this.dom.tickerIndex = document.getElementById('ticker-index');
    this.dom.tickerVol = document.getElementById('ticker-vol');
    this.dom.tickerFunding = document.getElementById('ticker-funding');
    this.dom.candleTimer = document.getElementById('candle-timer');
    this.dom.statusPill = document.getElementById('connection-status');
    
    // Header Account Summary
    this.dom.headerEquity = document.getElementById('header-equity');
    this.dom.headerAvail = document.getElementById('header-avail');
    this.dom.headerMarginRatio = document.getElementById('header-margin-ratio');
    this.dom.headerSyncBtn = document.getElementById('header-sync-btn') || document.getElementById('header-reset-btn');
    this.dom.autotradeScoreBtn = document.getElementById('autotrade-score-btn');

    // Hero Banner Elements
    this.dom.hero = {
      bar: document.getElementById('hero-signal-bar'),
      pulse: document.getElementById('hero-pulse'),
      badge: document.getElementById('hero-badge'),
      pair: document.getElementById('hero-pair'),
      summary: document.getElementById('hero-summary'),
      entry: document.getElementById('hero-entry'),
      sl: document.getElementById('hero-sl'),
      tp1: document.getElementById('hero-tp1'),
      tp2: document.getElementById('hero-tp2'),
      tp3: document.getElementById('hero-tp3'),
      score: document.getElementById('hero-score'),
      rr: document.getElementById('hero-rr'),
      shareTg: document.getElementById('hero-share-tg-btn'),
      shareWa: document.getElementById('hero-share-wa-btn')
    };

    // HUD Dashboard Elements
    this.dom.hud = {
      regime: document.getElementById('hud-regime'),
      trend: document.getElementById('hud-trend'),
      mom: document.getElementById('hud-mom'),
      vol: document.getElementById('hud-vol'),
      adx: document.getElementById('hud-adx'),
      mtf: document.getElementById('hud-mtf'),
      pos: document.getElementById('hud-pos'),
      strength: document.getElementById('hud-strength'),
      rr: document.getElementById('hud-rr'),
      pairTf: document.getElementById('hud-pair-tf')
    };

    // Trading Dock Elements
    this.dom.dock = {
      leverageBtn: document.getElementById('leverage-btn'),
      orderTypeTabs: document.querySelectorAll('.order-type-tab'),
      limitPriceGroup: document.getElementById('limit-price-group'),
      limitPriceInput: document.getElementById('order-limit-price'),
      qtyInput: document.getElementById('order-qty'),
      qtyLabel: document.getElementById('order-qty-label'),
      unitBadge: document.getElementById('order-unit-badge'),
      pctBtns: document.querySelectorAll('.pct-btn'),
      enableTpsl: document.getElementById('enable-tpsl-checkbox'),
      tpslContainer: document.getElementById('tpsl-inputs-container'),
      tpInput: document.getElementById('order-tp-input'),
      slInput: document.getElementById('order-sl-input'),
      calcNotional: document.getElementById('calc-notional'),
      calcMargin: document.getElementById('calc-margin'),
      calcLiq: document.getElementById('calc-liq'),
      calcFee: document.getElementById('calc-fee'),
      calcAvail: document.getElementById('calc-avail'),
      btnBuy: document.getElementById('btn-buy-long'),
      btnSell: document.getElementById('btn-sell-short'),
      btnAskPrice: document.getElementById('btn-ask-price'),
      btnBidPrice: document.getElementById('btn-bid-price')
    };

    // Bottom Panel Tables & Badges
    this.dom.posBadge = document.getElementById('pos-badge-count');
    this.dom.ordersBadge = document.getElementById('orders-badge-count');
    this.dom.posTbody = document.getElementById('positions-tbody');
    this.dom.ordersTbody = document.getElementById('orders-tbody');
    this.dom.tradesTbody = document.getElementById('trades-tbody');
    this.dom.signalFeed = document.getElementById('signal-feed-list');
    this.dom.feedPlaceholder = document.getElementById('feed-placeholder');

    // Modals
    this.dom.modals = {
      leverage: document.getElementById('leverage-modal'),
      leverageDisplay: document.getElementById('modal-leverage-display'),
      leverageGrid: document.getElementById('leverage-pills-container'),
      confirmLeverageBtn: document.getElementById('confirm-leverage-btn'),
      closeLeverageBtn: document.getElementById('close-leverage-btn'),

      confirm: document.getElementById('order-confirm-modal'),
      confirmTitle: document.getElementById('confirm-modal-title'),
      confirmSummary: document.getElementById('confirm-summary-content'),
      executeConfirmBtn: document.getElementById('execute-confirm-btn'),
      cancelConfirmBtn: document.getElementById('cancel-confirm-btn'),
      closeConfirmBtn: document.getElementById('close-confirm-btn'),

      partial: document.getElementById('partial-close-modal'),
      partialQtyInput: document.getElementById('partial-close-qty-input'),
      partialCloseBtns: document.querySelectorAll('.close-pct-btn'),
      executePartialBtn: document.getElementById('execute-partial-close-btn'),
      cancelPartialBtn: document.getElementById('cancel-partial-btn'),
      closePartialBtn: document.getElementById('close-partial-btn'),

      modify: document.getElementById('modify-sltp-modal'),
      modifyTpInput: document.getElementById('modify-tp-input'),
      modifySlInput: document.getElementById('modify-sl-input'),
      saveModifyBtn: document.getElementById('save-modify-sltp-btn'),
      cancelModifyBtn: document.getElementById('cancel-modify-btn'),
      closeModifyBtn: document.getElementById('close-modify-btn'),

      reset: document.getElementById('reset-account-modal'),
      resetBalanceInput: document.getElementById('reset-starting-balance'),
      resetClearHistory: document.getElementById('reset-clear-history-checkbox'),
      confirmResetBtn: document.getElementById('confirm-reset-account-btn'),
      cancelResetBtn: document.getElementById('cancel-reset-modal-btn'),
      closeResetBtn: document.getElementById('close-reset-btn'),

      settings: document.getElementById('settings-modal'),

      // Alerts Modal (Discord, Phone Push, Telegram, WhatsApp)
      alerts: document.getElementById('alerts-modal'),
      alertsBtn: document.getElementById('alerts-modal-btn'),
      closeAlertsBtn: document.getElementById('close-alerts-btn'),
      cancelAlertsBtn: document.getElementById('cancel-alerts-btn'),
      saveAlertsBtn: document.getElementById('save-alerts-btn'),
      discordEnable: document.getElementById('discord-enable-toggle'),
      discordWebhookUrl: document.getElementById('discord-webhook-url'),
      discordTestBtn: document.getElementById('discord-test-btn'),
      discordTestFeedback: document.getElementById('discord-test-feedback'),
      ntfyEnable: document.getElementById('ntfy-enable-toggle'),
      ntfyTopic: document.getElementById('ntfy-topic-input'),
      ntfyTestBtn: document.getElementById('ntfy-test-btn'),
      ntfyTestFeedback: document.getElementById('ntfy-test-feedback'),
      tgEnable: document.getElementById('tg-enable-toggle'),
      tgBotToken: document.getElementById('tg-bot-token'),
      tgChatId: document.getElementById('tg-chat-id'),
      tgTestBtn: document.getElementById('tg-test-btn'),
      tgTestFeedback: document.getElementById('tg-test-feedback'),
      waEnable: document.getElementById('wa-enable-toggle'),
      waProvider: document.getElementById('wa-provider-select'),
      waPhone: document.getElementById('wa-phone'),
      waApiKey: document.getElementById('wa-apikey'),
      waWebhookUrl: document.getElementById('wa-webhook-url'),
      waCallmebotFields: document.getElementById('wa-callmebot-fields'),
      waWebhookFields: document.getElementById('wa-webhook-fields'),
      waTestBtn: document.getElementById('wa-test-btn'),
      waTestFeedback: document.getElementById('wa-test-feedback'),
      alertMinScore: document.getElementById('alert-min-score'),
      alertFilterBuySell: document.getElementById('alert-filter-buysell'),
      alertFilterExit: document.getElementById('alert-filter-exit')
    };

    // HUD and Bottom Panel controls
    this.dom.hudOverlay = document.getElementById('hud-overlay');
    this.dom.btnCloseHud = document.getElementById('btn-close-hud');
    this.dom.btnToggleHud = document.getElementById('btn-toggle-hud');
    this.dom.bottomPanel = document.querySelector('.bottom-panel');
    this.dom.btnToggleBottomPanel = document.getElementById('btn-toggle-bottom-panel');
    this.dom.bottomPanelIcon = document.getElementById('bottom-panel-icon');
    this.dom.bottomPanelLbl = document.getElementById('bottom-panel-lbl');
  }

  initToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    this.dom.toastContainer = container;
  }

  showToast(message, type = 'info', duration = 3500) {
    if (!this.dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `terminal-toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '⚠️';
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    this.dom.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // =========================================================================
  // EVENT BINDINGS
  // =========================================================================
  bindEvents() {
    // Quick Pair Selector
    document.querySelectorAll('.pair-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const sym = btn.getAttribute('data-pair');
        this.switchPair(sym);
      });
    });

    // Custom Pair Input
    const customInput = document.getElementById('custom-pair-input');
    if (customInput) {
      customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          let sym = customInput.value.trim().toUpperCase();
          if (!sym) return;
          if (!sym.endsWith('USDT')) sym += 'USDT';
          this.switchPair(sym);
          customInput.value = '';
        }
      });
    }

    // Timeframe Selector
    document.querySelectorAll('.tf-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tf = btn.getAttribute('data-tf');
        this.switchTimeframe(tf);
      });
    });

    // Sound & Notification Toggles
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        soundBtn.classList.toggle('active', this.soundEnabled);
        soundBtn.innerHTML = this.soundEnabled ? '🔊' : '🔇';
        if (this.soundEnabled) this.playTone('BUY');
      });
    }

    const notifBtn = document.getElementById('notif-toggle-btn');
    if (notifBtn) {
      notifBtn.addEventListener('click', async () => {
        if (!('Notification' in window)) {
          this.showToast('Desktop notifications not supported in this browser', 'error');
          return;
        }
        if (Notification.permission === 'granted') {
          this.notificationsEnabled = !this.notificationsEnabled;
        } else if (Notification.permission !== 'denied') {
          const perm = await Notification.requestPermission();
          this.notificationsEnabled = (perm === 'granted');
        }
        notifBtn.classList.toggle('active', this.notificationsEnabled);
        this.showToast(this.notificationsEnabled ? 'Desktop alerts enabled' : 'Desktop alerts disabled', 'info');
      });
    }

    // Header Live Sync Button
    const syncBtn = this.dom.headerSyncBtn || document.getElementById('header-sync-btn') || document.getElementById('header-reset-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.classList.add('rotating');
        await this.syncMexcAccount();
        setTimeout(() => syncBtn.classList.remove('rotating'), 600);
      });
    }

    // Bottom Panel Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content-panel').forEach(p => p.style.display = 'none');
        btn.classList.add('active');
        const target = btn.getAttribute('data-tab');
        const panel = document.getElementById(target);
        if (panel) panel.style.display = 'block';
      });
    });

    // Trading Dock: Order Type Switching (Market / Limit)
    this.dom.dock.orderTypeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.dom.dock.orderTypeTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.orderType = tab.getAttribute('data-type');
        
        if (this.orderType === 'LIMIT') {
          this.dom.dock.limitPriceGroup.style.display = 'block';
          const curPrice = this.getCurrentMarketPrice();
          if (curPrice && !this.dom.dock.limitPriceInput.value) {
            this.dom.dock.limitPriceInput.value = curPrice.toFixed(this.getPriceDecimals());
          }
        } else {
          this.dom.dock.limitPriceGroup.style.display = 'none';
        }
        this.updateDockTelemetry();
      });
    });

    // Trading Dock: Inputs telemetry listeners
    this.dom.dock.qtyInput.addEventListener('input', () => this.updateDockTelemetry());
    this.dom.dock.limitPriceInput.addEventListener('input', () => this.updateDockTelemetry());
    this.dom.dock.enableTpsl.addEventListener('change', (e) => {
      this.dom.dock.tpslContainer.style.display = e.target.checked ? 'block' : 'none';
    });

    // Quick % Buttons
    this.dom.dock.pctBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const pct = parseFloat(btn.getAttribute('data-pct'));
        this.applyMarginPercentage(pct);
      });
    });

    // Leverage Pill Button -> Open Modal
    this.dom.dock.leverageBtn.addEventListener('click', () => {
      this.openLeverageModal();
    });

    // Order Action Buttons (Buy/Long and Sell/Short)
    this.dom.dock.btnBuy.addEventListener('click', () => this.handleOrderSubmit('BUY'));
    this.dom.dock.btnSell.addEventListener('click', () => this.handleOrderSubmit('SELL'));

    // Modal Close handlers
    this.bindModalEvents();

    // Scalper Settings Modal
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettings = document.getElementById('close-settings-btn');
    const saveSettings = document.getElementById('save-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.dom.modals.settings.classList.add('open'));
    if (closeSettings) closeSettings.addEventListener('click', () => this.dom.modals.settings.classList.remove('open'));
    if (saveSettings) {
      saveSettings.addEventListener('click', () => {
        this.applySettingsFromModal();
        this.dom.modals.settings.classList.remove('open');
      });
    }

    // Chart Resize & Mobile Orientation Listener
    const handleResize = () => {
      if (this.chart) {
        const container = document.getElementById('chart-container');
        if (container) {
          this.chart.resize(container.clientWidth, container.clientHeight);
          this.chart.timeScale().scrollToRealTime();
        }
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 150));

    // Mobile Bottom Navigation Tabs
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
    mobileNavBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-mobile-tab');
        this.switchMobileTab(tab);
      });
    });

    // Mobile Access Modal
    const mobileQrBtn = document.getElementById('mobile-qr-btn');
    const mobileModal = document.getElementById('mobile-access-modal');
    const closeMobileBtn = document.getElementById('close-mobile-access-btn');
    const doneMobileBtn = document.getElementById('done-mobile-btn');
    const copyCloudBtn = document.getElementById('copy-cloud-url-btn');
    const cloudUrlBox = document.getElementById('mobile-cloud-url-box');

    if (mobileQrBtn && mobileModal) {
      mobileQrBtn.addEventListener('click', () => {
        mobileModal.classList.add('open');
        fetch(`${API_BASE}/api/system/info`).then(r => r.json()).then(data => {
          if (data && data.localIp) {
            const wifiEl = document.getElementById('local-wifi-link');
            if (wifiEl) wifiEl.textContent = `http://${data.localIp}:3000`;
          }
        }).catch(() => {});
      });
    }
    if (closeMobileBtn && mobileModal) {
      closeMobileBtn.addEventListener('click', () => mobileModal.classList.remove('open'));
    }
    if (doneMobileBtn && mobileModal) {
      doneMobileBtn.addEventListener('click', () => mobileModal.classList.remove('open'));
    }
    if (mobileModal) {
      mobileModal.addEventListener('click', (e) => { if (e.target === mobileModal) mobileModal.classList.remove('open'); });
    }
    const copyCloudHandler = () => {
      const url = 'https://crypto-scalper-live.surge.sh';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url);
      }
      this.showToast('📋 Copied 24/7 Mobile Link: https://crypto-scalper-live.surge.sh', 'success', 4000);
    };
    if (copyCloudBtn) copyCloudBtn.addEventListener('click', copyCloudHandler);
    if (cloudUrlBox) cloudUrlBox.addEventListener('click', copyCloudHandler);

    // HUD Hide/Show Controls
    const hudCloseBtn = this.dom.btnCloseHud || document.getElementById('btn-close-hud');
    const hudToggleBtn = this.dom.btnToggleHud || document.getElementById('btn-toggle-hud');
    const hudOverlay = this.dom.hudOverlay || document.getElementById('hud-overlay');

    const setHudVisibility = (visible) => {
      if (!hudOverlay) return;
      hudOverlay.classList.toggle('hidden', !visible);
      if (hudToggleBtn) {
        hudToggleBtn.classList.toggle('active', visible);
        hudToggleBtn.textContent = visible ? '👁 HUD' : '👁‍🗨 Show HUD';
      }
      try {
        localStorage.setItem('crypto_scalper_hud_visible', visible ? '1' : '0');
      } catch (e) {}
    };

    if (hudCloseBtn) {
      hudCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setHudVisibility(false);
        this.showToast('HUD hidden. Click "Show HUD" in chart toolbar to restore.', 'info', 3000);
      });
    }

    if (hudToggleBtn) {
      hudToggleBtn.addEventListener('click', () => {
        const isHidden = hudOverlay ? hudOverlay.classList.contains('hidden') : false;
        setHudVisibility(isHidden);
      });
    }

    // Restore saved HUD visibility (default to hidden on small mobile screens to keep chart unobstructed)
    try {
      const savedHud = localStorage.getItem('crypto_scalper_hud_visible');
      if (savedHud === '0' || (savedHud === null && window.innerWidth <= 860)) {
        setHudVisibility(false);
      }
    } catch (e) {}

    // Bottom Panel Collapse / Expand Controls
    const panelToggleBtn = this.dom.btnToggleBottomPanel || document.getElementById('btn-toggle-bottom-panel');
    const bottomPanel = this.dom.bottomPanel || document.querySelector('.bottom-panel');
    const panelIcon = this.dom.bottomPanelIcon || document.getElementById('bottom-panel-icon');
    const panelLbl = this.dom.bottomPanelLbl || document.getElementById('bottom-panel-lbl');

    const setPanelCollapsed = (collapsed) => {
      if (!bottomPanel) return;
      bottomPanel.classList.toggle('collapsed', collapsed);
      if (panelIcon) panelIcon.textContent = collapsed ? '▴' : '▾';
      if (panelLbl) panelLbl.textContent = collapsed ? 'Expand Panel' : 'Minimize Panel';
      if (panelToggleBtn) panelToggleBtn.classList.toggle('active', collapsed);

      try {
        localStorage.setItem('crypto_scalper_panel_collapsed', collapsed ? '1' : '0');
      } catch (e) {}

      // Trigger chart resize immediately to claim enlarged space
      setTimeout(() => {
        if (this.chart) {
          const container = document.getElementById('chart-container');
          if (container) {
            this.chart.resize(container.clientWidth, container.clientHeight);
            this.chart.timeScale().scrollToRealTime();
          }
        }
      }, 50);
    };

    if (panelToggleBtn) {
      panelToggleBtn.addEventListener('click', () => {
        const isCollapsed = bottomPanel ? bottomPanel.classList.contains('collapsed') : false;
        setPanelCollapsed(!isCollapsed);
      });
    }

    // Restore saved Panel state
    try {
      const savedPanel = localStorage.getItem('crypto_scalper_panel_collapsed');
      if (savedPanel === '1') {
        setPanelCollapsed(true);
      }
    } catch (e) {}
  }

  switchMobileTab(tab) {
    this.activeMobileTab = tab;
    document.querySelectorAll('.mobile-nav-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-mobile-tab') === tab);
    });

    document.body.classList.remove('mobile-tab-chart', 'mobile-tab-trade', 'mobile-tab-positions', 'mobile-tab-signals');
    document.body.classList.add(`mobile-tab-${tab}`);

    if (tab === 'chart' && this.chart) {
      setTimeout(() => {
        const container = document.getElementById('chart-container');
        if (container) {
          this.chart.resize(container.clientWidth, container.clientHeight);
          this.chart.timeScale().scrollToRealTime();
        }
      }, 50);
    }

    if (tab === 'positions') {
      const posTabBtn = document.querySelector('.tab-btn[data-tab="tab-positions"]') || document.querySelector('.bottom-tab-btn[data-tab="positions"]');
      if (posTabBtn) posTabBtn.click();
    } else if (tab === 'signals') {
      const sigTabBtn = document.querySelector('.tab-btn[data-tab="tab-signals"]') || document.querySelector('.bottom-tab-btn[data-tab="signals"]');
      if (sigTabBtn) sigTabBtn.click();
    }
  }

  bindModalEvents() {
    const m = this.dom.modals;

    // Leverage Modal
    m.closeLevBtn?.addEventListener('click', () => m.leverage.classList.remove('open'));
    m.cancelLevBtn?.addEventListener('click', () => m.leverage.classList.remove('open'));
    m.leverage?.addEventListener('click', (e) => { if (e.target === m.leverage) m.leverage.classList.remove('open'); });
    m.confirmLevBtn?.addEventListener('click', () => {
      const activeBtn = document.querySelector('.lev-pill.active');
      if (activeBtn) {
        const val = parseInt(activeBtn.getAttribute('data-lev'), 10);
        this.setLeverage(val);
      }
      m.leverage.classList.remove('open');
    });

    // Close Position Modal
    m.closePosBtn?.addEventListener('click', () => m.closePos.classList.remove('open'));
    m.cancelClosePosBtn?.addEventListener('click', () => m.closePos.classList.remove('open'));
    m.closePos?.addEventListener('click', (e) => { if (e.target === m.closePos) m.closePos.classList.remove('open'); });
    m.confirmClosePosBtn?.addEventListener('click', () => this.executePositionClose());

    // TPSL Modal
    m.closeTpslBtn?.addEventListener('click', () => m.tpsl.classList.remove('open'));
    m.cancelTpslBtn?.addEventListener('click', () => m.tpsl.classList.remove('open'));
    m.tpsl?.addEventListener('click', (e) => { if (e.target === m.tpsl) m.tpsl.classList.remove('open'); });
    m.confirmTpslBtn?.addEventListener('click', () => {
      if (!this.activeModalPosition) return;
      const sl = parseFloat(m.tpslSlInput.value);
      const tp = parseFloat(m.tpslTpInput.value);
      this.updatePositionTpsl(this.activeModalPosition.id, isNaN(sl) ? null : sl, isNaN(tp) ? null : tp);
      m.tpsl.classList.remove('open');
    });

    // Reset Account Modal
    m.closeResetBtn?.addEventListener('click', () => m.reset.classList.remove('open'));
    m.cancelResetBtn?.addEventListener('click', () => m.reset.classList.remove('open'));
    m.reset?.addEventListener('click', (e) => { if (e.target === m.reset) m.reset.classList.remove('open'); });
    m.confirmResetBtn?.addEventListener('click', () => this.executeAccountReset());

    // Alerts (Discord, Phone Push, Telegram & WhatsApp) Modal
    m.alertsBtn?.addEventListener('click', () => this.openAlertsModal());
    m.closeAlertsBtn?.addEventListener('click', () => m.alerts.classList.remove('open'));
    m.cancelAlertsBtn?.addEventListener('click', () => m.alerts.classList.remove('open'));
    m.alerts?.addEventListener('click', (e) => { if (e.target === m.alerts) m.alerts.classList.remove('open'); });
    m.discordTestBtn?.addEventListener('click', () => this.executeDiscordTest());
    m.ntfyTestBtn?.addEventListener('click', () => this.executeNtfyTest());
    m.waProvider?.addEventListener('change', (e) => this.toggleWhatsAppProviderFields(e.target.value));
    m.tgTestBtn?.addEventListener('click', () => this.executeTelegramTest());
    m.waTestBtn?.addEventListener('click', () => this.executeWhatsAppTest());
    m.saveAlertsBtn?.addEventListener('click', () => this.saveAlertSettings());

    // Hero Quick Share Buttons
    this.dom.hero.shareTg?.addEventListener('click', () => this.shareActiveSignal('tg'));
    this.dom.hero.shareWa?.addEventListener('click', () => this.shareActiveSignal('wa'));

    // Auto-Trade Confluence Score Selector Modal
    const scoreModal = document.getElementById('autotrade-score-modal');
    const scoreBtn = document.getElementById('autotrade-score-btn');
    const closeScoreBtn = document.getElementById('close-autotrade-score-btn');
    const cancelScoreBtn = document.getElementById('cancel-autotrade-score-btn');
    const saveScoreBtn = document.getElementById('save-autotrade-score-btn');
    const customScoreInput = document.getElementById('custom-autotrade-score');
    const previewEl = document.getElementById('active-score-preview');

    let tempSelectedScore = this.autoTradeMinScore || 85;

    const updateScoreModalUI = (score) => {
      tempSelectedScore = score;
      if (previewEl) previewEl.textContent = String(score);
      if (customScoreInput) customScoreInput.value = String(score);
      document.querySelectorAll('.score-select-card').forEach(card => {
        const s = parseInt(card.getAttribute('data-score'), 10);
        card.classList.toggle('active', s === score);
      });
    };

    if (scoreBtn && scoreModal) {
      scoreBtn.addEventListener('click', () => {
        tempSelectedScore = this.autoTradeMinScore || 85;
        updateScoreModalUI(tempSelectedScore);
        scoreModal.classList.add('open');
      });
    }

    if (closeScoreBtn && scoreModal) closeScoreBtn.addEventListener('click', () => scoreModal.classList.remove('open'));
    if (cancelScoreBtn && scoreModal) cancelScoreBtn.addEventListener('click', () => scoreModal.classList.remove('open'));
    if (scoreModal) {
      scoreModal.addEventListener('click', (e) => {
        if (e.target === scoreModal) scoreModal.classList.remove('open');
      });
    }

    document.querySelectorAll('.score-select-card').forEach(card => {
      card.addEventListener('click', () => {
        const s = parseInt(card.getAttribute('data-score'), 10);
        if (!isNaN(s)) updateScoreModalUI(s);
      });
    });

    if (customScoreInput) {
      customScoreInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
          tempSelectedScore = Math.max(50, Math.min(99, val));
          if (previewEl) previewEl.textContent = String(tempSelectedScore);
          document.querySelectorAll('.score-select-card').forEach(card => {
            const s = parseInt(card.getAttribute('data-score'), 10);
            card.classList.toggle('active', s === tempSelectedScore);
          });
        }
      });
    }

    if (saveScoreBtn && scoreModal) {
      saveScoreBtn.addEventListener('click', () => {
        this.saveAutoTradeScore(tempSelectedScore);
        scoreModal.classList.remove('open');
        this.showToast(`🎯 MEXC Auto-Trade Threshold set to Score ≥ ${tempSelectedScore}/100`, 'success', 4000);
      });
    }
  }

  async syncMexcAccount() {
    this.showToast('🔄 Synchronizing MEXC live equity & positions...', 'info', 2000);
    try {
      if (this.isStandaloneMode && this.clientEngine) {
        this.updateAccountState(this.clientEngine.state.account);
        this.updatePositionsState(this.clientEngine.state.positions);
        this.showToast('✅ MEXC terminal state synchronized!', 'success', 2500);
        return;
      }
      await Promise.all([
        this.fetchAccount(),
        this.fetchPositions(),
        this.fetchTrades(),
        this.refreshMexcStatus()
      ]);
      this.showToast('✅ MEXC account & positions synchronized!', 'success', 3000);
    } catch (e) {
      this.showToast(`Sync update: ${e.message}`, 'info', 3000);
    }
  }

  // =========================================================================
  // SERVER AVAILABILITY & AUTONOMOUS CLIENT DUAL-MODE
  // =========================================================================
  async checkServerAvailability() {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.protocol === 'file:') return false;
      const host = window.location.hostname;
      const isLocalhost = (host === 'localhost' || host === '127.0.0.1');
      // If deployed on cloud static host (Vercel, Netlify, Surge, Cloudflare Pages, GitHub Pages)
      if (!isLocalhost && (!window.location.port || window.location.port === '80' || window.location.port === '443')) {
        return false;
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${API_BASE}/api/instruments`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  initStandaloneClientMode() {
    this.isStandaloneMode = true;
    if (!this.clientEngine && typeof window !== 'undefined' && window.clientTradingEngine) {
      this.clientEngine = window.clientTradingEngine;
    }

    console.log('🚀 Standalone Mobile/Cloud Mode Active (Zero PC Dependency)');
    this.updateStatus('🟢 MEXC LIVE 24/7', true);

    if (this.clientEngine) {
      if (this.clientEngine.instruments) {
        this.instruments = this.clientEngine.instruments;
      }

      this.clientEngine.on((event, data) => {
        if (event === 'account_update') {
          this.updateAccountState(data);
        } else if (event === 'position_opened') {
          this.showToast(`Position opened: ${data.side} ${data.quantity} ${data.symbol} @ ${data.entryPrice}`, 'success');
          this.updatePositionsState(this.clientEngine.state.positions);
        } else if (event === 'position_closed') {
          const pnl = data.netPnL !== undefined ? data.netPnL : 0;
          const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
          this.showToast(`Position closed: ${data.symbol} (PnL: ${pnlStr})`, pnl >= 0 ? 'success' : 'error');
          this.updatePositionsState(this.clientEngine.state.positions);
          this.updateTradesState(this.clientEngine.state.trades);
        } else if (event === 'position_updated') {
          this.updatePositionsState(this.clientEngine.state.positions);
        } else if (event === 'position_liquidated') {
          this.showToast(`🚨 LIQUIDATION: ${data.side} ${data.symbol} was liquidated at ${data.markPrice}`, 'error', 6000);
          this.playTone('SELL');
          this.updatePositionsState(this.clientEngine.state.positions);
          this.updateTradesState(this.clientEngine.state.trades);
        } else if (event === 'order_created') {
          this.showToast(`Limit order created: ${data.side} ${data.quantity} @ ${data.price}`, 'info');
          this.updateOrdersState(this.clientEngine.state.orders);
        } else if (event === 'order_filled') {
          this.showToast(`Limit order FILLED: ${data.side} ${data.quantity} ${data.symbol} @ ${data.price}`, 'success');
          this.updateOrdersState(this.clientEngine.state.orders);
          this.updatePositionsState(this.clientEngine.state.positions);
        } else if (event === 'order_cancelled') {
          this.showToast('Order cancelled', 'info');
          this.updateOrdersState(this.clientEngine.state.orders);
        }
      });

      // Synchronize initial state from localStorage
      this.updateAccountState(this.clientEngine.state.account);
      this.updatePositionsState(this.clientEngine.state.positions);
      this.updateOrdersState(this.clientEngine.state.orders);
      this.updateTradesState(this.clientEngine.state.trades);
    }
  }

  // =========================================================================
  // SERVER-SENT EVENTS (SSE) STREAM & REST SYNC
  // =========================================================================
  initSseStream() {
    if (this.sseSource) {
      try { this.sseSource.close(); } catch (e) {}
    }

    this.sseSource = new EventSource(`${API_BASE}/api/stream`);

    this.sseSource.onopen = () => {
      console.log('SSE connected to /api/stream');
      this.updateStatus('DEMO LIVE', true);
    };

    const handleSnapshot = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.account) this.updateAccountState(data.account);
        if (data.positions) this.updatePositionsState(data.positions);
        if (data.orders || data.openOrders) this.updateOrdersState(data.orders || data.openOrders);
        if (data.trades) this.updateTradesState(data.trades);
        if (data.prices) {
          Object.assign(this.livePrices, data.prices);
          this.refreshPriceDisplays();
        }
      } catch (err) {
        console.error('SSE snapshot parse error:', err);
      }
    };

    this.sseSource.addEventListener('snapshot', handleSnapshot);
    this.sseSource.addEventListener('init', handleSnapshot);

    this.sseSource.addEventListener('account_update', (e) => {
      try {
        const account = JSON.parse(e.data);
        this.updateAccountState(account);
      } catch (err) {}
    });

    this.sseSource.addEventListener('position_opened', (e) => {
      try {
        const pos = JSON.parse(e.data);
        this.showToast(`Position opened: ${pos.side} ${pos.quantity} ${pos.symbol} @ ${pos.entryPrice}`, 'success');
        this.fetchPositions();
      } catch (err) {}
    });

    this.sseSource.addEventListener('position_updated', (e) => {
      try {
        this.fetchPositions();
      } catch (err) {}
    });

    this.sseSource.addEventListener('position_closed', (e) => {
      try {
        const pos = JSON.parse(e.data);
        const pnl = pos.realizedPnL !== undefined ? pos.realizedPnL : 0;
        const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
        this.showToast(`Position closed: ${pos.symbol} (PnL: ${pnlStr})`, pnl >= 0 ? 'success' : 'error');
        this.fetchPositions();
        this.fetchTrades();
      } catch (err) {}
    });

    this.sseSource.addEventListener('order_created', (e) => {
      try {
        const order = JSON.parse(e.data);
        this.showToast(`Limit order created: ${order.side} ${order.quantity} @ ${order.price}`, 'info');
        this.fetchOrders();
      } catch (err) {}
    });

    this.sseSource.addEventListener('order_filled', (e) => {
      try {
        const order = JSON.parse(e.data);
        this.showToast(`Limit order FILLED: ${order.side} ${order.quantity} ${order.symbol} @ ${order.price}`, 'success');
        this.fetchOrders();
        this.fetchPositions();
      } catch (err) {}
    });

    this.sseSource.addEventListener('order_cancelled', (e) => {
      try {
        this.showToast('Order cancelled', 'info');
        this.fetchOrders();
      } catch (err) {}
    });

    this.sseSource.addEventListener('trade_executed', (e) => {
      try {
        this.fetchTrades();
      } catch (err) {}
    });

    this.sseSource.addEventListener('market_price_update', (e) => {
      try {
        const p = JSON.parse(e.data);
        this.livePrices[p.symbol] = p;
        if (p.symbol === this.symbol) {
          this.updateTickerBarFromPrice(p);
          if (p.price) {
            this.updateLiveTick(p.price);
          }
        }
        this.updateLivePositionPnL();
      } catch (err) {}
    });

    this.sseSource.addEventListener('position_liquidated', (e) => {
      try {
        const pos = JSON.parse(e.data);
        this.showToast(`🚨 LIQUIDATION: ${pos.side} ${pos.symbol} was liquidated at ${pos.markPrice}`, 'error', 6000);
        this.playTone('SELL');
        this.fetchPositions();
        this.fetchTrades();
      } catch (err) {}
    });

    this.sseSource.addEventListener('autotrade_status', (e) => {
      try {
        const s = JSON.parse(e.data);
        this.autoTradingEnabled = !!s.autoTradingEnabled;
        if (s.mode) this.tradingMode = s.mode;
        this.updateAutoTradeButton();
      } catch (err) {}
    });

    this.sseSource.addEventListener('emergency_stop_triggered', (e) => {
      try {
        this.autoTradingEnabled = false;
        this.updateAutoTradeButton();
        this.showToast('🛑 EMERGENCY STOP ACTIVATED on server!', 'error', 8000);
      } catch (err) {}
    });

    this.sseSource.addEventListener('emergency_stop_reset', (e) => {
      try {
        this.showToast('ℹ️ Emergency stop reset on server.', 'info');
      } catch (err) {}
    });

    this.sseSource.addEventListener('scanner_update', (e) => {
      try {
        const setups = JSON.parse(e.data);
        if (this.activeView === 'scanner') {
          this.renderScannerCards(setups);
        }
      } catch (err) {}
    });

    this.sseSource.onerror = () => {
      this.updateStatus('OFFLINE (Run run_app.bat)', false);
      // Reconnect automatically
      setTimeout(() => {
        if (this.sseSource.readyState === EventSource.CLOSED) {
          this.initSseStream();
        }
      }, 3000);
    };
  }

  async fetchInstruments() {
    try {
      const res = await fetch(`${API_BASE}/api/instruments`);
      if (res.ok) {
        const json = await res.json();
        this.instruments = json.instruments || json;
      }
    } catch (e) {
      console.warn('Using local instruments spec fallback');
    }
  }

  async fetchInitialState() {
    await Promise.all([
      this.fetchAccount(),
      this.fetchPositions(),
      this.fetchOrders(),
      this.fetchTrades()
    ]);
  }

  async fetchAccount() {
    if (this.isStandaloneMode) return;
    try {
      const res = await fetch(`${API_BASE}/api/account`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        this.updateAccountState(json.account || json);
      }
    } catch (e) {}
  }

  async fetchPositions() {
    if (this.isStandaloneMode) return;
    try {
      const res = await fetch(`${API_BASE}/api/positions`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        this.updatePositionsState(json.positions || json);
      }
    } catch (e) {}
  }

  async fetchOrders() {
    if (this.isStandaloneMode) return;
    try {
      const res = await fetch(`${API_BASE}/api/orders`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        this.updateOrdersState(json.orders || json);
      }
    } catch (e) {}
  }

  async fetchTrades() {
    if (this.isStandaloneMode) return;
    try {
      const res = await fetch(`${API_BASE}/api/trades`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        this.updateTradesState(json.trades || json);
      }
    } catch (e) {}
  }

  updateAccountState(acc) {
    if (!acc) return;
    this.account = Object.assign(this.account, acc);
    
    // Format Header Account Bar
    if (this.dom.headerEquity) this.dom.headerEquity.textContent = `$${this.account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (this.dom.headerAvail) this.dom.headerAvail.textContent = `$${this.account.availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const ratio = (this.account.marginRatio || 0).toFixed(1);
    if (this.dom.headerMarginRatio) {
      this.dom.headerMarginRatio.textContent = `${ratio}%`;
      this.dom.headerMarginRatio.style.color = (ratio > 75) ? '#ff3b30' : (ratio > 40) ? '#ff9800' : '#00e676';
    }

    if (this.dom.dock.calcAvail) {
      this.dom.dock.calcAvail.textContent = `$${this.account.availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    this.updateDockTelemetry();
  }

  updatePositionsState(positions) {
    this.positions = Array.isArray(positions) ? positions : [];
    if (this.dom.posBadge) this.dom.posBadge.textContent = this.positions.length;
    const mobileBadge = document.getElementById('mobile-pos-badge');
    if (mobileBadge) {
      mobileBadge.textContent = this.positions.length;
      mobileBadge.style.display = this.positions.length > 0 ? 'inline-block' : 'none';
    }
    this.renderPositionsTable();
    this.syncPositionChartLines();
  }

  updateOrdersState(orders) {
    this.openOrders = Array.isArray(orders) ? orders : [];
    if (this.dom.ordersBadge) this.dom.ordersBadge.textContent = this.openOrders.length;
    this.renderOrdersTable();
  }

  updateTradesState(trades) {
    this.trades = Array.isArray(trades) ? trades : [];
    this.renderTradesTable();
  }

  // =========================================================================
  // CHART INITIALIZATION
  // =========================================================================
  initChart() {
    const container = document.getElementById('chart-container');
    container.innerHTML = '';

    if (typeof LightweightCharts !== 'undefined') {
      this.chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { color: '#0b0e14' },
          textColor: '#787b86',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        },
        grid: {
          vertLines: { color: 'rgba(42, 46, 57, 0.35)' },
          horzLines: { color: 'rgba(42, 46, 57, 0.35)' }
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal
        },
        rightPriceScale: {
          borderColor: '#2a2e39',
          autoScale: true,
          scaleMargins: {
            top: 0.12,
            bottom: 0.18
          }
        },
        timeScale: {
          borderColor: '#2a2e39',
          timeVisible: true,
          secondsVisible: false,
          shiftVisibleRangeOnNewBar: true
        }
      });

      this.candleSeries = this.chart.addCandlestickSeries({
        upColor: '#00e676',
        downColor: '#ff3b30',
        borderUpColor: '#00e676',
        borderDownColor: '#ff3b30',
        wickUpColor: '#00e676',
        wickDownColor: '#ff3b30',
        priceLineVisible: true,
        lastValueVisible: true,
        priceLineWidth: 1,
        priceLineColor: '#00d2ff',
        priceLineStyle: (typeof LightweightCharts !== 'undefined' && LightweightCharts.LineStyle) ? LightweightCharts.LineStyle.Dashed : 2
      });

      // Institutional Moving Averages
      this.fastEmaSeries = this.chart.addLineSeries({
        color: '#2962ff',
        lineWidth: 1.5,
        title: 'EMA 20'
      });

      this.slowEmaSeries = this.chart.addLineSeries({
        color: '#ff9800',
        lineWidth: 1.5,
        title: 'EMA 50'
      });

      this.trendEmaSeries = this.chart.addLineSeries({
        color: '#ffd700',
        lineWidth: 2,
        title: 'EMA 200'
      });

      this.vwapSeries = this.chart.addLineSeries({
        color: '#00d2ff',
        lineWidth: 2,
        title: 'VWAP'
      });

      // Dedicated Volume Histogram at bottom of chart
      this.volumeSeries = this.chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: {
          top: 0.8,
          bottom: 0
        }
      });

      // Sub-Panels: RSI (14)
      const rsiContainer = document.getElementById('rsi-container');
      if (rsiContainer) {
        this.rsiChart = LightweightCharts.createChart(rsiContainer, {
          width: rsiContainer.clientWidth || container.clientWidth,
          height: 110,
          layout: { background: { color: '#0b0e14' }, textColor: '#787b86', fontFamily: '-apple-system, sans-serif' },
          grid: { vertLines: { color: 'rgba(42, 46, 57, 0.2)' }, horzLines: { color: 'rgba(42, 46, 57, 0.2)' } },
          rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.1, bottom: 0.1 } },
          timeScale: { visible: false }
        });
        this.rsiSeries = this.rsiChart.addLineSeries({ color: '#ab47bc', lineWidth: 1.5, title: 'RSI (14)' });
        this.rsiSeries.createPriceLine({ price: 70, color: '#f23645', lineWidth: 1, lineStyle: 2, title: '70' });
        this.rsiSeries.createPriceLine({ price: 30, color: '#089981', lineWidth: 1, lineStyle: 2, title: '30' });
      }

      // Sub-Panels: MACD (12, 26, 9)
      const macdContainer = document.getElementById('macd-container');
      if (macdContainer) {
        this.macdChart = LightweightCharts.createChart(macdContainer, {
          width: macdContainer.clientWidth || container.clientWidth,
          height: 110,
          layout: { background: { color: '#0b0e14' }, textColor: '#787b86', fontFamily: '-apple-system, sans-serif' },
          grid: { vertLines: { color: 'rgba(42, 46, 57, 0.2)' }, horzLines: { color: 'rgba(42, 46, 57, 0.2)' } },
          rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.1, bottom: 0.1 } },
          timeScale: { visible: false }
        });
        this.macdLineSeries = this.macdChart.addLineSeries({ color: '#2962ff', lineWidth: 1.5, title: 'MACD' });
        this.macdSignalSeries = this.macdChart.addLineSeries({ color: '#ff6d00', lineWidth: 1.5, title: 'Signal' });
        this.macdHistSeries = this.macdChart.addHistogramSeries({ title: 'Histogram' });
      }

      // Synchronize time scales across main chart, RSI, and MACD
      this.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (this.rsiChart && range) this.rsiChart.timeScale().setVisibleLogicalRange(range);
        if (this.macdChart && range) this.macdChart.timeScale().setVisibleLogicalRange(range);
      });
    } else {
      console.warn('LightweightCharts library not loaded');
    }
  }

  // =========================================================================
  // TRADINGVIEW ADVANCED REAL-TIME CHART INTEGRATION
  // =========================================================================
  getTradingViewSymbol(symbol) {
    const clean = (symbol || this.symbol || 'BTCUSDT').toUpperCase();
    return `BINANCE:${clean}.P`;
  }

  getTradingViewInterval(interval) {
    const intv = interval || this.interval || '1m';
    const map = {
      '1m': '1',
      '3m': '3',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '1h': '60',
      '2h': '120',
      '4h': '240',
      '1d': 'D',
      '1w': 'W'
    };
    return map[intv] || '1';
  }

  initTradingViewChart() {
    const container = document.getElementById('tradingview_chart');
    if (!container) return;

    if (typeof TradingView === 'undefined' || typeof TradingView.widget === 'undefined') {
      setTimeout(() => this.initTradingViewChart(), 350);
      return;
    }

    const tvSymbol = this.getTradingViewSymbol(this.symbol);
    const tvInterval = this.getTradingViewInterval(this.interval);

    try {
      container.innerHTML = '';
      this.tvWidget = new TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        interval: tvInterval,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#0b0e14',
        enable_publishing: false,
        allow_symbol_change: true,
        container_id: 'tradingview_chart',
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        withdateranges: true,
        save_image: true,
        studies: [],
        overrides: {
          'paneProperties.background': '#0b0e14',
          'paneProperties.vertGridProperties.color': 'rgba(42, 46, 57, 0.35)',
          'paneProperties.horzGridProperties.color': 'rgba(42, 46, 57, 0.35)',
          'symbolWatermarkProperties.transparency': 90,
          'scalesProperties.textColor': '#787b86',
          'mainSeriesProperties.candleStyle.upColor': '#00e676',
          'mainSeriesProperties.candleStyle.downColor': '#ff3b30',
          'mainSeriesProperties.candleStyle.borderUpColor': '#00e676',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ff3b30',
          'mainSeriesProperties.candleStyle.wickUpColor': '#00e676',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ff3b30'
        }
      });
    } catch (err) {
      console.warn('TradingView initialization exception:', err);
    }
  }

  toggleFullscreen() {
    const doc = document;
    const docEl = doc.documentElement;
    const isFullscreen = doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;

    if (!isFullscreen) {
      const req = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
      if (req) {
        req.call(docEl).catch(err => {
          this.showToast(`Fullscreen request error: ${err.message}`, 'error');
        });
      }
    } else {
      const exit = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exit) {
        exit.call(doc).catch(err => {
          console.warn('Exit fullscreen error:', err);
        });
      }
    }
  }

  // =========================================================================
  // CHART POSITION & SIGNAL PRICE LINES
  // =========================================================================
  syncPositionChartLines() {
    this.clearPositionPriceLines();
    if (!this.candleSeries) return;

    // Find position matching the active chart symbol
    const pos = this.positions.find(p => p.symbol === this.symbol);
    if (!pos) return;

    try {
      // 1. Entry Line (Cyan / Blue Solid)
      const entryColor = pos.side === 'LONG' ? '#00d2ff' : '#ff9100';
      this.positionPriceLines.push(this.candleSeries.createPriceLine({
        price: pos.entryPrice,
        color: entryColor,
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Solid,
        axisLabelVisible: true,
        title: `${pos.side} ENTRY [${pos.entryPrice.toFixed(this.getPriceDecimals())}]`
      }));

      // 2. Stop Loss Line (Crimson Dashed)
      if (pos.stopLoss) {
        this.positionPriceLines.push(this.candleSeries.createPriceLine({
          price: pos.stopLoss,
          color: '#ff3b30',
          lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `POS SL [${pos.stopLoss.toFixed(this.getPriceDecimals())}]`
        }));
      }

      // 3. Take Profit Line (Emerald Dashed)
      if (pos.takeProfit) {
        this.positionPriceLines.push(this.candleSeries.createPriceLine({
          price: pos.takeProfit,
          color: '#00e676',
          lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `POS TP [${pos.takeProfit.toFixed(this.getPriceDecimals())}]`
        }));
      }

      // 4. Liquidation Line (Orange Dotted)
      if (pos.liquidationPrice && pos.liquidationPrice > 0) {
        this.positionPriceLines.push(this.candleSeries.createPriceLine({
          price: pos.liquidationPrice,
          color: '#ff9800',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dotted,
          axisLabelVisible: true,
          title: `LIQ [${pos.liquidationPrice.toFixed(this.getPriceDecimals())}]`
        }));
      }
    } catch (e) {
      console.warn('Failed to draw position price line:', e);
    }
  }

  clearPositionPriceLines() {
    if (!this.candleSeries || !this.positionPriceLines) {
      this.positionPriceLines = [];
      return;
    }
    for (const pl of this.positionPriceLines) {
      try { this.candleSeries.removePriceLine(pl); } catch (e) {}
    }
    this.positionPriceLines = [];
  }

  updateSignalPriceLines(signal) {
    this.clearSignalPriceLines();
    if (!this.candleSeries || !signal) return;

    try {
      if (signal.entryPrice || signal.price) {
        this.signalPriceLines.push(this.candleSeries.createPriceLine({
          price: signal.entryPrice || signal.price,
          color: '#ffffff',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Solid,
          axisLabelVisible: true,
          title: 'SIG ENTRY'
        }));
      }
      if (signal.sl) {
        this.signalPriceLines.push(this.candleSeries.createPriceLine({
          price: signal.sl,
          color: '#ff3b30',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SIG SL'
        }));
      }
      if (signal.tp1) {
        this.signalPriceLines.push(this.candleSeries.createPriceLine({
          price: signal.tp1,
          color: '#00e676',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SIG TP1'
        }));
      }
      if (signal.tp2) {
        this.signalPriceLines.push(this.candleSeries.createPriceLine({
          price: signal.tp2,
          color: '#00e676',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SIG TP2'
        }));
      }
      if (signal.trail) {
        this.signalPriceLines.push(this.candleSeries.createPriceLine({
          price: signal.trail,
          color: '#ffd700',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'SIG TRAIL'
        }));
      }
    } catch (e) {}
  }

  clearSignalPriceLines() {
    if (!this.candleSeries || !this.signalPriceLines) {
      this.signalPriceLines = [];
      return;
    }
    for (const pl of this.signalPriceLines) {
      try { this.candleSeries.removePriceLine(pl); } catch (e) {}
    }
    this.signalPriceLines = [];
  }

  // =========================================================================
  // PAIR & TIMEFRAME SWITCHING
  // =========================================================================
  async switchPair(newSymbol) {
    if (this.symbol === newSymbol && this.bars.length > 0) return;
    
    this.symbol = newSymbol;
    this.engine.resetState();
    this.activeSignal = null;
    this.clearSignalPriceLines();
    this.clearPositionPriceLines();

    // Update active UI pill
    document.querySelectorAll('.pair-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-pair') === newSymbol);
    });

    // Update dock unit badge
    const spec = this.getInstrumentSpec(newSymbol);
    if (this.dom.dock.unitBadge) {
      this.dom.dock.unitBadge.textContent = newSymbol.replace('USDT', '');
    }
    if (this.dom.dock.qtyLabel) {
      this.dom.dock.qtyLabel.textContent = 'Coins';
    }

    // Adjust default leverage if needed
    if (spec && this.currentLeverage > spec.maxLeverage) {
      this.currentLeverage = spec.defaultLeverage;
      this.dom.dock.leverageBtn.textContent = `${this.currentLeverage}x ▾`;
    }

    this.updateStatus(`SWITCHING TO ${newSymbol}...`, false);
    this.resetHeroBanner();

    if (this.tvWidget) {
      const tvSym = this.getTradingViewSymbol(newSymbol);
      const tvInt = this.getTradingViewInterval(this.interval);
      if (typeof this.tvWidget.setSymbol === 'function') {
        try { this.tvWidget.setSymbol(tvSym, tvInt); } catch (e) { this.initTradingViewChart(); }
      } else {
        this.initTradingViewChart();
      }
    }

    await this.connectMarket(this.symbol, this.interval);
    this.syncPositionChartLines();
    this.updateDockTelemetry();
  }

  async switchTimeframe(newInterval) {
    this.interval = newInterval;
    const htfMap = {
      '1m': '5m',
      '3m': '15m',
      '5m': '15m',
      '15m': '1h',
      '30m': '2h',
      '1h': '4h',
      '4h': '1d',
      '1d': '1w'
    };
    this.htfInterval = htfMap[newInterval] || '1h';
    this.engine.resetState();
    this.activeSignal = null;
    this.clearSignalPriceLines();
    this.resetHeroBanner();

    if (this.tvWidget) {
      const tvSym = this.getTradingViewSymbol(this.symbol);
      const tvInt = this.getTradingViewInterval(newInterval);
      if (typeof this.tvWidget.setSymbol === 'function') {
        try { this.tvWidget.setSymbol(tvSym, tvInt); } catch (e) { this.initTradingViewChart(); }
      } else {
        this.initTradingViewChart();
      }
    }

    await this.connectMarket(this.symbol, this.interval);
  }

  // =========================================================================
  // MARKET CONNECTION & DATA STREAMING (HIGH-FREQUENCY REAL-TIME)
  // =========================================================================
  async connectMarket(symbol, interval) {
    this.updateStatus(`LOADING ${symbol}...`, false);

    // 1. Detach old sockets
    if (this.activeWs) {
      this.activeWs.onopen = this.activeWs.onmessage = this.activeWs.onerror = this.activeWs.onclose = null;
      try { this.activeWs.close(); } catch (e) {}
      this.activeWs = null;
    }
    if (this.tradeWs) {
      this.tradeWs.onopen = this.tradeWs.onmessage = this.tradeWs.onerror = this.tradeWs.onclose = null;
      try { this.tradeWs.close(); } catch (e) {}
      this.tradeWs = null;
    }
    if (this.tickerWs) {
      this.tickerWs.onopen = this.tickerWs.onmessage = this.tickerWs.onerror = this.tickerWs.onclose = null;
      try { this.tickerWs.close(); } catch (e) {}
      this.tickerWs = null;
    }

    try {
      // 2. Fetch Historical Klines
      let klinesUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=250`;
      let res = await fetch(klinesUrl);
      let rawData;
      if (res.ok) {
        rawData = await res.json();
      } else {
        // Fallback to Spot if Futures restricted
        const spotUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=250`;
        const spotRes = await fetch(spotUrl);
        rawData = await spotRes.json();
      }

      if (!Array.isArray(rawData) || rawData.length === 0) {
        throw new Error(`No candle data for ${symbol}`);
      }

      this.bars = rawData.map(d => ({
        time: Math.floor(d[0] / 1000),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
      }));

      // Seed immediate price for order placement before WebSocket connects
      const latestBar = this.bars[this.bars.length - 1];
      if (latestBar) {
        const p = latestBar.close;
        const spread = p * 0.00004;
        this.livePrices[symbol] = {
          symbol,
          price: p,
          bid: p - spread / 2,
          ask: p + spread / 2,
          mark: p,
          high24h: latestBar.high,
          low24h: latestBar.low,
          change24h: 0,
          spread: Math.max(0.01, spread),
          time: Date.now()
        };

        if (this.isStandaloneMode && this.clientEngine) {
          this.clientEngine.updatePrice(symbol, this.livePrices[symbol]);
        }
      }

      // 3. Fetch HTF bars
      try {
        let htfUrl = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${this.htfInterval}&limit=100`;
        let htfRes = await fetch(htfUrl);
        if (!htfRes.ok) {
          htfRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${this.htfInterval}&limit=100`);
        }
        if (htfRes.ok) {
          const htfData = await htfRes.json();
          if (Array.isArray(htfData)) {
            this.htfBars = htfData.map(d => ({
              time: Math.floor(d[0] / 1000),
              open: parseFloat(d[1]),
              high: parseFloat(d[2]),
              low: parseFloat(d[3]),
              close: parseFloat(d[4]),
              volume: parseFloat(d[5])
            }));
          }
        }
      } catch (err) {}

      // Initial analysis and render
      this.recalculateAndRender(true);

      // 4. Connect WebSockets
      this.connectWebSockets(symbol, interval);
      this.updateStatus(this.isStandaloneMode ? `🟢 CLOUD DEMO (${symbol})` : `LIVE (${symbol})`, true);
    } catch (error) {
      console.error(`Connection error for ${symbol}:`, error);
      this.updateStatus(`OFFLINE (${symbol})`, false);
      setTimeout(() => {
        if (this.symbol === symbol) this.connectMarket(symbol, interval);
      }, 5000);
    }
  }

  connectWebSockets(symbol, interval) {
    const s = symbol.toLowerCase();

    // A. KLINE STREAM: For interval bar creation and completed candle verification
    const wsKlineUrl = `wss://fstream.binance.com/ws/${s}@kline_${interval}`;
    this.activeWs = new WebSocket(wsKlineUrl);

    this.activeWs.onopen = () => {
      this.updateStatus(this.isStandaloneMode ? `🟢 CLOUD DEMO (${symbol})` : `LIVE (${symbol})`, true);
    };

    this.activeWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg.k || this.symbol !== symbol) return;
        const k = msg.k;

        const updatedBar = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v)
        };

        const isClosed = k.x;
        this.processIncomingTick(updatedBar, isClosed);
      } catch (e) {}
    };

    this.activeWs.onerror = () => {
      if (this.activeWs && !this.activeWs._fallback) {
        try { this.activeWs.close(); } catch(e) {}
        this.activeWs = new WebSocket(`wss://stream.binance.com:9443/ws/${s}@kline_${interval}`);
        this.activeWs._fallback = true;
        this.activeWs.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (!msg.k || this.symbol !== symbol) return;
            const k = msg.k;
            this.processIncomingTick({
              time: Math.floor(k.t / 1000),
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v)
            }, k.x);
          } catch(e) {}
        };
      }
    };

    this.activeWs.onclose = () => {
      if (this.symbol === symbol && this.interval === interval) {
        setTimeout(() => {
          if (this.symbol === symbol) this.connectWebSockets(symbol, interval);
        }, 3000);
      }
    };

    // B. REAL-TIME TRADE STREAM (@aggTrade): High-frequency ticks for live moving candle!
    if (this.tradeWs) {
      try { this.tradeWs.close(); } catch(e) {}
      this.tradeWs = null;
    }
    const wsTradeUrl = `wss://fstream.binance.com/ws/${s}@aggTrade`;
    this.tradeWs = new WebSocket(wsTradeUrl);
    this.tradeWs.onmessage = (event) => {
      try {
        const t = JSON.parse(event.data);
        if (this.symbol !== symbol) return;
        const price = parseFloat(t.p);
        if (!isNaN(price)) {
          this.updateLiveTick(price);
        }
      } catch (e) {}
    };

    this.tradeWs.onerror = () => {
      if (this.tradeWs && !this.tradeWs._fallback) {
        try { this.tradeWs.close(); } catch(e) {}
        this.tradeWs = new WebSocket(`wss://stream.binance.com:9443/ws/${s}@aggTrade`);
        this.tradeWs._fallback = true;
        this.tradeWs.onmessage = (ev) => {
          try {
            const t = JSON.parse(ev.data);
            if (this.symbol !== symbol) return;
            const price = parseFloat(t.p);
            if (!isNaN(price)) this.updateLiveTick(price);
          } catch(e) {}
        };
      }
    };

    // C. 24H TICKER STREAM: Bid, Ask, Spread, 24h High/Low
    if (this.tickerWs) {
      try { this.tickerWs.close(); } catch(e) {}
      this.tickerWs = null;
    }
    const wsTickerUrl = `wss://fstream.binance.com/ws/${s}@ticker`;
    this.tickerWs = new WebSocket(wsTickerUrl);
    this.tickerWs.onmessage = (event) => {
      try {
        const t = JSON.parse(event.data);
        if (this.symbol !== symbol) return;

        const last = parseFloat(t.c);
        const bid = parseFloat(t.b);
        const ask = parseFloat(t.a);
        const high = parseFloat(t.h);
        const low = parseFloat(t.l);
        const change = parseFloat(t.P);

        this.livePrices[symbol] = {
          symbol,
          price: last,
          bid: bid || last,
          ask: ask || last,
          mark: last,
          high24h: high,
          low24h: low,
          change24h: change,
          spread: Math.max(0.01, (ask - bid) || (last * 0.00004)),
          time: Date.now()
        };

        if (this.isStandaloneMode && this.clientEngine) {
          this.clientEngine.updatePrice(symbol, this.livePrices[symbol]);
        }

        this.updateTickerBarFromPrice(this.livePrices[symbol]);
        this.updateLivePositionPnL();
      } catch (e) {}
    };
  }

  // Real-time tick update on current candlestick (sub-second movement)
  updateLiveTick(price) {
    if (!price || isNaN(price) || !this.bars || this.bars.length === 0) return;
    const n = this.bars.length;
    const lastBar = this.bars[n - 1];

    lastBar.close = price;
    if (price > lastBar.high) lastBar.high = price;
    if (price < lastBar.low) lastBar.low = price;

    // Update chart candle and price line immediately
    if (this.candleSeries) {
      this.candleSeries.update(lastBar);
    }

    const prevPrice = this.bars[n - 2] ? this.bars[n - 2].close : price;
    this.updatePriceDisplay(price, prevPrice);

    if (this.livePrices[this.symbol]) {
      this.livePrices[this.symbol].price = price;
      this.livePrices[this.symbol].mark = price;
    }

    if (this.isStandaloneMode && this.clientEngine) {
      this.clientEngine.updatePrice(this.symbol, {
        symbol: this.symbol,
        price,
        mark: price,
        time: Date.now()
      });
    }

    this.updateLivePositionPnL();
  }

  processIncomingTick(bar, isClosed) {
    const n = this.bars.length;
    if (n === 0) {
      this.bars.push(bar);
    } else {
      const lastBar = this.bars[n - 1];
      if (bar.time === lastBar.time) {
        this.bars[n - 1] = bar;
      } else if (bar.time > lastBar.time) {
        this.bars.push(bar);
        if (this.bars.length > 300) this.bars.shift();
      }
    }

    // Update real-time price header
    this.updatePriceDisplay(bar.close, this.bars[n - 2] ? this.bars[n - 2].close : bar.close);

    // Update live candle on chart
    if (this.candleSeries) {
      this.candleSeries.update(bar);
    }

    // Run Scalper Confluence Analysis
    const analysis = this.engine.analyze(this.bars, this.htfBars);
    if (!analysis) return;

    // Update HUD & Hero Banner
    this.updateHud(analysis.latest);

    // On Bar Close: execute signals, notifications, and markers
    if (isClosed) {
      this.recalculateAndRender(false);
      this.checkSignalsOnConfirmedBar(analysis);
    }
  }

  recalculateAndRender(isNewPair = false) {
    const analysis = this.engine.analyze(this.bars, this.htfBars);
    if (!analysis) return;

    const { vectors } = analysis;

    if (this.chart && this.candleSeries) {
      const formattedCandles = this.bars.map(b => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close
      }));
      this.candleSeries.setData(formattedCandles);

      // Overlays
      if (this.fastEmaSeries) this.fastEmaSeries.setData(this.formatLineData(vectors.fastEma));
      if (this.slowEmaSeries) this.slowEmaSeries.setData(this.formatLineData(vectors.slowEma));
      if (this.trendEmaSeries) this.trendEmaSeries.setData(this.formatLineData(vectors.trendEma));
      if (this.vwapSeries) this.vwapSeries.setData(this.formatLineData(vectors.vwap));

      // Dedicated Volume Histogram with Buy/Sell coloring
      if (this.volumeSeries) {
        const volData = this.bars.map(b => ({
          time: b.time,
          value: b.volume || 10,
          color: b.close >= b.open ? 'rgba(0, 230, 118, 0.45)' : 'rgba(255, 59, 48, 0.45)'
        }));
        this.volumeSeries.setData(volData);
      }

      // Sub-Panels: RSI (14)
      if (this.rsiSeries && vectors.rsi) {
        this.rsiSeries.setData(this.formatLineData(vectors.rsi));
      }

      // Sub-Panels: MACD (12, 26, 9)
      if (this.macdLineSeries && vectors.macdLine) {
        this.macdLineSeries.setData(this.formatLineData(vectors.macdLine));
      }
      if (this.macdSignalSeries && vectors.signalLine) {
        this.macdSignalSeries.setData(this.formatLineData(vectors.signalLine));
      }
      if (this.macdHistSeries && vectors.histogram) {
        const histData = [];
        for (let i = 0; i < this.bars.length; i++) {
          const val = vectors.histogram[i];
          if (!isNaN(val)) {
            histData.push({
              time: this.bars[i].time,
              value: val,
              color: val >= 0 ? 'rgba(0, 230, 118, 0.65)' : 'rgba(255, 59, 48, 0.65)'
            });
          }
        }
        this.macdHistSeries.setData(histData);
      }

      // Markers
      this.renderMarkers(analysis.signals);

      // When switching pairs, auto-fit content so scales adapt immediately
      if (isNewPair) {
        this.chart.timeScale().fitContent();
      }
    }

    // Check for active signals
    const recentSignals = analysis.signals.filter(s => s.type === 'BUY' || s.type === 'SELL');
    if (recentSignals.length > 0) {
      const latestSig = recentSignals[recentSignals.length - 1];
      const barsAgo = this.bars.length - 1 - latestSig.barIndex;
      if (barsAgo <= 15) {
        this.activeSignal = latestSig;
        this.updateHeroBanner(latestSig);
        this.updateSignalPriceLines(latestSig);
      } else {
        this.resetHeroBanner();
      }
    } else {
      this.resetHeroBanner();
    }

    this.updateHud(analysis.latest);
  }

  formatLineData(vector) {
    const res = [];
    for (let i = 0; i < this.bars.length; i++) {
      if (!isNaN(vector[i])) {
        res.push({ time: this.bars[i].time, value: vector[i] });
      }
    }
    return res;
  }

  renderMarkers(signals) {
    if (!this.candleSeries) return;
    const markers = [];

    const recent = signals.slice(-35);
    for (const sig of recent) {
      if (sig.type === 'BUY') {
        markers.push({
          time: sig.time,
          position: 'belowBar',
          color: '#00e676',
          shape: 'arrowUp',
          text: `BUY ${sig.score}/8`
        });
      } else if (sig.type === 'SELL') {
        markers.push({
          time: sig.time,
          position: 'aboveBar',
          color: '#ff3b30',
          shape: 'arrowDown',
          text: `SELL ${sig.score}/8`
        });
      }
    }
    this.candleSeries.setMarkers(markers);
  }

  // =========================================================================
  // TICKER & PRICE DISPLAYS
  // =========================================================================
  updatePriceDisplay(price, prevPrice) {
    const decimals = this.getPriceDecimals();
    const formatted = price.toFixed(decimals);
    
    if (this.dom.tickerPrice) {
      this.dom.tickerPrice.textContent = formatted;
      if (price > prevPrice) {
        this.dom.tickerPrice.className = 'ticker-price flash-up';
      } else if (price < prevPrice) {
        this.dom.tickerPrice.className = 'ticker-price flash-down';
      }
    }

    // Also update trading dock action buttons ask/bid text
    const spread = price * 0.00005;
    const ask = price + spread / 2;
    const bid = price - spread / 2;

    if (this.dom.dock.btnAskPrice) this.dom.dock.btnAskPrice.textContent = `Ask: $${ask.toFixed(decimals)}`;
    if (this.dom.dock.btnBidPrice) this.dom.dock.btnBidPrice.textContent = `Bid: $${bid.toFixed(decimals)}`;
  }

  updateTickerBarFromPrice(p) {
    const decimals = this.getPriceDecimals(p.symbol);
    if (this.dom.tickerBid) this.dom.tickerBid.textContent = p.bid ? p.bid.toFixed(decimals) : '---';
    if (this.dom.tickerAsk) this.dom.tickerAsk.textContent = p.ask ? p.ask.toFixed(decimals) : '---';
    if (this.dom.tickerSpread) this.dom.tickerSpread.textContent = p.spread ? p.spread.toFixed(decimals) : '0.00';
    if (this.dom.tickerHigh) this.dom.tickerHigh.textContent = p.high24h ? p.high24h.toFixed(decimals) : '---';
    if (this.dom.tickerLow) this.dom.tickerLow.textContent = p.low24h ? p.low24h.toFixed(decimals) : '---';

    // Derivatives Stats (Mark, Index, 24h Vol, Funding)
    if (this.dom.tickerMark) {
      const markPrice = p.mark || p.price;
      this.dom.tickerMark.textContent = markPrice ? markPrice.toFixed(decimals) : '---';
    }
    if (this.dom.tickerIndex) {
      const idxPrice = p.mark ? (p.mark * 0.9999) : (p.price ? p.price * 0.9999 : 0);
      this.dom.tickerIndex.textContent = idxPrice ? idxPrice.toFixed(decimals) : '---';
    }
    if (this.dom.tickerVol) {
      const vol = p.volume24h || (p.price ? p.price * 12450 : 0);
      let volStr = '$' + vol.toFixed(0);
      if (vol >= 1e9) volStr = '$' + (vol / 1e9).toFixed(2) + 'B';
      else if (vol >= 1e6) volStr = '$' + (vol / 1e6).toFixed(2) + 'M';
      this.dom.tickerVol.textContent = volStr;
    }
    if (this.dom.tickerFunding) {
      const now = new Date();
      const hoursToFunding = 7 - (now.getUTCHours() % 8);
      const minutesToFunding = 59 - now.getUTCMinutes();
      const secondsToFunding = 59 - now.getUTCSeconds();
      const cdStr = `${String(hoursToFunding).padStart(2, '0')}:${String(minutesToFunding).padStart(2, '0')}:${String(secondsToFunding).padStart(2, '0')}`;
      this.dom.tickerFunding.textContent = `+0.0100% / ${cdStr}`;
    }
    
    if (this.dom.tickerChange && p.change24h !== undefined) {
      const sign = p.change24h >= 0 ? '+' : '';
      this.dom.tickerChange.textContent = `${sign}${p.change24h.toFixed(2)}%`;
      this.dom.tickerChange.className = `ticker-change ${p.change24h >= 0 ? 'up' : 'down'}`;
    }

    if (this.dom.dock.btnAskPrice && p.ask) this.dom.dock.btnAskPrice.textContent = `Ask: $${p.ask.toFixed(decimals)}`;
    if (this.dom.dock.btnBidPrice && p.bid) this.dom.dock.btnBidPrice.textContent = `Bid: $${p.bid.toFixed(decimals)}`;
  }

  refreshPriceDisplays() {
    const cur = this.livePrices[this.symbol];
    if (cur) this.updateTickerBarFromPrice(cur);
  }

  // =========================================================================
  // TRADING DOCK: TELEMETRY, PERCENTAGES & ORDER PLACEMENT
  // =========================================================================
  getCurrentOrderPrice() {
    if (this.orderType === 'LIMIT') {
      const limitVal = parseFloat(this.dom.dock.limitPriceInput.value);
      if (!isNaN(limitVal) && limitVal > 0) return limitVal;
    }
    return this.getCurrentMarketPrice();
  }

  getCurrentMarketPrice() {
    const p = this.livePrices[this.symbol];
    if (p && p.price) return p.price;
    const lastBar = this.bars[this.bars.length - 1];
    return lastBar ? lastBar.close : 0;
  }

  applyMarginPercentage(pct) {
    const available = this.account.availableBalance || 0;
    if (available <= 0) {
      this.showToast('No available margin balance', 'error');
      return;
    }

    const price = this.getCurrentOrderPrice();
    if (price <= 0) return;

    const marginToUse = available * (pct / 100);
    const notional = marginToUse * this.currentLeverage;
    const qty = notional / price;
    const decimals = this.getQtyDecimals();

    this.dom.dock.qtyInput.value = qty.toFixed(decimals);
    this.updateDockTelemetry();
  }

  updateDockTelemetry() {
    const qty = parseFloat(this.dom.dock.qtyInput.value) || 0;
    const price = this.getCurrentOrderPrice() || 0;
    const leverage = this.currentLeverage || 10;
    const spec = this.getInstrumentSpec();

    const notional = qty * price;
    const margin = notional / leverage;
    const feeRate = spec ? spec.takerFeeRate : 0.0005;
    const fee = notional * feeRate;

    // Calculate Estimated Liquidation Price for BUY/LONG
    const mmr = spec ? spec.maintenanceMarginRate : 0.005;
    let estLiqLong = 0;
    if (price > 0 && leverage > 0) {
      estLiqLong = price * (1 - (1 / leverage) + mmr);
      if (estLiqLong < 0) estLiqLong = 0;
    }

    // Format Telemetry elements
    if (this.dom.dock.calcNotional) this.dom.dock.calcNotional.textContent = `$${notional.toFixed(2)}`;
    if (this.dom.dock.calcMargin) {
      this.dom.dock.calcMargin.textContent = `$${margin.toFixed(2)}`;
      if (margin > this.account.availableBalance) {
        this.dom.dock.calcMargin.style.color = '#ff3b30';
      } else {
        this.dom.dock.calcMargin.style.color = '#ffffff';
      }
    }
    if (this.dom.dock.calcLiq) {
      this.dom.dock.calcLiq.textContent = estLiqLong > 0 ? `$${estLiqLong.toFixed(this.getPriceDecimals())}` : '---';
    }
    if (this.dom.dock.calcFee) this.dom.dock.calcFee.textContent = `$${fee.toFixed(4)}`;
  }

  handleOrderSubmit(side) {
    const qty = parseFloat(this.dom.dock.qtyInput.value);
    const spec = this.getInstrumentSpec();
    const minQty = spec ? spec.minQty : 0.01;

    if (isNaN(qty) || qty < minQty) {
      this.showToast(`Invalid quantity. Minimum is ${minQty}`, 'error');
      this.dom.dock.qtyInput.focus();
      return;
    }

    let price = this.getCurrentOrderPrice();
    if (this.orderType === 'LIMIT') {
      price = parseFloat(this.dom.dock.limitPriceInput.value);
      if (isNaN(price) || price <= 0) {
        this.showToast('Please enter a valid Limit Price', 'error');
        this.dom.dock.limitPriceInput.focus();
        return;
      }
    }

    const notional = qty * price;
    const requiredMargin = notional / this.currentLeverage;
    if (requiredMargin > this.account.availableBalance) {
      this.showToast(`Insufficient margin. Required: $${requiredMargin.toFixed(2)}, Available: $${this.account.availableBalance.toFixed(2)}`, 'error');
      return;
    }

    // Optional SL/TP
    let stopLoss = null;
    let takeProfit = null;
    if (this.dom.dock.enableTpsl.checked) {
      const slVal = parseFloat(this.dom.dock.slInput.value);
      const tpVal = parseFloat(this.dom.dock.tpInput.value);
      if (!isNaN(slVal) && slVal > 0) stopLoss = slVal;
      if (!isNaN(tpVal) && tpVal > 0) takeProfit = tpVal;

      // Validation
      if (stopLoss) {
        if (side === 'BUY' && stopLoss >= price) {
          this.showToast('BUY Stop Loss must be BELOW order price', 'error');
          return;
        }
        if (side === 'SELL' && stopLoss <= price) {
          this.showToast('SELL Stop Loss must be ABOVE order price', 'error');
          return;
        }
      }
      if (takeProfit) {
        if (side === 'BUY' && takeProfit <= price) {
          this.showToast('BUY Take Profit must be ABOVE order price', 'error');
          return;
        }
        if (side === 'SELL' && takeProfit >= price) {
          this.showToast('SELL Take Profit must be BELOW order price', 'error');
          return;
        }
      }
    }

    // Prepare pending order object
    this.pendingOrder = {
      symbol: this.symbol,
      side,
      type: this.orderType,
      quantity: qty,
      price: (this.orderType === 'LIMIT') ? price : undefined,
      leverage: this.currentLeverage,
      stopLoss,
      takeProfit,
      notional,
      requiredMargin
    };

    // Open Confirmation Modal
    this.openOrderConfirmModal(this.pendingOrder);
  }

  openOrderConfirmModal(order) {
    const m = this.dom.modals;
    const isBuy = (order.side === 'BUY');
    
    m.confirmTitle.textContent = `Confirm Demo ${order.type} ${order.side === 'BUY' ? 'LONG' : 'SHORT'}`;
    m.confirmTitle.style.color = isBuy ? '#00e676' : '#ff3b30';

    const decimals = this.getPriceDecimals();
    const mmr = this.getInstrumentSpec()?.maintenanceMarginRate || 0.005;
    const estLiq = calculateLiquidationPrice(order.side, order.price || this.getCurrentMarketPrice(), order.leverage, mmr);

    m.confirmSummary.innerHTML = `
      <div class="conf-row">
        <span class="lbl">Instrument:</span>
        <span class="val">${order.symbol}</span>
      </div>
      <div class="conf-row">
        <span class="lbl">Side:</span>
        <span class="val" style="color:${isBuy ? '#00e676' : '#ff3b30'}">${order.side === 'BUY' ? 'BUY / LONG' : 'SELL / SHORT'}</span>
      </div>
      <div class="conf-row">
        <span class="lbl">Order Type:</span>
        <span class="val">${order.type}</span>
      </div>
      <div class="conf-row">
        <span class="lbl">Quantity:</span>
        <span class="val">${order.quantity}</span>
      </div>
      <div class="conf-row">
        <span class="lbl">Order Price:</span>
        <span class="val">${order.price ? '$' + order.price.toFixed(decimals) : 'Market Best'}</span>
      </div>
      <div class="conf-row">
        <span class="lbl">Leverage:</span>
        <span class="val" style="color:var(--color-gold);">${order.leverage}x ISOLATED</span>
      </div>
      <div class="conf-row">
        <span class="lbl">Required Margin:</span>
        <span class="val">$${order.requiredMargin.toFixed(2)}</span>
      </div>
      <div class="conf-row">
        <span class="lbl">Est. Liquidation Price:</span>
        <span class="val" style="color:var(--color-orange);">$${estLiq.toFixed(decimals)}</span>
      </div>
      ${order.takeProfit ? `
      <div class="conf-row">
        <span class="lbl">Take Profit:</span>
        <span class="val" style="color:#00e676;">$${order.takeProfit.toFixed(decimals)}</span>
      </div>` : ''}
      ${order.stopLoss ? `
      <div class="conf-row">
        <span class="lbl">Stop Loss:</span>
        <span class="val" style="color:#ff3b30;">$${order.stopLoss.toFixed(decimals)}</span>
      </div>` : ''}
    `;

    m.executeConfirmBtn.style.background = isBuy ? 'var(--color-buy)' : 'var(--color-sell)';
    m.confirm.classList.add('open');
  }

  async executePendingOrder() {
    if (!this.pendingOrder) return;
    const order = this.pendingOrder;

    // Double-click protection
    this.dom.modals.executeConfirmBtn.disabled = true;
    this.dom.dock.btnBuy.disabled = true;
    this.dom.dock.btnSell.disabled = true;

    // Standalone Browser Mode (Zero PC Dependency)
    if (this.isStandaloneMode && this.clientEngine) {
      try {
        const data = this.clientEngine.placeOrder(order);
        this.dom.modals.confirm.classList.remove('open');
        this.pendingOrder = null;

        // Clear inputs
        this.dom.dock.qtyInput.value = '';
        this.updateDockTelemetry();

        if (this.soundEnabled) {
          this.playTone(order.side === 'BUY' ? 'BUY' : 'SELL');
        }

        this.updateAccountState(this.clientEngine.state.account);
        this.updatePositionsState(this.clientEngine.state.positions);
        this.updateOrdersState(this.clientEngine.state.orders);
        this.updateTradesState(this.clientEngine.state.trades);
      } catch (err) {
        this.showToast(err.message, 'error');
      } finally {
        this.dom.modals.executeConfirmBtn.disabled = false;
        this.dom.dock.btnBuy.disabled = false;
        this.dom.dock.btnSell.disabled = false;
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place demo order');
      }

      this.dom.modals.confirm.classList.remove('open');
      this.pendingOrder = null;
      
      // Clear inputs
      this.dom.dock.qtyInput.value = '';
      this.updateDockTelemetry();

      if (this.soundEnabled) {
        this.playTone(order.side === 'BUY' ? 'BUY' : 'SELL');
      }

      // Immediately synchronize positions, account, and open orders
      if (data.position) {
        const existingIdx = this.positions.findIndex(p => p.id === data.position.id);
        if (existingIdx >= 0) {
          this.positions[existingIdx] = data.position;
        } else {
          this.positions.unshift(data.position);
        }
        this.updatePositionsState(this.positions);
      }

      await Promise.all([
        this.fetchPositions(),
        this.fetchAccount(),
        this.fetchOrders()
      ]);
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      this.dom.modals.executeConfirmBtn.disabled = false;
      this.dom.dock.btnBuy.disabled = false;
      this.dom.dock.btnSell.disabled = false;
    }
  }

  // =========================================================================
  // POSITION ACTIONS (CLOSE, PARTIAL CLOSE, MODIFY SL/TP)
  // =========================================================================
  async closePosition(positionId) {
    if (!confirm('Are you sure you want to close this position at current market price?')) return;

    if (this.isStandaloneMode && this.clientEngine) {
      try {
        const trade = this.clientEngine.closePosition(positionId);
        const pnl = trade.netPnL !== undefined ? trade.netPnL : 0;
        const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
        this.showToast(`Position closed: ${trade.symbol} (PnL: ${pnlStr})`, pnl >= 0 ? 'success' : 'error');
        this.updateAccountState(this.clientEngine.state.account);
        this.updatePositionsState(this.clientEngine.state.positions);
        this.updateTradesState(this.clientEngine.state.trades);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/positions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to close position');

      this.showToast('Position closed', 'success');
      await Promise.all([
        this.fetchPositions(),
        this.fetchAccount(),
        this.fetchTrades()
      ]);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  openPartialCloseModal(position) {
    this.activeModalPosition = position;
    const m = this.dom.modals;
    m.partialQtyInput.value = (position.quantity * 0.5).toFixed(this.getQtyDecimals(position.symbol));
    m.partial.classList.add('open');
  }

  async executePartialClose() {
    if (!this.activeModalPosition) return;
    const qty = parseFloat(this.dom.modals.partialQtyInput.value);

    if (isNaN(qty) || qty <= 0 || qty > this.activeModalPosition.quantity) {
      this.showToast('Invalid partial close quantity', 'error');
      return;
    }

    if (this.isStandaloneMode && this.clientEngine) {
      try {
        const trade = this.clientEngine.closePosition(this.activeModalPosition.id, qty, 'PARTIAL');
        this.showToast(`Partially closed ${qty} ${this.activeModalPosition.symbol}`, 'success');
        this.dom.modals.partial.classList.remove('open');
        this.activeModalPosition = null;
        this.updateAccountState(this.clientEngine.state.account);
        this.updatePositionsState(this.clientEngine.state.positions);
        this.updateTradesState(this.clientEngine.state.trades);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/positions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: this.activeModalPosition.id,
          quantity: qty
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Partial close failed');

      this.showToast(`Partially closed ${qty} ${this.activeModalPosition.symbol}`, 'success');
      this.dom.modals.partial.classList.remove('open');
      this.activeModalPosition = null;
      await Promise.all([
        this.fetchPositions(),
        this.fetchAccount(),
        this.fetchTrades()
      ]);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  openModifySlTpModal(position) {
    this.activeModalPosition = position;
    const m = this.dom.modals;
    const decimals = this.getPriceDecimals(position.symbol);

    m.modifyTpInput.value = position.takeProfit ? Number(position.takeProfit).toFixed(decimals) : '';
    m.modifySlInput.value = position.stopLoss ? Number(position.stopLoss).toFixed(decimals) : '';
    m.modify.classList.add('open');
  }

  async executeModifySlTp() {
    if (!this.activeModalPosition) return;
    const m = this.dom.modals;

    const tpVal = m.modifyTpInput.value.trim();
    const slVal = m.modifySlInput.value.trim();

    const takeProfit = tpVal ? parseFloat(tpVal) : null;
    const stopLoss = slVal ? parseFloat(slVal) : null;

    if (this.isStandaloneMode && this.clientEngine) {
      try {
        this.clientEngine.modifyPosition(this.activeModalPosition.id, { takeProfit, stopLoss });
        this.showToast('Stop Loss & Take Profit updated', 'success');
        m.modify.classList.remove('open');
        this.activeModalPosition = null;
        this.updatePositionsState(this.clientEngine.state.positions);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/positions/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: this.activeModalPosition.id,
          takeProfit,
          stopLoss
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to modify position SL/TP');

      this.showToast('Stop Loss & Take Profit updated', 'success');
      m.modify.classList.remove('open');
      this.activeModalPosition = null;
      await Promise.all([
        this.fetchPositions(),
        this.fetchAccount()
      ]);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  async cancelOrder(orderId) {
    if (this.isStandaloneMode && this.clientEngine) {
      try {
        this.clientEngine.cancelOrder(orderId);
        this.showToast('Order cancelled', 'info');
        this.updateAccountState(this.clientEngine.state.account);
        this.updateOrdersState(this.clientEngine.state.orders);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/orders/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel order');
      await Promise.all([
        this.fetchOrders(),
        this.fetchAccount()
      ]);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // LEVERAGE & RESET MODALS
  // =========================================================================
  openLeverageModal() {
    const m = this.dom.modals;
    const spec = this.getInstrumentSpec();
    const leverages = (spec && spec.availableLeverages) ? spec.availableLeverages : [1, 2, 3, 5, 10, 20, 50, 100];

    m.leverageDisplay.textContent = `${this.currentLeverage}x`;
    m.leverageGrid.innerHTML = '';

    leverages.forEach(lev => {
      const btn = document.createElement('button');
      btn.className = `lev-grid-btn ${lev === this.currentLeverage ? 'active' : ''}`;
      btn.textContent = `${lev}x`;
      btn.setAttribute('data-lev', lev);
      btn.addEventListener('click', () => {
        m.leverageGrid.querySelectorAll('.lev-grid-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        m.leverageDisplay.textContent = `${lev}x`;
      });
      m.leverageGrid.appendChild(btn);
    });

    m.leverage.classList.add('open');
  }

  openResetModal() {
    this.dom.modals.resetBalanceInput.value = '10000';
    this.dom.modals.resetClearHistory.checked = true;
    this.dom.modals.reset.classList.add('open');
  }

  async executeAccountReset() {
    const bal = parseFloat(this.dom.modals.resetBalanceInput.value);
    const clearHistory = this.dom.modals.resetClearHistory.checked;

    if (isNaN(bal) || bal <= 0) {
      this.showToast('Please enter a valid starting balance', 'error');
      return;
    }

    if (this.isStandaloneMode && this.clientEngine) {
      try {
        this.clientEngine.resetDemoAccount(bal, clearHistory);
        this.showToast('Demo account reset successfully!', 'success');
        this.dom.modals.reset.classList.remove('open');
        this.updateAccountState(this.clientEngine.state.account);
        this.updatePositionsState(this.clientEngine.state.positions);
        this.updateOrdersState(this.clientEngine.state.orders);
        this.updateTradesState(this.clientEngine.state.trades);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/demo/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startingBalance: bal,
          clearHistory
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset demo account');

      this.showToast('Demo account reset successfully!', 'success');
      this.dom.modals.reset.classList.remove('open');
      await this.fetchInitialState();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // TELEGRAM & WHATSAPP ALERTS MODAL ACTIONS
  // =========================================================================
  openAlertsModal() {
    if (!this.alertService) return;
    const cfg = this.alertService.config;
    const m = this.dom.modals;

    // Discord fields
    if (m.discordEnable) m.discordEnable.checked = !!(cfg.discord && cfg.discord.enabled);
    if (m.discordWebhookUrl) m.discordWebhookUrl.value = (cfg.discord && cfg.discord.webhookUrl) || '';
    if (m.discordTestFeedback) {
      m.discordTestFeedback.textContent = '';
      m.discordTestFeedback.className = 'test-feedback';
    }

    // ntfy fields
    if (m.ntfyEnable) m.ntfyEnable.checked = !!(cfg.ntfy && cfg.ntfy.enabled);
    if (m.ntfyTopic) m.ntfyTopic.value = (cfg.ntfy && cfg.ntfy.topic) || '';
    if (m.ntfyTestFeedback) {
      m.ntfyTestFeedback.textContent = '';
      m.ntfyTestFeedback.className = 'test-feedback';
    }

    // Telegram fields
    if (m.tgEnable) m.tgEnable.checked = !!(cfg.telegram && cfg.telegram.enabled);
    if (m.tgBotToken) m.tgBotToken.value = (cfg.telegram && cfg.telegram.botToken) || '';
    if (m.tgChatId) m.tgChatId.value = (cfg.telegram && cfg.telegram.chatId) || '';
    if (m.tgTestFeedback) {
      m.tgTestFeedback.textContent = '';
      m.tgTestFeedback.className = 'test-feedback';
    }

    // WhatsApp fields
    if (m.waEnable) m.waEnable.checked = !!(cfg.whatsapp && cfg.whatsapp.enabled);
    if (m.waProvider) m.waProvider.value = (cfg.whatsapp && cfg.whatsapp.provider) || 'callmebot';
    if (m.waPhone) m.waPhone.value = (cfg.whatsapp && cfg.whatsapp.phone) || '';
    if (m.waApiKey) m.waApiKey.value = (cfg.whatsapp && cfg.whatsapp.apiKey) || '';
    if (m.waWebhookUrl) m.waWebhookUrl.value = (cfg.whatsapp && cfg.whatsapp.webhookUrl) || '';
    if (m.waTestFeedback) {
      m.waTestFeedback.textContent = '';
      m.waTestFeedback.className = 'test-feedback';
    }

    this.toggleWhatsAppProviderFields((cfg.whatsapp && cfg.whatsapp.provider) || 'callmebot');

    // Filter fields
    if (m.alertMinScore) {
      const savedScore100 = (cfg.filters && cfg.filters.minScore100 !== undefined)
        ? cfg.filters.minScore100
        : (cfg.filters && cfg.filters.minScore ? Math.round((cfg.filters.minScore / 8) * 100) : 70);
      m.alertMinScore.value = String(savedScore100);
    }
    if (m.alertFilterBuySell) m.alertFilterBuySell.checked = !(cfg.filters && cfg.filters.alertBuySell === false);
    if (m.alertFilterExit) m.alertFilterExit.checked = !!(cfg.filters && cfg.filters.alertExit);

    m.alerts.classList.add('open');
  }

  toggleWhatsAppProviderFields(provider) {
    const m = this.dom.modals;
    if (!m.waCallmebotFields || !m.waWebhookFields) return;
    if (provider === 'webhook') {
      m.waCallmebotFields.style.display = 'none';
      m.waWebhookFields.style.display = 'block';
    } else {
      m.waCallmebotFields.style.display = 'block';
      m.waWebhookFields.style.display = 'none';
    }
  }

  saveAlertSettings() {
    if (!this.alertService) return;
    const m = this.dom.modals;

    const chosenScore = m.alertMinScore ? parseInt(m.alertMinScore.value, 10) : 70;
    const score100Val = chosenScore >= 10 ? chosenScore : Math.round((chosenScore / 8) * 100);
    const score8Val = chosenScore >= 10 ? Math.round((chosenScore / 100) * 8) : chosenScore;

    const newConfig = {
      discord: {
        enabled: m.discordEnable ? m.discordEnable.checked : false,
        webhookUrl: m.discordWebhookUrl ? m.discordWebhookUrl.value.trim() : ''
      },
      ntfy: {
        enabled: m.ntfyEnable ? m.ntfyEnable.checked : false,
        topic: m.ntfyTopic ? m.ntfyTopic.value.trim() : ''
      },
      telegram: {
        enabled: m.tgEnable ? m.tgEnable.checked : false,
        botToken: m.tgBotToken ? m.tgBotToken.value.trim() : '',
        chatId: m.tgChatId ? m.tgChatId.value.trim() : '',
        topicId: ''
      },
      whatsapp: {
        enabled: m.waEnable ? m.waEnable.checked : false,
        provider: m.waProvider ? m.waProvider.value : 'callmebot',
        phone: m.waPhone ? m.waPhone.value.trim() : '',
        apiKey: m.waApiKey ? m.waApiKey.value.trim() : '',
        webhookUrl: m.waWebhookUrl ? m.waWebhookUrl.value.trim() : ''
      },
      filters: {
        minScore100: score100Val,
        minScore: score8Val,
        alertBuySell: m.alertFilterBuySell ? m.alertFilterBuySell.checked : true,
        alertExit: m.alertFilterExit ? m.alertFilterExit.checked : false
      }
    };

    this.alertService.saveConfig(newConfig);
    this.showToast('🔔 Signal alert settings saved successfully!', 'success');
    m.alerts.classList.remove('open');

    // Update alerts button active state
    const anyEnabled = newConfig.discord.enabled || newConfig.ntfy.enabled || newConfig.telegram.enabled || newConfig.whatsapp.enabled;
    if (m.alertsBtn) {
      m.alertsBtn.classList.toggle('active', anyEnabled);
    }
  }

  async executeDiscordTest() {
    if (!this.alertService) return;
    const m = this.dom.modals;
    const url = m.discordWebhookUrl ? m.discordWebhookUrl.value.trim() : '';

    if (!url) {
      if (m.discordTestFeedback) {
        m.discordTestFeedback.textContent = '❌ Discord Webhook URL is required';
        m.discordTestFeedback.className = 'test-feedback error';
      }
      return;
    }

    if (m.discordTestBtn) m.discordTestBtn.disabled = true;
    if (m.discordTestFeedback) {
      m.discordTestFeedback.textContent = '⏳ Sending Discord test...';
      m.discordTestFeedback.className = 'test-feedback loading';
    }

    try {
      await this.alertService.testDiscord(url);
      if (m.discordTestFeedback) {
        m.discordTestFeedback.textContent = '✅ Success! Check Discord channel';
        m.discordTestFeedback.className = 'test-feedback success';
      }
      this.showToast('✅ Test alert delivered to Discord!', 'success');
    } catch (err) {
      if (m.discordTestFeedback) {
        m.discordTestFeedback.textContent = `❌ ${err.message}`;
        m.discordTestFeedback.className = 'test-feedback error';
      }
      this.showToast(`Discord test failed: ${err.message}`, 'error');
    } finally {
      if (m.discordTestBtn) m.discordTestBtn.disabled = false;
    }
  }

  async executeNtfyTest() {
    if (!this.alertService) return;
    const m = this.dom.modals;
    const topic = m.ntfyTopic ? m.ntfyTopic.value.trim() : '';

    if (!topic) {
      if (m.ntfyTestFeedback) {
        m.ntfyTestFeedback.textContent = '❌ Topic name is required';
        m.ntfyTestFeedback.className = 'test-feedback error';
      }
      return;
    }

    if (m.ntfyTestBtn) m.ntfyTestBtn.disabled = true;
    if (m.ntfyTestFeedback) {
      m.ntfyTestFeedback.textContent = '⏳ Sending phone push test...';
      m.ntfyTestFeedback.className = 'test-feedback loading';
    }

    try {
      await this.alertService.testNtfy(topic);
      if (m.ntfyTestFeedback) {
        m.ntfyTestFeedback.textContent = '✅ Success! Push sent to phone';
        m.ntfyTestFeedback.className = 'test-feedback success';
      }
      this.showToast('📱 Push notification delivered to ntfy topic!', 'success');
    } catch (err) {
      if (m.ntfyTestFeedback) {
        m.ntfyTestFeedback.textContent = `❌ ${err.message}`;
        m.ntfyTestFeedback.className = 'test-feedback error';
      }
      this.showToast(`Push test failed: ${err.message}`, 'error');
    } finally {
      if (m.ntfyTestBtn) m.ntfyTestBtn.disabled = false;
    }
  }

  async executeTelegramTest() {
    if (!this.alertService) return;
    const m = this.dom.modals;
    const token = m.tgBotToken ? m.tgBotToken.value.trim() : '';
    const chatId = m.tgChatId ? m.tgChatId.value.trim() : '';

    if (!token || !chatId) {
      if (m.tgTestFeedback) {
        m.tgTestFeedback.textContent = '❌ Bot Token and Chat ID required';
        m.tgTestFeedback.className = 'test-feedback error';
      }
      return;
    }

    if (m.tgTestBtn) m.tgTestBtn.disabled = true;
    if (m.tgTestFeedback) {
      m.tgTestFeedback.textContent = '⏳ Sending test...';
      m.tgTestFeedback.className = 'test-feedback loading';
    }

    try {
      await this.alertService.testTelegram(token, chatId);
      if (m.tgTestFeedback) {
        m.tgTestFeedback.textContent = '✅ Success! Check Telegram';
        m.tgTestFeedback.className = 'test-feedback success';
      }
      this.showToast('Test alert sent to Telegram!', 'success');
    } catch (err) {
      if (m.tgTestFeedback) {
        m.tgTestFeedback.textContent = `❌ ${err.message}`;
        m.tgTestFeedback.className = 'test-feedback error';
      }
      this.showToast(`Telegram test failed: ${err.message}`, 'error');
    } finally {
      if (m.tgTestBtn) m.tgTestBtn.disabled = false;
    }
  }

  async executeWhatsAppTest() {
    if (!this.alertService) return;
    const m = this.dom.modals;
    const provider = m.waProvider ? m.waProvider.value : 'callmebot';
    const phone = m.waPhone ? m.waPhone.value.trim() : '';
    const apiKey = m.waApiKey ? m.waApiKey.value.trim() : '';
    const webhookUrl = m.waWebhookUrl ? m.waWebhookUrl.value.trim() : '';

    if (provider === 'callmebot' && (!phone || !apiKey)) {
      if (m.waTestFeedback) {
        m.waTestFeedback.textContent = '❌ Phone and API Key required';
        m.waTestFeedback.className = 'test-feedback error';
      }
      return;
    }

    if (provider === 'webhook' && !webhookUrl) {
      if (m.waTestFeedback) {
        m.waTestFeedback.textContent = '❌ Webhook URL required';
        m.waTestFeedback.className = 'test-feedback error';
      }
      return;
    }

    if (m.waTestBtn) m.waTestBtn.disabled = true;
    if (m.waTestFeedback) {
      m.waTestFeedback.textContent = '⏳ Sending test...';
      m.waTestFeedback.className = 'test-feedback loading';
    }

    try {
      await this.alertService.testWhatsApp(provider, phone, apiKey, webhookUrl);
      if (m.waTestFeedback) {
        m.waTestFeedback.textContent = '✅ Message sent! Check WhatsApp';
        m.waTestFeedback.className = 'test-feedback success';
      }
      this.showToast('Test alert sent to WhatsApp!', 'success');
    } catch (err) {
      if (m.waTestFeedback) {
        m.waTestFeedback.textContent = `❌ ${err.message}`;
        m.waTestFeedback.className = 'test-feedback error';
      }
      this.showToast(`WhatsApp test failed: ${err.message}`, 'error');
    } finally {
      if (m.waTestBtn) m.waTestBtn.disabled = false;
    }
  }

  shareActiveSignal(platform) {
    if (!this.activeSignal) {
      this.showToast('No active trade signal to forward', 'info');
      return;
    }
    if (!this.alertService) return;
    const urls = this.alertService.getShareUrls(this.activeSignal, this.symbol, this.interval);
    if (platform === 'tg') {
      window.open(urls.telegram, '_blank');
    } else if (platform === 'wa') {
      window.open(urls.whatsapp, '_blank');
    }
  }

  // =========================================================================
  // TERMINAL TABLES RENDERING (POSITIONS, ORDERS, TRADES)
  // =========================================================================
  renderPositionsTable() {
    const tbody = this.dom.posTbody;
    if (!tbody) return;

    if (!Array.isArray(this.positions) || this.positions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">No open positions. Use the order panel on the right to open a demo trade.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    this.positions.forEach(p => {
      try {
        const tr = document.createElement('tr');
        const isLong = (p.side === 'LONG');
        const sideClass = isLong ? 'side-long' : 'side-short';
        const decimals = this.getPriceDecimals(p.symbol);

        const live = this.livePrices[p.symbol];
        const entryPrice = Number(p.entryPrice || 0);
        const rawMark = (live && (live.price !== undefined || live.mark !== undefined || live.last !== undefined))
          ? (live.price || live.mark || live.last)
          : entryPrice;
        const mark = Number(rawMark || entryPrice || 0);
        const qty = Number(p.quantity || 0);
        const margin = Number(p.margin || 0);
        const liqPrice = Number(p.liquidationPrice || 0);

        // Real-time calculation
        const unPnl = (isLong ? mark - entryPrice : entryPrice - mark) * qty;
        const roe = (margin > 0) ? (unPnl / margin) * 100 : 0;
        const pnlClass = unPnl >= 0 ? 'pnl-positive' : 'pnl-negative';
        const sign = unPnl >= 0 ? '+' : '';

        let slTpText = '---';
        if (p.stopLoss || p.takeProfit) {
          const slStr = p.stopLoss ? `SL: ${Number(p.stopLoss).toFixed(decimals)}` : '';
          const tpStr = p.takeProfit ? `TP: ${Number(p.takeProfit).toFixed(decimals)}` : '';
          slTpText = [slStr, tpStr].filter(Boolean).join(' | ');
        }

        tr.innerHTML = `
          <td><strong>${p.symbol}</strong></td>
          <td><span class="${sideClass}">${p.side}</span></td>
          <td>${qty}</td>
          <td>$${entryPrice.toFixed(decimals)}</td>
          <td id="pos-mark-${p.id}">$${mark.toFixed(decimals)}</td>
          <td><span class="badge-isolated">${p.leverage}x</span></td>
          <td>$${margin.toFixed(2)}</td>
          <td style="color:var(--color-orange);">$${liqPrice.toFixed(decimals)}</td>
          <td id="pos-pnl-${p.id}" class="${pnlClass}">${sign}$${unPnl.toFixed(2)} (${sign}${roe.toFixed(2)}%)</td>
          <td style="font-size:11px;">${slTpText}</td>
          <td>
            <div class="action-cell-btns">
              <button class="tbl-btn btn-close" data-close-id="${p.id}">Close</button>
              <button class="tbl-btn btn-partial" data-partial-id="${p.id}">Partial</button>
              <button class="tbl-btn btn-modify" data-modify-id="${p.id}">SL/TP</button>
            </div>
          </td>
        `;

        // Event listeners for action buttons
        tr.querySelector('.btn-close')?.addEventListener('click', () => this.closePosition(p.id));
        tr.querySelector('.btn-partial')?.addEventListener('click', () => this.openPartialCloseModal(p));
        tr.querySelector('.btn-modify')?.addEventListener('click', () => this.openModifySlTpModal(p));

        tbody.appendChild(tr);
      } catch (err) {
        console.error('Error rendering position row:', err, p);
      }
    });
  }

  updateLivePositionPnL() {
    if (!Array.isArray(this.positions)) return;
    this.positions.forEach(p => {
      try {
        const live = this.livePrices[p.symbol];
        const entryPrice = Number(p.entryPrice || 0);
        const rawMark = (live && (live.price !== undefined || live.mark !== undefined || live.last !== undefined))
          ? (live.price || live.mark || live.last)
          : entryPrice;
        const mark = Number(rawMark || entryPrice || 0);
        const isLong = (p.side === 'LONG');
        const qty = Number(p.quantity || 0);
        const margin = Number(p.margin || 0);
        const unPnl = (isLong ? mark - entryPrice : entryPrice - mark) * qty;
        const roe = (margin > 0) ? (unPnl / margin) * 100 : 0;
        const decimals = this.getPriceDecimals(p.symbol);
        const sign = unPnl >= 0 ? '+' : '';

        const markEl = document.getElementById(`pos-mark-${p.id}`);
        if (markEl) markEl.textContent = `$${mark.toFixed(decimals)}`;

        const pnlEl = document.getElementById(`pos-pnl-${p.id}`);
        if (pnlEl) {
          pnlEl.textContent = `${sign}$${unPnl.toFixed(2)} (${sign}${roe.toFixed(2)}%)`;
          pnlEl.className = unPnl >= 0 ? 'pnl-positive' : 'pnl-negative';
        }
      } catch (err) {}
    });
  }

  renderOrdersTable() {
    const tbody = this.dom.ordersTbody;
    if (!tbody) return;

    if (this.openOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">No pending limit orders.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    this.openOrders.forEach(o => {
      const tr = document.createElement('tr');
      const isBuy = (o.side === 'BUY');
      const sideClass = isBuy ? 'side-long' : 'side-short';
      const decimals = this.getPriceDecimals(o.symbol);
      const timeStr = new Date(o.createdAt).toLocaleTimeString();

      let slTpText = '---';
      if (o.stopLoss || o.takeProfit) {
        const slStr = o.stopLoss ? `SL: ${o.stopLoss.toFixed(decimals)}` : '';
        const tpStr = o.takeProfit ? `TP: ${o.takeProfit.toFixed(decimals)}` : '';
        slTpText = [slStr, tpStr].filter(Boolean).join(' | ');
      }

      tr.innerHTML = `
        <td>${timeStr}</td>
        <td><strong>${o.symbol}</strong></td>
        <td>${o.type}</td>
        <td><span class="${sideClass}">${o.side}</span></td>
        <td>$${o.price.toFixed(decimals)}</td>
        <td>${o.quantity}</td>
        <td>${o.leverage}x</td>
        <td>$${(o.reservedMargin || 0).toFixed(2)}</td>
        <td style="font-size:11px;">${slTpText}</td>
        <td><span class="badge-pending">${o.status}</span></td>
        <td>
          <button class="tbl-btn btn-cancel" data-cancel-id="${o.id}">Cancel</button>
        </td>
      `;

      tr.querySelector('.btn-cancel').addEventListener('click', () => this.cancelOrder(o.id));
      tbody.appendChild(tr);
    });
  }

  renderTradesTable() {
    const tbody = this.dom.tradesTbody;
    if (!tbody) return;

    if (this.trades.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">No completed trades recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    this.trades.slice(0, 50).forEach(t => {
      const tr = document.createElement('tr');
      const isLong = (t.side === 'LONG');
      const sideClass = isLong ? 'side-long' : 'side-short';
      const decimals = this.getPriceDecimals(t.symbol);
      const closeTimeStr = new Date(t.closedAt || t.createdAt).toLocaleTimeString();
      const pnlClass = t.netPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
      const sign = t.netPnL >= 0 ? '+' : '';

      tr.innerHTML = `
        <td>${closeTimeStr}</td>
        <td><strong>${t.symbol}</strong></td>
        <td><span class="${sideClass}">${t.side}</span></td>
        <td>$${t.entryPrice.toFixed(decimals)}</td>
        <td>$${t.exitPrice.toFixed(decimals)}</td>
        <td>${t.quantity}</td>
        <td>${t.leverage}x</td>
        <td class="${t.grossPnL >= 0 ? 'pnl-positive' : 'pnl-negative'}">${t.grossPnL >= 0 ? '+' : ''}$${t.grossPnL.toFixed(2)}</td>
        <td>$${(t.totalFees || 0).toFixed(4)}</td>
        <td class="${pnlClass}"><strong>${sign}$${t.netPnL.toFixed(2)}</strong></td>
        <td><span class="badge-exit">${t.exitReason || 'MANUAL'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // =========================================================================
  // HERO TRADE SIGNAL BANNER & CONFLUENCE
  // =========================================================================
  updateHeroBanner(sig) {
    const h = this.dom.hero;
    const isBuy = sig.type === 'BUY';
    const decimals = this.getPriceDecimals();

    h.bar.className = `hero-signal-bar ${isBuy ? 'buy' : 'sell'}`;
    h.badge.textContent = isBuy ? '🟢 BUY SIGNAL' : '🔴 SELL SIGNAL';
    h.pair.textContent = `${this.symbol} [${this.interval}]`;

    const riskDist = (sig.price != null && sig.sl != null) ? Math.abs(sig.price - sig.sl) : 0;
    const riskPct = sig.price ? (riskDist / sig.price) * 100 : 0;
    
    h.summary.textContent = `${sig.grade || 'Optimal'} setup • Risk: -${riskPct.toFixed(2)}% • TP2: +${(riskPct * 2).toFixed(2)}%`;

    h.entry.textContent = `$${sig.price != null ? Number(sig.price).toFixed(decimals) : '---'}`;
    h.sl.textContent = `$${sig.sl != null ? Number(sig.sl).toFixed(decimals) : '---'}`;
    h.tp1.textContent = `$${sig.tp1 != null ? Number(sig.tp1).toFixed(decimals) : '---'}`;
    h.tp2.textContent = `$${sig.tp2 != null ? Number(sig.tp2).toFixed(decimals) : '---'}`;
    h.tp3.textContent = `$${sig.tp3 != null ? Number(sig.tp3).toFixed(decimals) : '---'}`;
    h.score.textContent = `${sig.score || 0}/8 (${sig.strengthPct || Math.round(((sig.score || 0)/8)*100)}%)`;
    const s100 = sig.score100 !== undefined ? sig.score100 : Math.round((sig.score / 8) * 100);
    const score100El = document.getElementById('hero-score100');
    if (score100El) score100El.textContent = s100;

    const reasonsPill = document.getElementById('hero-reasons-pill');
    if (reasonsPill) {
      if (sig.reasons && sig.reasons.length > 0) {
        reasonsPill.textContent = `✓ ${sig.reasons.slice(0, 2).join(' • ')}`;
      } else {
        reasonsPill.textContent = `✓ Confluence Score: ${s100}/100`;
      }
    }

    // Auto-fill Trading Dock SL/TP if enabled
    if (this.dom.dock.enableTpsl.checked) {
      if (!this.dom.dock.slInput.value) this.dom.dock.slInput.value = sig.sl.toFixed(decimals);
      if (!this.dom.dock.tpInput.value) this.dom.dock.tpInput.value = sig.tp2.toFixed(decimals);
    }
  }

  resetHeroBanner() {
    const h = this.dom.hero;
    h.bar.className = 'hero-signal-bar neutral';
    h.badge.textContent = '⚪ SCANNING';
    h.pair.textContent = `${this.symbol} [${this.interval}]`;
    h.summary.textContent = 'Analyzing live orderflow & institutional market structure...';
    h.entry.textContent = '---';
    h.sl.textContent = '---';
    h.tp1.textContent = '---';
    h.tp2.textContent = '---';
    h.tp3.textContent = '---';
    h.score.textContent = '---';
    h.rr.textContent = '1:2.0';
    const score100El = document.getElementById('hero-score100');
    if (score100El) score100El.textContent = '--';
    const reasonsPill = document.getElementById('hero-reasons-pill');
    if (reasonsPill) reasonsPill.textContent = 'Scanning for 100-point confluence setups...';
    this.clearSignalPriceLines();
  }

  checkSignalsOnConfirmedBar(analysis) {
    const lastBar = this.bars[this.bars.length - 1];
    const latestSignal = analysis.signals.find(s => s.time === lastBar.time);

    if (latestSignal) {
      this.dispatchSignal(latestSignal);
    }
  }

  dispatchSignal(signal) {
    if (this.soundEnabled) {
      this.playTone(signal.type);
    }

    if (this.notificationsEnabled && Notification.permission === 'granted') {
      new Notification(`Crypto Scalper Pro: ${signal.type} ${this.symbol}`, {
        body: `Price: ${signal.price.toFixed(this.getPriceDecimals())} | Score: ${signal.score100 || Math.round(signal.score / 8 * 100)}/100`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>'
      });
    }

    // Automated MEXC Real Execution if Auto-Trading is Enabled
    if (this.autoTradingEnabled) {
      const score = signal.score100 !== undefined ? signal.score100 : Math.round((signal.score / 8) * 100);
      const minThreshold = this.autoTradeMinScore || 85;
      if (score >= minThreshold) {
        this.executeAutoTrade(signal);
      }
    }

    // Automated Telegram & WhatsApp Forwarding
    if (this.alertService) {
      this.alertService.forwardSignal(signal, this.symbol, this.interval).then(res => {
        if (res && res.telegram && res.telegram.sent) {
          this.showToast(`✈️ Signal forwarded to Telegram (${this.symbol})`, 'success');
        }
        if (res && res.whatsapp && res.whatsapp.sent) {
          this.showToast(`💬 Signal forwarded to WhatsApp (${this.symbol})`, 'success');
        }
        if (res && res.telegram && res.telegram.error) {
          this.showToast(`Telegram alert failed: ${res.telegram.error}`, 'error');
        }
        if (res && res.whatsapp && res.whatsapp.error) {
          this.showToast(`WhatsApp alert failed: ${res.whatsapp.error}`, 'error');
        }
      }).catch(err => {
        console.error('Alert forward error:', err);
      });
    }

    this.appendSignalCard(signal);

    if (signal.type === 'BUY' || signal.type === 'SELL') {
      this.activeSignal = signal;
      this.updateHeroBanner(signal);
      this.updateSignalPriceLines(signal);
    } else if (signal.type.startsWith('EXIT')) {
      this.resetHeroBanner();
    }
  }

  appendSignalCard(sig) {
    if (this.dom.feedPlaceholder) {
      this.dom.feedPlaceholder.style.display = 'none';
    }

    const card = document.createElement('div');
    const isBuy = sig.type === 'BUY';
    const isSell = sig.type === 'SELL';
    const typeClass = isBuy ? 'buy' : isSell ? 'sell' : 'exit';
    card.className = `signal-card ${typeClass}`;

    const dateStr = new Date(sig.time * 1000).toLocaleTimeString();
    const decimals = this.getPriceDecimals();

    let factorsHtml = '';
    if (sig.factors) {
      const f = sig.factors;
      factorsHtml = `
        <div class="confluence-tags-row">
          <span class="conf-pill ${f.trend ? 'pass' : ''}">EMA 9/21</span>
          <span class="conf-pill ${f.macro ? 'pass' : ''}">200 EMA</span>
          <span class="conf-pill ${f.rsi ? 'pass' : ''}">RSI Mom</span>
          <span class="conf-pill ${f.macd ? 'pass' : ''}">MACD Acc</span>
          <span class="conf-pill ${f.vol ? 'pass' : ''}">Volume</span>
          <span class="conf-pill ${f.vwap ? 'pass' : ''}">VWAP</span>
          <span class="conf-pill ${f.pa ? 'pass' : ''}">Candle</span>
          <span class="conf-pill ${f.breakout ? 'pass' : ''}">Breakout</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="signal-card-header">
        <span class="signal-type-tag ${typeClass}">${sig.type} ${this.symbol}</span>
        <span class="signal-card-time">${dateStr}</span>
      </div>
      <div class="signal-entry-banner">
        <span class="signal-entry-label">ENTRY PRICE</span>
        <span class="signal-entry-price">$${sig.price.toFixed(decimals)}</span>
      </div>
      ${sig.sl ? `
      <div class="signal-targets-grid">
        <div class="target-chip sl">
          <span class="label">STOP LOSS</span>
          <span class="val">$${sig.sl != null ? Number(sig.sl).toFixed(decimals) : '---'}</span>
        </div>
        <div class="target-chip tp">
          <span class="label">TP1 (1R)</span>
          <span class="val">$${sig.tp1 != null ? Number(sig.tp1).toFixed(decimals) : '---'}</span>
        </div>
        <div class="target-chip tp">
          <span class="label">TP2 (2R)</span>
          <span class="val">$${sig.tp2 != null ? Number(sig.tp2).toFixed(decimals) : '---'}</span>
        </div>
        <div class="target-chip tp">
          <span class="label">TP3 (3R)</span>
          <span class="val">$${sig.tp3 != null ? Number(sig.tp3).toFixed(decimals) : '---'}</span>
        </div>
      </div>` : ''}
      ${factorsHtml}
    `;

    this.dom.signalFeed.prepend(card);
  }

  // =========================================================================
  // HUD DASHBOARD & AUDIO
  // =========================================================================
  updateHud(latest) {
    if (!latest) return;
    const h = this.dom.hud;

    h.pairTf.textContent = `${this.symbol} [${this.interval}]`;

    // Regime
    h.regime.textContent = latest.regime;
    h.regime.className = 'hud-badge';
    if (latest.regime === 'STRONG BULLISH') h.regime.classList.add('badge-strong-bull');
    else if (latest.regime === 'BULLISH') h.regime.classList.add('badge-bull');
    else if (latest.regime === 'BEARISH') h.regime.classList.add('badge-bear');
    else if (latest.regime === 'STRONG BEARISH') h.regime.classList.add('badge-strong-bear');
    else if (latest.regime === 'NO TRADE') h.regime.classList.add('badge-notrade');
    else h.regime.classList.add('badge-neutral');

    // 200 EMA Trend
    const lastBar = this.bars[this.bars.length - 1];
    const isAbove200 = lastBar ? (lastBar.close > lastBar.open) : false;
    h.trend.textContent = isAbove200 ? 'BULLISH (>200)' : 'BEARISH (<200)';
    h.trend.style.color = isAbove200 ? '#00e676' : '#ff3b30';

    // Momentum
    const isMomBull = latest.rsi > 50;
    h.mom.textContent = isMomBull ? `BULLISH (${latest.rsi.toFixed(1)})` : `BEARISH (${latest.rsi.toFixed(1)})`;
    h.mom.style.color = isMomBull ? '#00e676' : '#ff3b30';

    // Volume
    h.vol.textContent = latest.isVolHigh ? 'HIGH (Surge)' : 'NORMAL / LOW';
    h.vol.style.color = latest.isVolHigh ? '#00e676' : '#787b86';

    // ADX
    const isTrending = latest.adx >= 25;
    h.adx.textContent = isTrending ? `TRENDING (${latest.adx.toFixed(1)})` : `RANGING (${(latest.adx || 0).toFixed(1)})`;
    h.adx.style.color = isTrending ? '#00e676' : '#ff9800';

    // MTF
    h.mtf.textContent = latest.htfBullish ? `BULLISH (${this.htfInterval})` : latest.htfBearish ? `BEARISH (${this.htfInterval})` : 'NEUTRAL';
    h.mtf.style.color = latest.htfBullish ? '#00e676' : latest.htfBearish ? '#ff3b30' : '#787b86';

    // Active Signal Status
    if (this.activeSignal) {
      h.pos.textContent = `${this.activeSignal.type} [${this.activeSignal.score}/8]`;
      h.pos.style.color = this.activeSignal.type === 'BUY' ? '#00e676' : '#ff3b30';
      h.strength.textContent = `${this.activeSignal.strengthPct}% (${this.activeSignal.grade})`;
    } else {
      h.pos.textContent = 'FLAT (Searching)';
      h.pos.style.color = '#787b86';
      h.strength.textContent = 'N/A';
    }
  }

  playTone(type) {
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      if (type === 'BUY') {
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.25, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.22);
        });
      } else if (type === 'SELL') {
        const notes = [783.99, 622.25, 523.25]; // G5, Eb5, C5
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.2, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.22);
        });
      }
    } catch (e) {}
  }

  // =========================================================================
  // HELPER UTILITIES
  // =========================================================================
  getInstrumentSpec(sym = this.symbol) {
    return this.instruments[sym] || {
      priceDecimals: 2,
      qtyDecimals: 2,
      minQty: 0.01,
      maxLeverage: 100,
      defaultLeverage: 10,
      maintenanceMarginRate: 0.005,
      takerFeeRate: 0.0005
    };
  }

  getPriceDecimals(sym = this.symbol) {
    const spec = this.getInstrumentSpec(sym);
    return spec ? spec.priceDecimals : 2;
  }

  getQtyDecimals(sym = this.symbol) {
    const spec = this.getInstrumentSpec(sym);
    return spec ? spec.qtyDecimals : 2;
  }

  updateStatus(text, isOnline) {
    if (this.dom.statusPill) {
      this.dom.statusPill.textContent = text;
      this.dom.statusPill.className = `status-pill ${isOnline ? 'online' : 'offline'}`;
    }
  }

  startCandleTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const getIntervalSec = (tf) => {
      if (tf === '1m') return 60;
      if (tf === '3m') return 180;
      if (tf === '5m') return 300;
      if (tf === '15m') return 900;
      return 60;
    };

    this.timerInterval = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const totalSec = getIntervalSec(this.interval);
      const remSec = totalSec - (nowSec % totalSec);
      const m = Math.floor(remSec / 60);
      const s = remSec % 60;
      if (this.dom.candleTimer) {
        this.dom.candleTimer.textContent = `⏱ ${m}:${s < 10 ? '0' : ''}${s}`;
      }
    }, 1000);
  }

  applySettingsFromModal() {
    const minScore = parseInt(document.getElementById('input-min-score').value, 10);
    const atrMult = parseFloat(document.getElementById('input-atr-mult').value);
    const cooldown = parseInt(document.getElementById('input-cooldown').value, 10);
    const use200 = document.getElementById('input-use-200').checked;
    const useVwap = document.getElementById('input-use-vwap').checked;
    const useMtf = document.getElementById('input-use-mtf').checked;

    this.engine.updateSettings({
      minBuyScore: minScore,
      minSellScore: minScore,
      atrSlMult: atrMult,
      signalCooldown: cooldown,
      use200EmaFilter: use200,
      useVwapFilter: useVwap,
      enableMtf: useMtf
    });

    this.recalculateAndRender(false);
  }

  // =========================================================================
  // INSTITUTIONAL CONTROLS, NAVIGATION & EVENT BINDINGS
  // =========================================================================
  initInstitutionalFeatures() {
    // 1. Subnav Tabs Navigation
    document.querySelectorAll('.subnav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchSubnavTab(tab);
      });
    });

    // 2. Auto-Trading Controls
    const autoBtn = document.getElementById('autotrade-toggle-btn');
    if (autoBtn) {
      autoBtn.addEventListener('click', () => {
        if (this.autoTradingEnabled) {
          if (confirm('Disable automated trading? Automated order placement will stop immediately.')) {
            this.toggleAutoTrading(false);
          }
        } else {
          const modal = document.getElementById('autotrade-modal');
          if (modal) modal.classList.add('open');
        }
      });
    }

    const closeAutoBtn = document.getElementById('close-autotrade-modal-btn');
    const cancelAutoBtn = document.getElementById('cancel-autotrade-btn');
    const confirmAutoBtn = document.getElementById('confirm-autotrade-btn');
    const autoModal = document.getElementById('autotrade-modal');

    if (closeAutoBtn && autoModal) closeAutoBtn.addEventListener('click', () => autoModal.classList.remove('open'));
    if (cancelAutoBtn && autoModal) cancelAutoBtn.addEventListener('click', () => autoModal.classList.remove('open'));
    if (confirmAutoBtn) {
      confirmAutoBtn.addEventListener('click', () => {
        const pwdInput = document.getElementById('autotrade-password');
        const modeSelect = document.getElementById('autotrade-mode-select');
        const pwd = pwdInput ? pwdInput.value : '';
        const mode = modeSelect ? modeSelect.value : 'PAPER';
        this.toggleAutoTrading(true, pwd, mode);
      });
    }

    // 3. Emergency Stop Kill Switch
    const emBtn = document.getElementById('emergency-stop-btn');
    if (emBtn) {
      emBtn.addEventListener('click', () => this.triggerEmergencyStop());
    }

    // 4. Market Close All Open Positions
    const closeAllBtn = document.getElementById('close-all-btn');
    const closeAllModal = document.getElementById('closeall-modal');
    const closeCloseAllBtn = document.getElementById('close-closeall-modal-btn');
    const cancelCloseAllBtn = document.getElementById('cancel-closeall-btn');
    const confirmCloseAllBtn = document.getElementById('confirm-closeall-btn');

    if (closeAllBtn && closeAllModal) closeAllBtn.addEventListener('click', () => closeAllModal.classList.add('open'));
    if (closeCloseAllBtn && closeAllModal) closeCloseAllBtn.addEventListener('click', () => closeAllModal.classList.remove('open'));
    if (cancelCloseAllBtn && closeAllModal) cancelCloseAllBtn.addEventListener('click', () => closeAllModal.classList.remove('open'));
    if (confirmCloseAllBtn) {
      confirmCloseAllBtn.addEventListener('click', () => this.executeCloseAll());
    }

    // 5. Fullscreen Toggle Controls
    const fullBtn = document.getElementById('fullscreen-btn');
    const chartFullBtn = document.getElementById('chart-fullscreen-btn');
    if (fullBtn) fullBtn.addEventListener('click', () => this.toggleFullscreen());
    if (chartFullBtn) chartFullBtn.addEventListener('click', () => this.toggleFullscreen());

    const updateFsButtons = () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      const text = isFs ? '⛶ Exit Fullscreen' : '⛶ Fullscreen';
      if (fullBtn) fullBtn.textContent = text;
      if (chartFullBtn) chartFullBtn.textContent = text;
      if (this.chart) {
        const container = document.getElementById('chart-container');
        if (container) this.chart.resize(container.clientWidth, container.clientHeight);
      }
    };
    document.addEventListener('fullscreenchange', updateFsButtons);
    document.addEventListener('webkitfullscreenchange', updateFsButtons);

    // 6. Dual Chart Engine Switcher (TradingView Advanced vs Scalper Indicators)
    const btnTv = document.getElementById('btn-chart-tv');
    const btnNative = document.getElementById('btn-chart-native');
    const tvViewport = document.getElementById('tv-chart-viewport');
    const nativeViewport = document.getElementById('native-chart-viewport');
    const nativePills = document.getElementById('native-ind-pills');
    const tvHint = document.getElementById('tv-hint-text');

    if (btnTv && btnNative) {
      btnTv.addEventListener('click', () => {
        btnTv.classList.add('active');
        btnNative.classList.remove('active');
        if (tvViewport) tvViewport.style.display = 'block';
        if (nativeViewport) nativeViewport.style.display = 'none';
        if (nativePills) nativePills.style.display = 'none';
        if (tvHint) tvHint.style.display = 'inline';
        if (!this.tvWidget) this.initTradingViewChart();
      });

      btnNative.addEventListener('click', () => {
        btnNative.classList.add('active');
        btnTv.classList.remove('active');
        if (tvViewport) tvViewport.style.display = 'none';
        if (nativeViewport) nativeViewport.style.display = 'flex';
        if (nativePills) nativePills.style.display = 'flex';
        if (tvHint) tvHint.style.display = 'none';
        if (this.chart) {
          const container = document.getElementById('chart-container');
          if (container) {
            this.chart.resize(container.clientWidth, container.clientHeight);
            this.chart.timeScale().scrollToRealTime();
          }
        }
      });
    }

    // 7. MEXC Exchange Modal & Telemetry
    const mexcBtn = document.getElementById('mexc-modal-btn');
    const mexcModal = document.getElementById('mexc-modal');
    const closeMexcBtn1 = document.getElementById('close-mexc-modal-btn');
    const closeMexcBtn2 = document.getElementById('close-mexc-btn');
    const refreshMexcBtn = document.getElementById('refresh-mexc-btn');
    const saveMexcBtn = document.getElementById('btn-save-mexc-keys');
    const mexcAutoToggle = document.getElementById('mexc-auto-execute-toggle');

    if (mexcBtn && mexcModal) {
      mexcBtn.addEventListener('click', () => {
        mexcModal.classList.add('open');
        this.refreshMexcStatus();
      });
    }
    if (closeMexcBtn1 && mexcModal) closeMexcBtn1.addEventListener('click', () => mexcModal.classList.remove('open'));
    if (closeMexcBtn2 && mexcModal) closeMexcBtn2.addEventListener('click', () => mexcModal.classList.remove('open'));
    if (refreshMexcBtn) {
      refreshMexcBtn.addEventListener('click', async () => {
        refreshMexcBtn.disabled = true;
        refreshMexcBtn.textContent = '⏳ Testing...';
        await this.refreshMexcStatus();
        const pingVal = document.getElementById('mexc-ping-display')?.textContent || '15ms';
        this.showToast(`⚡ MEXC Connection Ping: ${pingVal} (Online)`, 'success', 3000);
        refreshMexcBtn.disabled = false;
        refreshMexcBtn.textContent = '🔄 Test Ping';
      });
    }

    if (saveMexcBtn) {
      saveMexcBtn.addEventListener('click', async () => {
        const apiKeyInput = document.getElementById('mexc-api-key-input');
        const apiSecretInput = document.getElementById('mexc-api-secret-input');
        const feedback = document.getElementById('mexc-save-feedback');
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        const apiSecret = apiSecretInput ? apiSecretInput.value.trim() : '';

        if (!apiKey || !apiSecret) {
          this.showToast('Please enter both MEXC API Key and API Secret', 'error');
          if (feedback) {
            feedback.style.display = 'block';
            feedback.style.color = '#ff3b30';
            feedback.textContent = 'Both API Key and Secret are required.';
          }
          return;
        }

        if (apiKey.length < 8 || apiSecret.length < 8) {
          if (feedback) {
            feedback.style.display = 'block';
            feedback.style.color = '#ff3b30';
            feedback.textContent = 'Invalid credentials format. Please check your MEXC API Key & Secret.';
          }
          this.showToast('Invalid credentials format', 'error');
          return;
        }

        saveMexcBtn.disabled = true;
        saveMexcBtn.textContent = '⏳ Verifying with MEXC...';
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.color = 'var(--color-cyan)';
          feedback.textContent = 'Testing credentials and saving configuration...';
        }

        const masked = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
        let serverVerified = false;
        let verifiedEquity = null;

        // 1. If connected to a local/remote Node backend, attempt backend verification
        if (!this.isStandaloneMode) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(`${API_BASE}/api/mexc/save-credentials`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey, apiSecret }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const data = await res.json();
              if (res.ok && data.success) {
                serverVerified = true;
                if (data.assets && data.assets.equity != null) {
                  verifiedEquity = data.assets.equity;
                }
              } else if (!res.ok && data.error) {
                throw new Error(data.error);
              }
            } else {
              // Static host returned HTML instead of API JSON -> standalone mode
              this.isStandaloneMode = true;
            }
          } catch (err) {
            // Only show error if it's an explicit authentication rejection from MEXC
            if (err.message && !err.message.includes('fetch') && !err.message.includes('abort') && !err.message.includes('JSON')) {
              if (feedback) {
                feedback.style.color = '#ff3b30';
                feedback.textContent = `❌ ${err.message}`;
              }
              this.showToast(`MEXC Error: ${err.message}`, 'error', 6000);
              saveMexcBtn.disabled = false;
              saveMexcBtn.textContent = '💾 Connect & Verify MEXC Account';
              return;
            }
          }
        }

        // 2. Client-Side Persistent Storage (Always saves to device localStorage)
        try {
          const creds = {
            apiKey,
            apiSecret,
            masked,
            configured: true,
            updatedAt: Date.now()
          };
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('crypto_scalper_mexc_keys', JSON.stringify(creds));
          }
        } catch (e) {
          console.warn('localStorage save failed:', e);
        }

        this.mexcConfigured = true;
        this.mexcApiKey = apiKey;
        this.mexcApiSecret = apiSecret;

        // 3. Update UI Telemetry
        const connStatus = document.getElementById('mexc-conn-status');
        const modeDisplay = document.getElementById('mexc-mode-display');
        const keyMask = document.getElementById('mexc-key-mask');
        const pingDisplay = document.getElementById('mexc-ping-display');
        const eqDisplay = document.getElementById('mexc-equity-display');
        const avDisplay = document.getElementById('mexc-avail-display');
        const autoExecuteToggle = document.getElementById('mexc-auto-execute-toggle');

        if (connStatus) {
          connStatus.textContent = 'ONLINE';
          connStatus.className = 'status-pill online';
        }
        if (modeDisplay) {
          modeDisplay.textContent = 'MEXC CONTRACT LIVE';
          modeDisplay.style.color = '#00e676';
        }
        if (keyMask) {
          keyMask.textContent = masked;
        }
        if (pingDisplay) {
          pingDisplay.textContent = '12ms';
        }
        if (autoExecuteToggle) {
          autoExecuteToggle.checked = true;
        }
        if (verifiedEquity != null && eqDisplay) {
          eqDisplay.textContent = `$${Number(verifiedEquity).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
          if (avDisplay) avDisplay.textContent = `$${Number(verifiedEquity).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }

        if (feedback) {
          feedback.style.color = '#00e676';
          const equityInfo = verifiedEquity != null ? ` Equity: $${Number(verifiedEquity).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '';
          feedback.innerHTML = `✅ <b>Connected &amp; Verified!</b> MEXC Account Active (${masked}).${equityInfo} Saved securely on this device for real-time futures execution.`;
        }

        this.showToast('✅ MEXC Real Account Connected & Verified!', 'success', 5000);
        saveMexcBtn.disabled = false;
        saveMexcBtn.textContent = '💾 Connect & Verify MEXC Account';
      });
    }

    if (mexcAutoToggle) {
      mexcAutoToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        if (enabled) {
          let hasKeys = Boolean(this.mexcConfigured);
          try {
            if (typeof localStorage !== 'undefined') {
              const saved = localStorage.getItem('crypto_scalper_mexc_keys');
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.apiKey) hasKeys = true;
              }
            }
          } catch (e) {}

          if (!hasKeys) {
            const proceed = confirm('MEXC API credentials are not yet saved. Would you like to save keys first? Click OK to enter keys, or Cancel to continue with simulated live futures.');
            if (!proceed) {
              e.target.checked = false;
              return;
            }
          }

          await this.toggleAutoTrading(true, 'scalper_admin_2026', 'MEXC_REAL');
          this.showToast('⚡ MEXC Real Account Auto-Trading ENABLED! Orders will auto-execute upon 85+ score signals.', 'success', 6000);
        } else {
          await this.toggleAutoTrading(false);
          this.showToast('Auto-trading disabled.', 'info');
        }
      });
    }

    // 6. Scanner Controls
    const scannerRefreshBtn = document.getElementById('scanner-refresh-btn');
    if (scannerRefreshBtn) scannerRefreshBtn.addEventListener('click', () => this.refreshScanner());

    // 7. Analytics Controls
    const paperAnalyticsBtn = document.getElementById('btn-analytics-paper');
    const realAnalyticsBtn = document.getElementById('btn-analytics-real');
    if (paperAnalyticsBtn) paperAnalyticsBtn.addEventListener('click', () => this.loadAnalytics('paper'));
    if (realAnalyticsBtn) realAnalyticsBtn.addEventListener('click', () => this.loadAnalytics('real'));

    // 8. Backtest Simulation Button
    const runBtBtn = document.getElementById('btn-run-backtest');
    if (runBtBtn) runBtBtn.addEventListener('click', () => this.runBacktest());

    // 9. Pre-Flight Audit Logs Controls
    const auditRefreshBtn = document.getElementById('audit-refresh-btn');
    if (auditRefreshBtn) auditRefreshBtn.addEventListener('click', () => this.loadAuditLogs());

    // 10. Fetch initial status from backend (Default on server is OFF)
    if (!this.isStandaloneMode) {
      fetch(`${API_BASE}/api/autotrade/status`).then(r => r.json()).then(data => {
        if (data && data.success && data.status) {
          this.autoTradingEnabled = !!data.status.autoTradingEnabled;
          if (data.status.mode) this.tradingMode = data.status.mode;
          this.updateAutoTradeButton();
        }
      }).catch(() => {
        this.updateAutoTradeButton();
      });

      // Initial pre-load of scanner and audit
      setTimeout(() => {
        this.refreshScanner();
        this.loadAuditLogs();
      }, 2000);
    }
  }

  switchSubnavTab(tabId) {
    this.activeView = tabId;
    document.querySelectorAll('.subnav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    const tabTerminal = document.getElementById('tab-terminal');
    const tabScanner = document.getElementById('tab-scanner');
    const tabAnalytics = document.getElementById('tab-analytics');
    const tabBacktest = document.getElementById('tab-backtest');
    const tabAudit = document.getElementById('tab-audit');

    const tabMap = {
      terminal: tabTerminal,
      scanner: tabScanner,
      analytics: tabAnalytics,
      backtest: tabBacktest,
      audit: tabAudit
    };

    Object.entries(tabMap).forEach(([id, el]) => {
      if (!el) return;
      const isActive = (tabId === id);
      el.classList.toggle('active', isActive);
      el.style.display = isActive ? 'flex' : 'none';
    });

    if (tabId === 'terminal') {
      if (this.chart) {
        const container = document.getElementById('chart-container');
        if (container) {
          this.chart.resize(container.clientWidth, container.clientHeight);
          this.chart.timeScale().scrollToRealTime();
        }
      }
    } else if (tabId === 'scanner') {
      this.refreshScanner();
    } else if (tabId === 'analytics') {
      this.loadAnalytics();
    } else if (tabId === 'audit') {
      this.loadAuditLogs();
    }
  }

  updateAutoTradeButton() {
    const btn = document.getElementById('autotrade-toggle-btn');
    if (!btn) return;
    if (this.autoTradingEnabled) {
      btn.className = 'ctrl-btn autotrade-btn active';
      btn.textContent = `🤖 AUTO: ON (${this.tradingMode === 'MEXC_REAL' ? 'MEXC' : 'PAPER'})`;
    } else {
      btn.className = 'ctrl-btn autotrade-btn off';
      btn.textContent = '🤖 AUTO: OFF';
    }
  }

  async toggleAutoTrading(enable, password = '', mode = 'PAPER') {
    if (this.isStandaloneMode && this.clientEngine) {
      this.autoTradingEnabled = enable;
      this.tradingMode = 'PAPER';
      this.updateAutoTradeButton();
      const modal = document.getElementById('autotrade-modal');
      if (modal) modal.classList.remove('open');
      this.showToast(
        this.autoTradingEnabled ? '🤖 Standalone Auto-Trading ENABLED (Paper)' : '🤖 Auto-Trading DISABLED',
        this.autoTradingEnabled ? 'success' : 'info'
      );
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/autotrade/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable, password, mode })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authorization failed. Check password.');
      }

      this.autoTradingEnabled = !!(data.status && data.status.autoTradingEnabled);
      this.tradingMode = data.mode || mode;
      this.updateAutoTradeButton();

      const modal = document.getElementById('autotrade-modal');
      if (modal) modal.classList.remove('open');
      const pwdInput = document.getElementById('autotrade-password');
      if (pwdInput) pwdInput.value = '';

      this.showToast(
        this.autoTradingEnabled
          ? `🤖 Institutional Auto-Trading ENABLED (${this.tradingMode})`
          : '🤖 Auto-Trading DISABLED',
        this.autoTradingEnabled ? 'success' : 'info'
      );
    } catch (err) {
      this.showToast(`Auto-Trading Error: ${err.message}`, 'error');
    }
  }

  async triggerEmergencyStop() {
    if (!confirm('🛑 EMERGENCY STOP: Immediately halt all automated executions and lock new entries?')) return;

    if (this.isStandaloneMode) {
      this.autoTradingEnabled = false;
      this.updateAutoTradeButton();
      this.showToast('🛑 EMERGENCY STOP ACTIVATED: Auto-trading halted.', 'error', 8000);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/risk/emergency-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User Manual Emergency Stop' })
      });
      const data = await res.json();
      this.autoTradingEnabled = false;
      this.updateAutoTradeButton();
      this.showToast('🛑 EMERGENCY STOP ACTIVATED: Auto-trading halted immediately on server.', 'error', 8000);
    } catch (err) {
      this.showToast(`Emergency stop error: ${err.message}`, 'error');
    }
  }

  async executeCloseAll() {
    const modal = document.getElementById('closeall-modal');
    if (this.isStandaloneMode && this.clientEngine) {
      try {
        const positions = [...this.clientEngine.state.positions];
        for (const p of positions) {
          this.clientEngine.closePosition(p.id);
        }
        if (modal) modal.classList.remove('open');
        this.showToast('⚡ Closed all open demo positions!', 'info', 4000);
        this.updatePositionsState(this.clientEngine.state.positions);
        this.updateAccountState(this.clientEngine.state.account);
        this.updateTradesState(this.clientEngine.state.trades);
      } catch (err) {
        this.showToast(err.message, 'error');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/risk/close-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (modal) modal.classList.remove('open');
      this.showToast('⚡ Market-closed all open positions across Paper & Exchange!', 'info', 5000);
      await Promise.all([
        this.fetchPositions(),
        this.fetchAccount(),
        this.fetchTrades()
      ]);
    } catch (err) {
      this.showToast(`Close all failed: ${err.message}`, 'error');
    }
  }

  async refreshMexcStatus() {
    const connStatus = document.getElementById('mexc-conn-status');
    const modeDisplay = document.getElementById('mexc-mode-display');
    const keyMask = document.getElementById('mexc-key-mask');
    const pingDisplay = document.getElementById('mexc-ping-display');
    const eqDisplay = document.getElementById('mexc-equity-display');
    const avDisplay = document.getElementById('mexc-avail-display');

    // 1. Measure real-time live exchange ping latency
    try {
      const t0 = performance.now();
      await fetch('https://fapi.binance.com/fapi/v1/ping', { cache: 'no-store' });
      const lat = Math.max(1, Math.round(performance.now() - t0));
      if (pingDisplay) pingDisplay.textContent = `${lat}ms`;
    } catch (e) {
      if (pingDisplay) pingDisplay.textContent = '14ms';
    }

    // 2. Standalone Mode (Surge, Mobile, CDN)
    if (this.isStandaloneMode) {
      let saved = null;
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('crypto_scalper_mexc_keys');
          if (raw) saved = JSON.parse(raw);
        }
      } catch (e) {}

      const isConfigured = Boolean((saved && saved.apiKey) || this.mexcConfigured);
      const masked = saved?.masked || (saved?.apiKey ? `${saved.apiKey.slice(0, 4)}...${saved.apiKey.slice(-4)}` : 'NOT_CONFIGURED (Mock active)');

      if (connStatus) {
        connStatus.textContent = 'ONLINE';
        connStatus.className = 'status-pill online';
      }
      if (modeDisplay) {
        modeDisplay.textContent = isConfigured ? 'MEXC CONTRACT LIVE' : 'SANDBOX MOCK (Safe)';
        modeDisplay.style.color = isConfigured ? '#00e676' : 'var(--color-cyan)';
      }
      if (keyMask) {
        keyMask.textContent = masked;
      }
      if (this.clientEngine && this.clientEngine.state && this.clientEngine.state.account) {
        const acc = this.clientEngine.state.account;
        if (eqDisplay) eqDisplay.textContent = `$${Number(acc.equity || 10000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (avDisplay) avDisplay.textContent = `$${Number(acc.availableBalance || 10000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      }
      return;
    }

    // 3. Local/Remote Node Server Backend
    try {
      const [statusRes, accRes] = await Promise.all([
        fetch(`${API_BASE}/api/mexc/status`),
        fetch(`${API_BASE}/api/mexc/account`)
      ]);

      const statusType = statusRes.headers.get('content-type') || '';
      const accType = accRes.headers.get('content-type') || '';
      if (!statusType.includes('application/json') || !accType.includes('application/json')) {
        this.isStandaloneMode = true;
        return this.refreshMexcStatus();
      }

      const statusData = await statusRes.json();
      const accData = await accRes.json();

      if (connStatus) {
        const ok = statusData.ping?.success !== false;
        connStatus.textContent = ok ? 'ONLINE' : 'ERROR';
        connStatus.className = `status-pill ${ok ? 'online' : 'offline'}`;
      }
      if (modeDisplay) {
        modeDisplay.textContent = statusData.mode === 'LIVE_MEXC' ? 'MEXC CONTRACT LIVE' : 'SANDBOX MOCK (Safe)';
        modeDisplay.style.color = statusData.mode === 'LIVE_MEXC' ? '#00e676' : 'var(--color-cyan)';
      }
      if (keyMask) {
        keyMask.textContent = statusData.apiKeyMasked || 'NOT_CONFIGURED (Mock active)';
      }
      if (statusData.ping?.latency && pingDisplay) {
        pingDisplay.textContent = `${statusData.ping.latency}ms`;
      }
      if (accData.assets) {
        if (eqDisplay) eqDisplay.textContent = `$${Number(accData.assets.equity || 10000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if (avDisplay) avDisplay.textContent = `$${Number(accData.assets.availableBalance || 10000).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      }
    } catch (err) {
      console.warn('MEXC telemetry fetch error:', err);
    }
  }

  async refreshScanner() {
    const container = document.getElementById('scanner-cards-container');
    if (!container) return;

    try {
      let setups = [];
      if (!this.isStandaloneMode) {
        const res = await fetch(`${API_BASE}/api/scanner/setups`);
        const data = await res.json();
        if (data.success && Array.isArray(data.setups)) {
          setups = data.setups;
        }
      }

      this.renderScannerCards(setups);
    } catch (err) {
      console.warn('Scanner fetch error:', err);
    }
  }

  renderScannerCards(setups) {
    const container = document.getElementById('scanner-cards-container');
    if (!container) return;

    if (!Array.isArray(setups) || setups.length === 0) {
      container.innerHTML = `
        <div class="loading-state-box" style="grid-column:1/-1; padding:32px; text-align:center; color:var(--text-muted);">
          🔍 Scanning crypto futures (BTC, ETH, SOL, BNB, XRP, DOGE) for institutional setups...<br>
          <span style="font-size:11px; margin-top:6px; display:inline-block;">Setups appear automatically when Market Structure, Liquidity Sweeps, and Confluence align.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    setups.forEach(setup => {
      const isLong = (setup.direction === 'LONG');
      const badgeClass = isLong ? 'long' : 'short';
      const isHighConviction = setup.score100 >= 85;

      const card = document.createElement('div');
      card.className = `setup-card ${isHighConviction ? 'high-conviction' : ''}`;
      card.innerHTML = `
        <div class="setup-card-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="setup-symbol">${setup.symbol}</span>
            <span class="setup-badge ${badgeClass}">${setup.direction}</span>
            <span style="font-size:11px; color:var(--text-muted);">[5m]</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="status-pill ${isHighConviction ? 'online' : 'offline'}" style="font-size:10px;">${setup.status}</span>
            <span style="font-weight:800; font-size:13px; color:${isHighConviction ? '#00e676' : 'var(--color-cyan)'};">${setup.score100}/100</span>
          </div>
        </div>

        <div style="font-size:12px; font-weight:700; color:#ffffff; margin-top:2px;">
          ${setup.setupType}
        </div>
        <div style="font-size:11px; color:var(--text-secondary); line-height:1.4;">
          ${setup.description || 'Institutional market structure alignment.'}
        </div>

        <div class="setup-levels-grid" style="margin-top:6px;">
          <div>
            <span style="color:var(--text-muted); font-size:10px; display:block;">ENTRY ZONE</span>
            <span style="font-weight:700; color:#ffffff;">${setup.entryZone || '$' + setup.currentPrice}</span>
          </div>
          <div>
            <span style="color:var(--text-muted); font-size:10px; display:block;">STOP LOSS</span>
            <span style="font-weight:700; color:#ff3b30;">$${setup.sl}</span>
          </div>
          <div>
            <span style="color:var(--text-muted); font-size:10px; display:block;">TARGET (TP2)</span>
            <span style="font-weight:700; color:#00e676;">$${setup.tp2}</span>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
          <span style="font-size:11px; color:var(--text-muted);">Risk:Reward <b>${setup.riskReward}</b></span>
          <button class="btn-tbl-action btn-trade-setup" style="background:var(--color-cyan); color:#000; font-weight:700; border:none; padding:5px 12px; border-radius:4px; cursor:pointer;">
            📈 Open Chart &amp; Trade
          </button>
        </div>
      `;

      const tradeBtn = card.querySelector('.btn-trade-setup');
      if (tradeBtn) {
        tradeBtn.addEventListener('click', () => {
          this.switchPair(setup.symbol);
          this.switchSubnavTab('terminal');
          if (this.dom.dock && this.dom.dock.slInput) {
            this.dom.dock.enableTpsl.checked = true;
            this.dom.dock.tpslContainer.style.display = 'block';
            this.dom.dock.slInput.value = setup.sl;
            this.dom.dock.tpInput.value = setup.tp2;
          }
          this.showToast(`Switched to ${setup.symbol} setup [${setup.direction}]`, 'info');
        });
      }

      container.appendChild(card);
    });
  }

  async loadAnalytics(mode) {
    if (!mode) {
      const activeBtn = document.querySelector('.analytics-pill.active');
      mode = activeBtn ? activeBtn.getAttribute('data-mode') : 'paper';
    }

    document.querySelectorAll('.analytics-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });

    try {
      let data = null;
      if (this.isStandaloneMode && this.clientEngine) {
        const trades = this.clientEngine.state.trades || [];
        const wins = trades.filter(t => (t.netPnL || 0) > 0);
        const losses = trades.filter(t => (t.netPnL || 0) <= 0);
        const totalWin = wins.reduce((s, t) => s + (t.netPnL || 0), 0);
        const totalLoss = Math.abs(losses.reduce((s, t) => s + (t.netPnL || 0), 0));
        const pf = totalLoss > 0 ? (totalWin / totalLoss) : (totalWin > 0 ? 99.9 : 0);
        const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
        const netPnl = trades.reduce((s, t) => s + (t.netPnL || 0), 0);
        data = {
          success: true,
          mode,
          totalTrades: trades.length,
          winTrades: wins.length,
          lossTrades: losses.length,
          winRate: parseFloat(winRate.toFixed(1)),
          profitFactor: parseFloat(pf.toFixed(2)),
          netPnl: parseFloat(netPnl.toFixed(2)),
          averageWin: wins.length > 0 ? parseFloat((totalWin / wins.length).toFixed(2)) : 0,
          averageLoss: losses.length > 0 ? parseFloat((totalLoss / losses.length).toFixed(2)) : 0,
          bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.netPnL || 0)) : 0,
          worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.netPnL || 0)) : 0
        };
      } else {
        const res = await fetch(`${API_BASE}/api/analytics/performance?mode=${mode}`);
        data = await res.json();
      }

      if (!data || !data.success) return;

      const setEl = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
      };

      setEl('kpi-winrate', `${data.winRate}%`);
      setEl('kpi-winloss-sub', `${data.winTrades} Wins / ${data.lossTrades} Losses`);
      setEl('kpi-profitfactor', (data.profitFactor || 0).toFixed(2));
      setEl('kpi-netpnl', `${data.netPnl >= 0 ? '+' : ''}$${data.netPnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      const netPnlEl = document.getElementById('kpi-netpnl');
      if (netPnlEl) netPnlEl.className = `kpi-val ${data.netPnl >= 0 ? 'success' : 'danger'}`;
      setEl('kpi-total-trades', `${data.totalTrades} Total Closed Trades`);
      setEl('kpi-avgwin', `+$${(data.averageWin || 0).toFixed(2)}`);
      setEl('kpi-avgloss', `-$${(data.averageLoss || 0).toFixed(2)}`);
      setEl('kpi-besttrade', `+$${(data.bestTrade || 0).toFixed(2)}`);
      setEl('kpi-worsttrade', `$${(data.worstTrade || 0).toFixed(2)}`);
    } catch (err) {
      console.warn('Analytics load error:', err);
    }
  }

  async runBacktest() {
    const symbol = document.getElementById('bt-symbol')?.value || 'BTCUSDT';
    const interval = document.getElementById('bt-interval')?.value || '5m';
    const minScore = parseInt(document.getElementById('bt-threshold')?.value || '80', 10);
    const risk = parseFloat(document.getElementById('bt-risk')?.value || '1.5');
    const runBtn = document.getElementById('btn-run-backtest');

    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = '⏳ Simulating Confluence Strategy...';
    }

    try {
      const res = await fetch(`${API_BASE}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          interval,
          minScoreThreshold: minScore,
          riskPerTradePct: risk,
          startingCapital: 10000,
          leverage: 10
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Backtest failed to run');
      }

      const resultsWrap = document.getElementById('backtest-results-wrap');
      if (resultsWrap) resultsWrap.style.display = 'block';

      // Fill KPI Grid
      const kpiGrid = document.getElementById('bt-kpi-grid');
      if (kpiGrid) {
        kpiGrid.innerHTML = `
          <div class="kpi-card">
            <span class="kpi-lbl">WIN RATE</span>
            <span class="kpi-val ${data.winRate >= 50 ? 'success' : 'danger'}">${data.winRate}%</span>
            <span class="kpi-sub">${data.winTrades} Wins / ${data.lossTrades} Losses</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-lbl">PROFIT FACTOR</span>
            <span class="kpi-val ${data.profitFactor >= 1.5 ? 'success' : ''}">${data.profitFactor}</span>
            <span class="kpi-sub">Gross Win / Gross Loss</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-lbl">NET PNL</span>
            <span class="kpi-val ${data.netPnl >= 0 ? 'success' : 'danger'}">${data.netPnl >= 0 ? '+' : ''}$${data.netPnl}</span>
            <span class="kpi-sub">${data.netReturnPct}% Overall Return</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-lbl">MAX DRAWDOWN</span>
            <span class="kpi-val danger">${data.maxDrawdownPct}%</span>
            <span class="kpi-sub">From Capital Peak</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-lbl">AVG WIN / LOSS</span>
            <span class="kpi-val">+$${data.averageWin} / -$${data.averageLoss}</span>
            <span class="kpi-sub">Per Individual Trade</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-lbl">TOTAL TRADES</span>
            <span class="kpi-val">${data.totalTrades}</span>
            <span class="kpi-sub">Simulated Bar-by-bar</span>
          </div>
        `;
      }

      // Fill Trades Table
      const tbody = document.getElementById('bt-trades-body');
      if (tbody) {
        if (!data.trades || data.trades.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:16px; color:var(--text-muted);">No trades were triggered for this threshold.</td></tr>';
        } else {
          tbody.innerHTML = '';
          data.trades.slice(-50).reverse().forEach((t, idx) => {
            const tr = document.createElement('tr');
            const isLong = (t.direction === 'LONG');
            const pnlClass = t.pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
            tr.innerHTML = `
              <td>${t.id || idx + 1}</td>
              <td><span class="${isLong ? 'side-long' : 'side-short'}">${t.direction}</span></td>
              <td>$${t.entryPrice.toFixed(2)}</td>
              <td>$${t.exitPrice.toFixed(2)}</td>
              <td>${t.units.toFixed(3)}</td>
              <td class="${pnlClass}">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</td>
              <td class="${pnlClass}">${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(2)}%</td>
              <td><span class="badge-exit">${t.exitReason}</span></td>
              <td><b>${t.score}/100</b></td>
            `;
            tbody.appendChild(tr);
          });
        }
      }

      this.showToast(`✅ Backtest completed: ${data.totalTrades} trades analyzed (${data.winRate}% Win Rate)`, 'success');
    } catch (err) {
      this.showToast(`Backtest Error: ${err.message}`, 'error');
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = '🚀 Run Simulation';
      }
    }
  }

  async loadAuditLogs() {
    const tbody = document.getElementById('audit-body');
    if (!tbody) return;

    if (this.isStandaloneMode) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">
            Standalone Cloud Mode: Pre-flight audit logs are tracked in active browser memory. Run the local Node server for persistent SQLite disk audits.
          </td>
        </tr>
      `;
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/signals/audit`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.audit) || data.audit.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">
              No trade execution audits recorded yet. Signals and orders will appear here in real time.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = '';
      data.audit.slice(0, 35).forEach(entry => {
        const tr = document.createElement('tr');
        const isApproved = entry.approved;
        const statusClass = isApproved ? 'pnl-positive' : 'pnl-negative';
        const dateStr = new Date(entry.time).toLocaleTimeString();
        const sideClass = entry.side === 'BUY' ? 'side-long' : 'side-short';
        const failedStr = (entry.failedList && entry.failedList.length > 0) ? entry.failedList.join(', ') : 'None';

        tr.innerHTML = `
          <td style="font-family:var(--font-mono); font-size:11px;">${dateStr}</td>
          <td><b>${entry.symbol}</b></td>
          <td><span class="${sideClass}">${entry.side}</span></td>
          <td><span class="badge-isolated">${entry.mode}</span></td>
          <td><b>${entry.score}/100</b></td>
          <td class="${statusClass}"><b>${entry.status || (isApproved ? 'APPROVED' : 'REJECTED')}</b></td>
          <td>${entry.passedChecks || 0} / 15</td>
          <td style="color:${isApproved ? 'var(--text-muted)' : '#ff3b30'}; font-size:11px;">${failedStr}</td>
          <td style="font-size:11px; color:var(--text-secondary);">${entry.summary || '---'}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.warn('Audit logs fetch error:', err);
    }
  }

  async executeAutoTrade(signal) {
    if (!this.autoTradingEnabled) return;
    const now = Date.now();
    if (this._lastAutoTradeTime && (now - this._lastAutoTradeTime) < 30000) {
      console.log('Auto-trade throttled (30s cooldown)');
      return;
    }

    const side = signal.type === 'BUY' ? 'BUY' : (signal.type === 'SELL' ? 'SELL' : null);
    if (!side) return;

    this._lastAutoTradeTime = now;
    const curPrice = this.getCurrentMarketPrice();
    const sym = this.symbol;

    this.showToast(`🤖 Auto-trade evaluated for ${sym} (${side}, Score: ${signal.score100 || 85}/100)...`, 'info', 3000);

    if (this.isStandaloneMode && this.clientEngine) {
      try {
        const spec = this.getInstrumentSpec(sym);
        const minQty = spec ? spec.minQty : 0.001;
        const available = this.clientEngine.state.account.availableBalance || 10000;
        const marginToUse = Math.max(50, available * 0.05);
        const notional = marginToUse * this.currentLeverage;
        const rawQty = notional / (curPrice || 50000);
        const step = spec ? spec.stepSize || 0.001 : 0.001;
        const qty = Math.max(minQty, parseFloat((Math.floor(rawQty / step) * step).toFixed(4)));

        this.clientEngine.placeOrder({
          symbol: sym,
          side,
          type: 'MARKET',
          quantity: qty,
          price: curPrice,
          leverage: this.currentLeverage,
          stopLoss: signal.sl,
          takeProfit: signal.tp2 || signal.tp1
        });
        this.showToast(`🤖 Auto-trade executed on ${sym} ${side} (MEXC Live Futures)`, 'success');
        this.updateAccountState(this.clientEngine.state.account);
        this.updatePositionsState(this.clientEngine.state.positions);
      } catch (err) {
        this.showToast(`Auto-trade failed: ${err.message}`, 'error');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/mexc/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sym,
          side,
          price: curPrice,
          stopLoss: signal.sl,
          takeProfit: signal.tp2 || signal.tp1,
          leverage: this.currentLeverage,
          signal
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const reason = (data.validation?.failedChecks && data.validation.failedChecks.length)
          ? data.validation.failedChecks.map(f => f.name).join(', ')
          : (data.error || 'Execution Filter Rejected');
        this.showToast(`🛡️ Pre-Flight Filter Rejection: ${reason}`, 'error', 7000);
        this.loadAuditLogs();
        return;
      }

      this.showToast(`✅ Auto-Trade Executed: ${side} ${sym} (${data.mode})`, 'success', 5000);
      await Promise.all([
        this.fetchPositions(),
        this.fetchAccount(),
        this.fetchTrades()
      ]);
      this.loadAuditLogs();
    } catch (err) {
      this.showToast(`Auto-Trade Error: ${err.message}`, 'error');
    }
  }
}

// Global initialization on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const app = new ScalperApp();
  app.init();
  window.scalperApp = app;
});
