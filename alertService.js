/**
 * CRYPTO SCALPER PRO - TELEGRAM & WHATSAPP ALERT FORWARDING SERVICE [v1.0]
 * Formats and forwards high-probability trade signals to Telegram and WhatsApp.
 * Supports autonomous in-browser execution with zero backend dependency.
 */

class AlertService {
  constructor() {
    this.storageKey = 'crypto_scalper_alert_config';
    this.config = this.loadConfig();
    this.lastDispatchedKey = null;
    this.history = [];
  }

  loadConfig() {
    const defaultConfig = {
      discord: {
        enabled: false,
        webhookUrl: ''
      },
      ntfy: {
        enabled: false,
        topic: ''
      },
      telegram: {
        enabled: false,
        botToken: '',
        chatId: '',
        topicId: ''
      },
      whatsapp: {
        enabled: false,
        provider: 'callmebot', // 'callmebot' or 'webhook'
        phone: '',
        apiKey: '',
        webhookUrl: ''
      },
      filters: {
        // [BUG FIX B13] Default aligned to auto-trade threshold (85) so alerts only fire
        // for signals that are actually auto-trade eligible. Previously 70 caused confusion —
        // alerts fired for signals that would never auto-execute.
        minScore100: 85,
        minScore: 6, // 1 to 8 compatibility
        alertBuySell: true,
        alertExit: false
      }

    };

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          return Object.assign(defaultConfig, parsed, {
            discord: Object.assign(defaultConfig.discord, parsed.discord || {}),
            ntfy: Object.assign(defaultConfig.ntfy, parsed.ntfy || {}),
            telegram: Object.assign(defaultConfig.telegram, parsed.telegram || {}),
            whatsapp: Object.assign(defaultConfig.whatsapp, parsed.whatsapp || {}),
            filters: Object.assign(defaultConfig.filters, parsed.filters || {})
          });
        }
      }
    } catch (e) {
      console.warn('LocalStorage unavailable for AlertService, using default config');
    }
    return defaultConfig;
  }

  saveConfig(newConfig = null) {
    if (newConfig) {
      this.config = Object.assign(this.config, newConfig);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.config));
      }
    } catch (e) {}
    return this.config;
  }

  // =========================================================================
  // MESSAGE FORMATTERS
  // =========================================================================

  formatTelegramMessage(sig, symbol, interval) {
    const isBuy = sig.type === 'BUY';
    const isSell = sig.type === 'SELL';
    const actionEmoji = isBuy ? '🟢' : isSell ? '🔴' : '⚪';
    const actionLabel = isBuy ? 'STRONG BUY (LONG)' : isSell ? 'STRONG SELL (SHORT)' : sig.type;
    
    const entry = sig.entryPrice || sig.price || 0;
    const sl = sig.sl || 0;
    const tp1 = sig.tp1 || 0;
    const tp2 = sig.tp2 || 0;
    const tp3 = sig.tp3 || 0;
    const score = sig.score || 0;
    const grade = sig.grade || (score >= 7 ? 'ELITE' : score >= 6 ? 'STRONG' : 'MODERATE');
    const rr = sig.rr ? `1:${Number(sig.rr).toFixed(1)}` : '1:2.0';

    const riskPct = (entry > 0 && sl > 0) ? (Math.abs(entry - sl) / entry * 100).toFixed(2) : '---';
    const tp1Pct = (entry > 0 && tp1 > 0) ? (Math.abs(tp1 - entry) / entry * 100).toFixed(2) : '---';
    const tp2Pct = (entry > 0 && tp2 > 0) ? (Math.abs(tp2 - entry) / entry * 100).toFixed(2) : '---';
    const tp3Pct = (entry > 0 && tp3 > 0) ? (Math.abs(tp3 - entry) / entry * 100).toFixed(2) : '---';

    let factorsList = '';
    if (sig.factors) {
      const f = sig.factors;
      const items = [
        f.trend ? '✅ EMA 9/21 Trend' : null,
        f.macro ? '✅ 200 EMA Macro' : null,
        f.rsi ? '✅ RSI Momentum' : null,
        f.macd ? '✅ MACD Acceleration' : null,
        f.vol ? '✅ Volume Surge' : null,
        f.vwap ? '✅ VWAP Support/Resistance' : null,
        f.pa ? '✅ Price Action Engulfing' : null,
        f.breakout ? '✅ ATR Range Breakout' : null
      ].filter(Boolean);
      factorsList = items.length > 0 ? items.join('\n') : '✅ Multi-indicator confluence';
    } else {
      factorsList = '✅ Automated confluence match';
    }

    const timeStr = new Date((sig.time || Math.floor(Date.now() / 1000)) * 1000).toLocaleTimeString();

    return [
      `🚨 <b>CRYPTO SCALPER PRO — LIVE SIGNAL</b> 🚨`,
      ``,
      `<b>Pair:</b> <code>${symbol}</code> [${interval}]`,
      `<b>Signal:</b> ${actionEmoji} <b>${actionLabel}</b>`,
      `<b>Confluence Score:</b> <b>${score}/8 (${Math.round((score / 8) * 100)}%) — ${grade}</b>`,
      ``,
      `🎯 <b>TRADE SETUP LEVELS</b>`,
      `• <b>Entry:</b> $${entry.toLocaleString('en-US')}`,
      `• <b>Stop Loss:</b> $${sl.toLocaleString('en-US')} (Risk: -${riskPct}%)`,
      `• <b>Take Profit 1:</b> $${tp1.toLocaleString('en-US')} (+${tp1Pct}%) [1:1.0]`,
      `• <b>Take Profit 2:</b> $${tp2.toLocaleString('en-US')} (+${tp2Pct}%) [1:2.0]`,
      `• <b>Take Profit 3:</b> $${tp3.toLocaleString('en-US')} (+${tp3Pct}%) [1:3.0]`,
      `• <b>Risk / Reward:</b> ${rr}`,
      ``,
      `📊 <b>CONFIRMED CONFLUENCE:</b>`,
      factorsList,
      ``,
      `⏱ <i>Time: ${timeStr} | Crypto Scalper Pro Autonomous Terminal</i>`
    ].join('\n');
  }

  formatWhatsAppMessage(sig, symbol, interval) {
    const isBuy = sig.type === 'BUY';
    const isSell = sig.type === 'SELL';
    const actionEmoji = isBuy ? '🟢' : isSell ? '🔴' : '⚪';
    const actionLabel = isBuy ? 'STRONG BUY (LONG)' : isSell ? 'STRONG SELL (SHORT)' : sig.type;

    const entry = sig.entryPrice || sig.price || 0;
    const sl = sig.sl || 0;
    const tp1 = sig.tp1 || 0;
    const tp2 = sig.tp2 || 0;
    const tp3 = sig.tp3 || 0;
    const score = sig.score || 0;
    const grade = sig.grade || (score >= 7 ? 'ELITE' : score >= 6 ? 'STRONG' : 'MODERATE');
    const rr = sig.rr ? `1:${Number(sig.rr).toFixed(1)}` : '1:2.0';

    const riskPct = (entry > 0 && sl > 0) ? (Math.abs(entry - sl) / entry * 100).toFixed(2) : '---';
    const tp1Pct = (entry > 0 && tp1 > 0) ? (Math.abs(tp1 - entry) / entry * 100).toFixed(2) : '---';
    const tp2Pct = (entry > 0 && tp2 > 0) ? (Math.abs(tp2 - entry) / entry * 100).toFixed(2) : '---';
    const tp3Pct = (entry > 0 && tp3 > 0) ? (Math.abs(tp3 - entry) / entry * 100).toFixed(2) : '---';

    let factorsList = '';
    if (sig.factors) {
      const f = sig.factors;
      const items = [
        f.trend ? '✅ EMA 9/21' : null,
        f.macro ? '✅ 200 EMA' : null,
        f.rsi ? '✅ RSI Mom' : null,
        f.macd ? '✅ MACD' : null,
        f.vol ? '✅ Volume' : null,
        f.vwap ? '✅ VWAP' : null,
        f.pa ? '✅ Candle' : null,
        f.breakout ? '✅ Breakout' : null
      ].filter(Boolean);
      factorsList = items.join(' | ');
    } else {
      factorsList = '✅ Multi-factor confluence verified';
    }

    const timeStr = new Date((sig.time || Math.floor(Date.now() / 1000)) * 1000).toLocaleTimeString();

    return [
      `🚨 *CRYPTO SCALPER PRO — LIVE SIGNAL* 🚨`,
      ``,
      `*Pair:* *${symbol}* [${interval}]`,
      `*Signal:* ${actionEmoji} *${actionLabel}*`,
      `*Score:* *${score}/8 (${Math.round((score / 8) * 100)}%) — ${grade}*`,
      ``,
      `🎯 *TRADE LEVELS*`,
      `• *Entry:* $${entry.toLocaleString('en-US')}`,
      `• *Stop Loss:* $${sl.toLocaleString('en-US')} (-${riskPct}%)`,
      `• *Take Profit 1:* $${tp1.toLocaleString('en-US')} (+${tp1Pct}%)`,
      `• *Take Profit 2:* $${tp2.toLocaleString('en-US')} (+${tp2Pct}%)`,
      `• *Take Profit 3:* $${tp3.toLocaleString('en-US')} (+${tp3Pct}%)`,
      `• *Risk/Reward:* ${rr}`,
      ``,
      `📊 *Confluence:* ${factorsList}`,
      ``,
      `⏱ _Time: ${timeStr}_`
    ].join('\n');
  }

  formatDiscordPayload(sig, symbol, interval) {
    const isBuy = sig.type === 'BUY';
    const isSell = sig.type === 'SELL';
    const color = isBuy ? 0x00e676 : isSell ? 0xff3b30 : 0x00d2ff;
    const actionLabel = isBuy ? '🟢 STRONG BUY (LONG)' : isSell ? '🔴 STRONG SELL (SHORT)' : sig.type;

    const entry = sig.entryPrice || sig.price || 0;
    const sl = sig.sl || 0;
    const tp1 = sig.tp1 || 0;
    const tp2 = sig.tp2 || 0;
    const tp3 = sig.tp3 || 0;
    const score = sig.score || 0;
    const score100 = sig.score100 !== undefined ? sig.score100 : (score ? Math.round((score / 8) * 100) : 70);
    const rr = sig.rr ? `1:${Number(sig.rr).toFixed(1)}` : '1:2.0';

    const riskPct = (entry > 0 && sl > 0) ? (Math.abs(entry - sl) / entry * 100).toFixed(2) : '---';
    const tp1Pct = (entry > 0 && tp1 > 0) ? (Math.abs(tp1 - entry) / entry * 100).toFixed(2) : '---';
    const tp2Pct = (entry > 0 && tp2 > 0) ? (Math.abs(tp2 - entry) / entry * 100).toFixed(2) : '---';
    const tp3Pct = (entry > 0 && tp3 > 0) ? (Math.abs(tp3 - entry) / entry * 100).toFixed(2) : '---';

    let factorsList = [];
    if (sig.factors) {
      const f = sig.factors;
      if (f.trend) factorsList.push('EMA 9/21 Ribbon');
      if (f.macro) factorsList.push('200 EMA Macro Guard');
      if (f.rsi) factorsList.push('RSI Momentum');
      if (f.macd) factorsList.push('MACD Histogram Accel');
      if (f.vol) factorsList.push('Volume Surge (1.1x)');
      if (f.vwap) factorsList.push('Institutional VWAP');
      if (f.adx) factorsList.push('ADX Trend Strength');
      if (f.mtf) factorsList.push('HTF Confirmation');
    }
    const factorsStr = factorsList.length > 0 ? factorsList.join(' • ') : '8-Factor Quantitative Confluence';

    return {
      username: 'Crypto Scalper Pro',
      embeds: [
        {
          title: `🚨 ${actionLabel} — ${symbol} [${interval}]`,
          color: color,
          timestamp: new Date().toISOString(),
          fields: [
            { name: '🎯 Entry Price', value: `$${Number(entry).toLocaleString('en-US')}`, inline: true },
            { name: '🛑 Stop Loss', value: `$${Number(sl).toLocaleString('en-US')} (-${riskPct}%)`, inline: true },
            { name: '⚖️ Target R:R', value: `${rr}`, inline: true },
            { name: '💰 TP1 (1R)', value: `$${Number(tp1).toLocaleString('en-US')} (+${tp1Pct}%)`, inline: true },
            { name: '💰 TP2 (2R)', value: `$${Number(tp2).toLocaleString('en-US')} (+${tp2Pct}%)`, inline: true },
            { name: '💰 TP3 (3R)', value: `$${Number(tp3).toLocaleString('en-US')} (+${tp3Pct}%)`, inline: true },
            { name: '📊 Confluence Score', value: `**${score}/8** (${score100}/100)`, inline: true },
            { name: '⚡ Active Regime', value: `${sig.regime || 'Institutional Orderflow'}`, inline: true },
            { name: '🔍 Confluence Factors', value: factorsStr, inline: false }
          ],
          footer: {
            text: 'Crypto Scalper Pro Autonomous Terminal • Capital Protection Active'
          }
        }
      ]
    };
  }

  formatNtfyPayload(sig, symbol, interval) {
    const isBuy = sig.type === 'BUY';
    const isSell = sig.type === 'SELL';
    const actionLabel = isBuy ? 'BUY / LONG' : isSell ? 'SELL / SHORT' : sig.type;
    const entry = sig.entryPrice || sig.price || 0;
    const sl = sig.sl || 0;
    const tp2 = sig.tp2 || sig.tp1 || 0;
    const score = sig.score || 0;

    const title = `🚨 ${actionLabel}: ${symbol} [${interval}] @ $${entry}`;
    const body = `Entry: $${entry} | SL: $${sl} | Target TP: $${tp2}\nScore: ${score}/8 | R:R ${sig.rr ? '1:'+Number(sig.rr).toFixed(1) : '1:2.0'}`;
    return {
      title,
      body,
      priority: 'urgent',
      tags: isBuy ? 'chart_with_upwards_trend,green_circle' : 'chart_with_downwards_trend,red_circle'
    };
  }

  // =========================================================================
  // DISCORD SENDER
  // =========================================================================

  async sendDiscord(payload, customUrl = null) {
    const webhookUrl = (customUrl || this.config.discord?.webhookUrl || '').trim();
    if (!webhookUrl) {
      throw new Error('Discord Webhook URL is required.');
    }
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
      throw new Error('Invalid Discord Webhook URL. It must start with https://discord.com/api/webhooks/...');
    }

    // Try backend proxy first if available
    try {
      const proxyRes = await fetch('/api/alerts/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, payload })
      });
      if (proxyRes.ok) {
        const d = await proxyRes.json();
        if (d.success) return { success: true, provider: 'discord-proxy' };
        if (d.error) throw new Error(d.error);
      }
    } catch (e) {
      if (e.message && !e.message.includes('fetch') && !e.message.includes('Failed')) {
        throw e;
      }
    }

    // Direct browser fetch
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Discord Webhook failed (${res.status}): ${errText || res.statusText}`);
    }

    return { success: true, provider: 'discord' };
  }

  async testDiscord(webhookUrl) {
    const payload = {
      username: 'Crypto Scalper Pro',
      embeds: [{
        title: '🔔 CRYPTO SCALPER PRO — DISCORD ALERT TEST',
        description: '✅ **Discord Webhook Connected Successfully!**\nReal-time signals (Entry, Stop Loss, Take Profits 1-3, Confluence Score) will be delivered here instantly.',
        color: 0x00e676,
        timestamp: new Date().toISOString(),
        footer: { text: 'Crypto Scalper Pro • Test Notification' }
      }]
    };
    return await this.sendDiscord(payload, webhookUrl);
  }

  // =========================================================================
  // NTFY.SH PHONE PUSH SENDER
  // =========================================================================

  async sendNtfy(data, customTopic = null) {
    const rawTopic = (customTopic || this.config.ntfy?.topic || '').trim();
    const topic = rawTopic.replace(/^https?:\/\/ntfy\.sh\//, '');
    if (!topic) {
      throw new Error('ntfy.sh Topic Name is required.');
    }

    const title = typeof data === 'string' ? '🔔 Crypto Scalper Pro' : (data.title || '🔔 Crypto Scalper Pro');
    const body = typeof data === 'string' ? data : (data.body || '');
    const priority = (typeof data === 'object' && data.priority) ? data.priority : 'urgent';
    const tags = (typeof data === 'object' && data.tags) ? data.tags : 'bell';

    // Try backend proxy first
    try {
      const proxyRes = await fetch('/api/alerts/ntfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, title, body, priority, tags })
      });
      if (proxyRes.ok) {
        const d = await proxyRes.json();
        if (d.success) return { success: true, provider: 'ntfy-proxy' };
        if (d.error) throw new Error(d.error);
      }
    } catch (e) {
      if (e.message && !e.message.includes('fetch') && !e.message.includes('Failed')) {
        throw e;
      }
    }

    // Direct browser fetch
    const url = `https://ntfy.sh/${encodeURIComponent(topic)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Title': title,
        'Priority': priority,
        'Tags': tags
      },
      body: body
    });

    if (!res.ok) {
      throw new Error(`ntfy.sh returned HTTP status ${res.status}`);
    }

    return { success: true, provider: 'ntfy' };
  }

  async testNtfy(topic) {
    return await this.sendNtfy({
      title: '🔔 Crypto Scalper Pro — Phone Push Test',
      body: '✅ Mobile push alerts are active and connected! Signals will push directly to your phone.',
      priority: 'high',
      tags: 'white_check_mark,rocket'
    }, topic);
  }

  // =========================================================================
  // TELEGRAM SENDER (WITH BACKEND PROXY & HELPFUL ERRORS)
  // =========================================================================

  async sendTelegram(text, customToken = null, customChatId = null) {
    const token = (customToken || this.config.telegram.botToken || '').trim();
    const chatId = (customChatId || this.config.telegram.chatId || '').trim();

    if (!token || !chatId) {
      throw new Error('Telegram Bot Token and Chat ID must be configured.');
    }

    // 1. Try backend server proxy first (avoids browser CORS & ISP DNS blocks)
    try {
      const proxyRes = await fetch('/api/alerts/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: token,
          chatId: chatId,
          text: text,
          topicId: this.config.telegram.topicId || null
        })
      });
      if (proxyRes.ok) {
        const d = await proxyRes.json();
        if (d.success) return { success: true, messageId: d.messageId, provider: 'telegram-proxy' };
        if (d.error) throw new Error(d.error);
      }
    } catch (err) {
      if (err.message && !err.message.includes('fetch') && !err.message.includes('Failed')) {
        throw err;
      }
    }

    // 2. Fallback to direct browser fetch
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    if (this.config.telegram.topicId) {
      payload.message_thread_id = parseInt(this.config.telegram.topicId, 10);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({ ok: false, description: 'Non-JSON response from Telegram' }));
    if (!res.ok || !data.ok) {
      let msg = data.description || 'Telegram API request failed';
      if (msg.includes('chat not found')) {
        msg = 'Telegram Chat Not Found! 1) Open your bot in Telegram and click START. 2) Enter your numeric User ID from @userinfobot (e.g. 123456789), not @username.';
      }
      throw new Error(msg);
    }

    return { success: true, messageId: data.result ? data.result.message_id : null };
  }

  // =========================================================================
  // WHATSAPP SENDER
  // =========================================================================

  async sendWhatsApp(text, rawSignal = null, customConfig = null) {
    const cfg = customConfig || this.config.whatsapp;
    const provider = cfg.provider || 'callmebot';

    if (provider === 'callmebot') {
      const phone = (cfg.phone || '').trim().replace(/[^0-9+]/g, '');
      const apiKey = (cfg.apiKey || '').trim();

      if (!phone || !apiKey) {
        throw new Error('WhatsApp Phone Number and CallMeBot API Key are required.');
      }

      // CallMeBot API URL
      const cleanPhone = phone.startsWith('+') ? phone.substring(1) : phone;
      const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(text)}&apikey=${apiKey}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        
        await fetch(url, {
          method: 'GET',
          mode: 'no-cors',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return { success: true, provider: 'callmebot' };
      } catch (err) {
        if (typeof Image !== 'undefined') {
          const img = new Image();
          img.src = url;
          return { success: true, provider: 'callmebot-beacon' };
        }
        throw new Error(`CallMeBot request failed: ${err.message}`);
      }
    } else if (provider === 'webhook') {
      const webhookUrl = (cfg.webhookUrl || '').trim();
      if (!webhookUrl) {
        throw new Error('Custom Webhook URL is required.');
      }

      const payload = {
        message: text,
        signal: rawSignal,
        timestamp: Date.now(),
        source: 'CryptoScalperPro'
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Webhook responded with HTTP status ${res.status}`);
      }

      return { success: true, provider: 'webhook' };
    } else {
      throw new Error(`Unknown WhatsApp provider: ${provider}`);
    }
  }

  // =========================================================================
  // AUTOMATED SIGNAL FORWARDER (WITH DEDUPLICATION & FILTERS)
  // =========================================================================

  async forwardSignal(signal, symbol, interval) {
    if (!signal) return { forwarded: false, reason: 'No signal data' };

    const isBuySell = (signal.type === 'BUY' || signal.type === 'SELL');
    const isExit = signal.type.startsWith('EXIT');

    // Filter by signal type
    if (isBuySell && !this.config.filters.alertBuySell) {
      return { forwarded: false, reason: 'BUY/SELL alerts disabled in settings' };
    }
    if (isExit && !this.config.filters.alertExit) {
      return { forwarded: false, reason: 'Exit alerts disabled in settings' };
    }
    if (!isBuySell && !isExit) {
      return { forwarded: false, reason: 'Signal type not supported' };
    }

    // Filter by Confluence Score (default >= 70 on 100-point confluence scale)
    const score = signal.score !== undefined ? signal.score : (signal.score100 ? Math.round((signal.score100 / 100) * 8) : 0);
    const score100 = signal.score100 !== undefined
      ? signal.score100
      : (signal.score ? Math.round((signal.score / 8) * 100) : 0);
    const minThreshold100 = this.config.filters?.minScore100 !== undefined
      ? this.config.filters.minScore100
      : (this.config.filters?.minScore ? Math.round((this.config.filters.minScore / 8) * 100) : 70);

    if (isBuySell && score100 < minThreshold100) {
      return { forwarded: false, reason: `Score ${score100}/100 below minimum threshold ${minThreshold100}/100` };
    }

    // Deduplication check: prevent multiple sends on the same candle / bar
    const barKey = signal.barIndex !== undefined ? signal.barIndex : (signal.time || Date.now());
    const signalKey = `${symbol}-${interval}-${signal.type}-${barKey}`;
    if (this.lastDispatchedKey === signalKey) {
      return { forwarded: false, reason: 'Duplicate signal already dispatched' };
    }
    this.lastDispatchedKey = signalKey;

    const results = {
      signalKey,
      discord: { sent: false, error: null },
      ntfy: { sent: false, error: null },
      telegram: { sent: false, error: null },
      whatsapp: { sent: false, error: null }
    };

    // 1. Dispatch Discord Alert
    if (this.config.discord?.enabled && this.config.discord?.webhookUrl) {
      try {
        const discordPayload = this.formatDiscordPayload(signal, symbol, interval);
        await this.sendDiscord(discordPayload);
        results.discord.sent = true;
      } catch (err) {
        results.discord.error = err.message;
        console.warn('Discord alert forwarding error:', err.message);
      }
    }

    // 2. Dispatch ntfy Mobile Push Alert
    if (this.config.ntfy?.enabled && this.config.ntfy?.topic) {
      try {
        const ntfyPayload = this.formatNtfyPayload(signal, symbol, interval);
        await this.sendNtfy(ntfyPayload);
        results.ntfy.sent = true;
      } catch (err) {
        results.ntfy.error = err.message;
        console.warn('ntfy alert forwarding error:', err.message);
      }
    }

    // 3. Dispatch Telegram Alert
    if (this.config.telegram?.enabled && this.config.telegram?.botToken && this.config.telegram?.chatId) {
      try {
        const tgText = this.formatTelegramMessage(signal, symbol, interval);
        await this.sendTelegram(tgText);
        results.telegram.sent = true;
      } catch (err) {
        results.telegram.error = err.message;
        console.warn('Telegram alert forwarding error:', err.message);
      }
    }

    // 4. Dispatch WhatsApp Alert
    if (this.config.whatsapp?.enabled) {
      try {
        const waText = this.formatWhatsAppMessage(signal, symbol, interval);
        await this.sendWhatsApp(waText, signal);
        results.whatsapp.sent = true;
      } catch (err) {
        results.whatsapp.error = err.message;
        console.warn('WhatsApp alert forwarding error:', err.message);
      }
    }

    this.history.unshift({
      time: Date.now(),
      symbol,
      interval,
      type: signal.type,
      score,
      results
    });
    if (this.history.length > 50) this.history.pop();

    return results;
  }

  // =========================================================================
  // TEST METHODS
  // =========================================================================

  async testTelegram(botToken, chatId) {
    const testMsg = [
      `🔔 <b>CRYPTO SCALPER PRO — CONNECTION TEST</b> 🔔`,
      ``,
      `✅ Telegram alert integration is <b>ACTIVE & CONNECTED</b>!`,
      `Whenever a high-probability trade signal triggers on your terminal, all entry levels, stop loss, take profit targets, and confluence factors will be instantly forwarded to this chat.`,
      ``,
      `⏱ <i>Timestamp: ${new Date().toLocaleTimeString()}</i>`
    ].join('\n');

    return await this.sendTelegram(testMsg, botToken, chatId);
  }

  async testWhatsApp(provider, phone, apiKey, webhookUrl) {
    const testMsg = [
      `🔔 *CRYPTO SCALPER PRO — WHATSAPP TEST* 🔔`,
      ``,
      `✅ WhatsApp alert integration is *ACTIVE & CONNECTED*!`,
      `Live scalper signals with Entry, Stop Loss, and Take Profit targets will be sent here automatically.`,
      ``,
      `⏱ _Timestamp: ${new Date().toLocaleTimeString()}_`
    ].join('\n');

    const customCfg = { provider, phone, apiKey, webhookUrl };
    return await this.sendWhatsApp(testMsg, { test: true }, customCfg);
  }

  // =========================================================================
  // 1-TAP DIRECT SHARING URLS
  // =========================================================================

  getShareUrls(sig, symbol, interval) {
    const waText = this.formatWhatsAppMessage(sig, symbol, interval);
    const tgText = this.formatWhatsAppMessage(sig, symbol, interval); // clean text for url sharing

    const currentUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
    
    return {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(waText)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(tgText)}`
    };
  }
}

// Global Singleton instance for browser and Node.js
if (typeof window !== 'undefined') {
  window.AlertService = AlertService;
  window.alertService = new AlertService();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AlertService;
}
