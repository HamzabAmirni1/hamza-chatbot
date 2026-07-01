const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  delay,
  Browsers,
  downloadMediaMessage,
  jidDecode,
  generateWAMessageFromContent,
  generateWAMessageContent,
  proto,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const axios = require("axios");
const chalk = require("chalk");
const readline = require("readline");
const path = require("path");
const dns = require("dns");
const config = require("./config");
const QRCode = require("qrcode");

// --- DNS FIX (Optional) ---
try {
  console.log(chalk.cyan("🔍 Initializing Core Dependencies..."));
  // dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1']);
} catch (e) { }

const { handleAutoDL } = require('./lib/autodl');
const {
  getContext,
  addToHistory,
  getAutoGPTResponse,
  getLuminAIResponse,
  getAIDEVResponse,
  getGeminiResponse,
  getPollinationsResponse,
  getOpenRouterResponse,
  getHFVision,
  getObitoAnalyze,
  getStableAIResponse,
  getBlackboxResponse,
  detectLanguage
} = require('./lib/ai');
const {
  readAntiCallState,
  writeAntiCallState,
  getUptime,
  sendWithChannelButton,
  getYupraVideoByUrl,
  getOkatsuVideoByUrl,
  logUser
} = require('./commands/lib/utils');
const { loadDuasData, saveDuasData, startDuasScheduler } = require("./lib/islamic");
const { startRamadanScheduler } = require("./lib/ramadanScheduler");
const { startPrayerScheduler } = require("./lib/prayerScheduler");
const { startFbPostScheduler } = require("./lib/fbScheduler");
const { startTelegramBot } = require("./lib/telegram");
const { handleFacebookMessage } = require("./lib/facebook");
const { startTrafficInterval, getStats: getTrafficStats } = require("./lib/trafficBooster");
const { ALL_COMMANDS, NLC_KEYWORDS, isQuestionOrInquiry, handleAutoDownload } = require('./lib/commandMap');
const { checkSubscriptionGate, getSubscriptionMessage, getWelcomeMessage } = require('./lib/subscription');

const bodyParser = require("body-parser");
const { Boom } = require("@hapi/boom");
const { db } = require("./lib/supabase");


// Store processed message IDs to prevent duplicates
const processedMessages = new Set();
const commandUsage = {};
const commandErrors = {};
const activeUsers = new Set();
const botUsersMap = {}; // { 'phoneNumber': Set(['userJid']) }

// Global state for Dashboard API
global.clients = [];
global.pendingPairingCodes = {};
global.lastPairingRequestTime = {};
global.pairingMode = {};
global.pairingCodeRequested = {};
global._activityLog = [];
global._cmdStats = {};
global._cmdStatsByPlatform = { whatsapp: {}, telegram: {}, facebook: {} };
global._activeBots = {};

// Banned list global state and database persistent sync
global.bannedUsersCache = [];
global.syncBannedList = async (list) => {
  global.bannedUsersCache = list;
  const bannedPath = path.join(__dirname, 'data', 'banned.json');
  try {
    fs.ensureDirSync(path.dirname(bannedPath));
    fs.writeFileSync(bannedPath, JSON.stringify(list, null, 2));
    await db.setCache('banned_users', list);
  } catch (e) {
    console.error('[Banned Users] Sync error:', e.message);
  }
};

(async () => {
  try {
    // Wait for Supabase initialization to complete if needed
    await new Promise(resolve => setTimeout(resolve, 3000));
    const cachedBans = await db.getCache('banned_users');
    const bannedPath = path.join(__dirname, 'data', 'banned.json');
    if (cachedBans && Array.isArray(cachedBans)) {
      global.bannedUsersCache = cachedBans;
      fs.ensureDirSync(path.dirname(bannedPath));
      fs.writeFileSync(bannedPath, JSON.stringify(cachedBans, null, 2));
    } else {
      if (fs.existsSync(bannedPath)) {
        global.bannedUsersCache = JSON.parse(fs.readFileSync(bannedPath, 'utf8') || '[]');
        await db.setCache('banned_users', global.bannedUsersCache);
      } else {
        global.bannedUsersCache = [];
      }
    }
    console.log(`[Banned Users] Initialized persistent banned list with ${global.bannedUsersCache.length} users.`);
  } catch (e) {
    console.error('[Banned Users] Init error:', e.message);
  }
})();


global.trackCommand = (command, platform) => {
  if (!global._cmdStats) global._cmdStats = {};
  if (!global._cmdStatsByPlatform) global._cmdStatsByPlatform = { whatsapp: {}, telegram: {}, facebook: {} };
  global._cmdStats[command] = (global._cmdStats[command] || 0) + 1;
  const plat = platform ? platform.toLowerCase() : 'whatsapp';
  if (!global._cmdStatsByPlatform[plat]) {
    global._cmdStatsByPlatform[plat] = {};
  }
  global._cmdStatsByPlatform[plat][command] = (global._cmdStatsByPlatform[plat][command] || 0) + 1;

  // Debounced save to Supabase (max 1 write per 60 seconds)
  if (!global._cmdStatsSaveTimer) {
    global._cmdStatsSaveTimer = setTimeout(() => {
      global._cmdStatsSaveTimer = null;
      db.saveCmdStats(global._cmdStats, global._cmdStatsByPlatform).catch(() => {});
    }, 60000);
  }
};

// ====== GOOGLE TTS HELPER ======
async function generateTTS(text, lang = 'ar') {
  try {
    const cleanText = text.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();
    if (!cleanText) return null;
    const baseUrl = 'https://www.google.com/speech-api/v2/synthesize';
    const key = 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';
    const params = {
      key,
      text: cleanText.slice(0, 300),
      lang: lang === 'en' ? 'en_US' : 'ar',
      enc: 'mpeg',
      client: 'chromium',
      speed: '0.5',
      pitch: '0.5',
    };
    const res = await axios.get(baseUrl, {
      params,
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    return Buffer.from(res.data);
  } catch (err) {
    console.error('[TTS Generation Error]:', err.message);
    return null;
  }
}
// ====== END GOOGLE TTS HELPER ======

global._activeUsers = activeUsers;
global._sysLog = []; // ring buffer for live monitoring

// ====== GLOBAL SYSLOG INTERCEPTOR ======
// Captures all console output into a ring buffer for the dashboard
(function patchConsole() {
  const ICONS = { log: '📋', error: '🔴', warn: '🟡', info: '🔵' };
  const _orig = { log: console.log.bind(console), error: console.error.bind(console), warn: console.warn.bind(console), info: console.info.bind(console) };
  function strip(s) { return typeof s === 'string' ? s.replace(/\x1B\[[0-9;]*m/g, '') : String(s); }
  ['log','error','warn','info'].forEach(level => {
    console[level] = (...args) => {
      _orig[level](...args);
      try {
        const msg = args.map(strip).join(' ');
        global._sysLog.unshift({ t: Date.now(), level, icon: ICONS[level] || '📋', msg: msg.slice(0, 300) });
        if (global._sysLog.length > 200) global._sysLog.length = 200;
      } catch(_) {}
    };
  });
})();
// ====== END SYSLOG INTERCEPTOR ======

const sessionBaseDir = path.join(__dirname, "sessions");
if (!fs.existsSync(sessionBaseDir)) fs.mkdirSync(sessionBaseDir, { recursive: true });

// Boot Sequence - Immediate
console.log(chalk.green("🚀 Starting Hamza Chatbot..."));

// Memory monitoring & Stats Sync (Throttled for Supabase)
setInterval(() => {
  const used = process.memoryUsage().rss / 1024 / 1024;
  if (used > 350) { // Adjusted for 500MB server
    console.log(chalk.red("⚠️ RAM too high (>350MB), restarting bot cleanly..."));
    process.exit(1);
  }
  
  // Throttle push to Supabase to every 2 minutes (120,000 ms)
  // This drastically reduces Disk IO budget depletion
  db.updateStats({
    total_users: activeUsers.size || getTrafficStats().visits || 0,
    messages_handled: (processedMessages.size + (getTrafficStats().impressions || 0)),
    ram_usage: `${Math.round(used)}MB`,
    top_commands: Object.entries(commandUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Limit top commands
      .map(([name, count]) => ({ name, count }))
  }).catch(() => {});
}, 120000); // 2 minutes interval

// Filter console logs to suppress Baileys noise
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

const silencePatterns = [
  "Bad MAC",
  "Session error",
  "Failed to decrypt",
  "Closing session",
  "Closing open session",
  "Conflict",
  "Stream Errored",
];

function shouldSilence(args) {
  const msg = args[0];
  if (typeof msg === "string")
    return silencePatterns.some((pattern) => msg.includes(pattern));
  return false;
}

console.error = (...args) => {
  if (!shouldSilence(args)) originalConsoleError.apply(console, args);
};
console.log = (...args) => {
  if (!shouldSilence(args)) originalConsoleLog.apply(console, args);
};
console.warn = (...args) => {
  if (!shouldSilence(args)) originalConsoleWarn.apply(console, args);
};
console.info = (...args) => {
  if (!shouldSilence(args)) originalConsoleInfo.apply(console, args);
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
app.use(bodyParser.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, 'media')));

// 🚀 Serve Dashboard or JSON status
app.get("/", (req, res) => {
  // Auto-detect public URL
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host;
  if (host && !host.includes("127.0.0.1") && !host.includes("localhost")) {
    const detectedUrl = `${protocol}://${host}`;
    if (!config.publicUrl || config.publicUrl.includes("available-karena") || config.publicUrl.includes("rolling-cherianne") || config.publicUrl !== detectedUrl) {
      config.publicUrl = detectedUrl;
      console.log(chalk.green(`✨ Auto-Detected Public URL: ${config.publicUrl}`));
      try { fs.writeFileSync(path.join(__dirname, "server_url.json"), JSON.stringify({ url: detectedUrl })); } catch (e) {}
      if (db && db.setCache) {
        db.setCache("public_url", detectedUrl).catch(err => console.error("Failed to cache public URL in Supabase:", err));
      }
    }
  }
  // Serve dashboard to browsers
  const accept = req.headers['accept'] || '';
  if (accept.includes('text/html')) {
    const dashPath = path.join(__dirname, 'public/index.html');
    if (fs.existsSync(dashPath)) return res.sendFile(dashPath);
  }
  res.json({ bot: config.botName, status: "running", uptime: getUptime(), timestamp: new Date().toISOString(), memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB` });
});

app.get("/health", (req, res) => res.status(200).json({ status: "healthy", uptime: getUptime() }));
app.get("/ping", (req, res) => res.status(200).json({ ok: true, ts: Date.now() }));
app.get("/", (req, res) => res.status(200).json({ bot: config.botName, status: "running", uptime: getUptime() }));

// ── Temporary Media Store ──────────────────────────────────────────────────
// Stores media buffers in memory so Facebook can fetch them from our public URL.
// Each entry auto-expires after 15 minutes.
global._tempMedia = global._tempMedia || new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of global._tempMedia) {
    if (now - entry.ts > 15 * 60 * 1000) global._tempMedia.delete(key);
  }
}, 5 * 60 * 1000);

// Public endpoint — Facebook fetches the media from here
app.get('/media/:key', (req, res) => {
  const entry = global._tempMedia.get(req.params.key);
  if (!entry) return res.status(404).send('Not found');
  res.set('Content-Type', entry.mime);
  res.set('Cache-Control', 'no-store');
  res.send(entry.buffer);
});

// Helper used by facebook.js to store a buffer and get a public URL
global.storeTempMedia = function(buffer, mime) {
  const key = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  global._tempMedia.set(key, { buffer, mime, ts: Date.now() });
  const base = (config.publicUrl || '').replace(/\/$/, '');
  return `${base}/media/${key}`;
};


// Enable CORS for Dashboard
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// 📊 Get Bot Stats with Per-Bot counts
app.get("/stats", async (req, res) => {
  const stats = await db.getStats();
  const traffic = getTrafficStats();
  const botCounts = {};
  Object.entries(botUsersMap).forEach(([phone, set]) => {
    botCounts[phone] = set.size;
  });
  
  res.status(200).json({ 
    ...stats, 
    visits: traffic.visits || 0,
    impressions: traffic.impressions || 0,
    bot_user_counts: botCounts // { 'phoneNumber': count }
  });
});

// 🗑️ Delete WhatsApp Session
app.post("/delete-wa", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Missing phone" });
  const success = await db.deleteWhatsAppSession(phone);
  res.status(success ? 200 : 500).json({ success });
});

// ⚙️ Update Bot Config (Manual Tokens)
app.post("/update-config", async (req, res) => {
  const { id, bot_token, bot_name } = req.body;
  if (!id) return res.status(400).json({ error: "Missing ID" });
  const success = await db.updateBotConfig(id, { bot_token, bot_name });
  res.status(success ? 200 : 500).json({ success });
});

// 🔗 Trigger New WhatsApp Connection
app.post("/connect-wa", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  console.log(chalk.cyan(`🚀 Starting new WA connection for: ${cleanPhone}`));
  await db.updateWhatsAppAuth(cleanPhone, null);
  
  const fName = `session_wa_${cleanPhone}`;
  if (global._activeBots) {
    global._activeBots[fName] = false;
  }
  const existingClient = (global.clients || []).find(c => c._folderName === fName);
  if (existingClient) {
    try {
      existingClient.ev.removeAllListeners();
      existingClient.logout();
    } catch (_) {}
  }
  global.clients = (global.clients || []).filter(c => c._folderName !== fName);

  startBot(fName, cleanPhone);
  res.json({ status: "initiated", message: "Bot starting, wait for pairing code in Dashboard." });
});

// ========== DASHBOARD API ROUTES ==========
const AUTH_TOKEN = process.env.DASHBOARD_TOKEN || 'hamza-auth-token-2005';

app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  const authHeader = req.headers['authorization'];
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      if (k && k.trim()) acc[k.trim()] = v;
      return acc;
    }, {});
    token = cookies['auth_token'];
  }
  if (token === AUTH_TOKEN) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'hamza' && password === '2005') {
    res.json({ success: true, token: AUTH_TOKEN });
  } else {
    res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
});

app.post('/api/log-client-error', (req, res) => {
  console.error('❌ [Client Error Logged]:', req.body);
  res.json({ ok: true });
});

app.get('/api/status', async (req, res) => {
  try {
    const sessions = (global.clients || []).map(sock => {
      const user = sock?.user;
      const cleanPhone = (user?.id?.split(':')[0] || sock._num || '').replace(/[^0-9]/g, '');
      const isPaused = !!(global.pausedBots?.whatsapp?.[cleanPhone]);
      return {
        jid: user?.id || null,
        number: user?.id?.split(':')[0] || sock._num || null,
        connected: !!user,
        path: sock._folderName || null,
        paused: isPaused
      };
    });
    
    // Fetch Telegram/Facebook configs from DB
    const configs = await db.getBotConfigs();
    const telegramBots = configs.filter(c => c.bot_type === 'telegram').map(c => {
      const isPaused = !!(global.pausedBots?.telegram?.[c.bot_token]);
      return {
        id: c.id,
        name: c.bot_name,
        connected: !!(global.telegramBots && global.telegramBots[c.bot_token]) || (c.bot_token === config.telegramToken && !!global.telegramBot),
        token: c.bot_token ? `${c.bot_token.substring(0, 8)}...` : 'N/A',
        paused: isPaused
      };
    });
    const facebookPages = configs.filter(c => c.bot_type === 'facebook').map(c => {
      const parts = c.bot_name.split('|');
      const pageId = parts[parts.length - 1].trim();
      const pageName = parts[0] === pageId ? 'Facebook Page' : parts[0];
      const isPaused = !!(global.pausedBots?.facebook?.[pageId]);
      return {
        id: c.id,
        name: pageName,
        pageId: pageId,
        connected: true,
        token: c.bot_token ? `${c.bot_token.substring(0, 8)}...` : 'N/A',
        paused: isPaused
      };
    });
    
    // Add local config defaults if not already present
    if (config.telegramToken) {
      const isLocalTgPaused = !!(global.pausedBots?.telegram?.[config.telegramToken]);
      const existing = telegramBots.find(b => b.token.startsWith(config.telegramToken.substring(0, 8)));
      if (existing) {
        existing.paused = isLocalTgPaused;
      } else {
        telegramBots.push({
          id: 'local_tg',
          name: config.botName || 'Telegram Bot (محلي)',
          connected: !!global.telegramBot,
          token: `${config.telegramToken.substring(0, 8)}...`,
          paused: isLocalTgPaused
        });
      }
    }
    if (config.fbPageAccessToken) {
      const localPageId = config.fbPageId || 'me';
      const isLocalFbPaused = !!(global.pausedBots?.facebook?.[localPageId]);
      const existing = facebookPages.find(p => p.token.startsWith(config.fbPageAccessToken.substring(0, 8)));
      if (existing) {
        existing.paused = isLocalFbPaused;
      } else {
        facebookPages.push({
          id: 'local_fb',
          name: 'Facebook Page (محلي)',
          pageId: localPageId,
          connected: true,
          token: `${config.fbPageAccessToken.substring(0, 8)}...`,
          paused: isLocalFbPaused
        });
      }
    }
    
    const traffic = getTrafficStats();
    res.json({
      ok: true,
      sessions,
      telegramBots,
      facebookPages,
      commandCount: Object.keys(require('./lib/commandMap').ALL_COMMANDS).length || 566,
      apkLimit: config.apkLimit || 5,
      visits: traffic.visits || 0,
      impressions: traffic.impressions || 0,
      settings: {
        botName: config.botName, botOwner: config.botOwner, prefix: config.prefix,
        commandMode: config.commandMode, timezone: config.timezone,
        pairingNumber: config.pairingNumber, version: config.version
      }
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/connect-tg', async (req, res) => {
  try {
    const { token, name } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token is required' });
    
    // Insert into DB config
    const record = await db.insertBotConfig({
      bot_token: token,
      bot_name: name || 'Telegram Bot',
      bot_type: 'telegram'
    });
    
    if (record) {
      // Start bot in memory
      const { startTelegramBot } = require('./lib/telegram');
      startTelegramBot(token);
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: 'فشل حفظ الإعدادات في قاعدة البيانات' });
    }
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/connect-fb', async (req, res) => {
  try {
    const { token, name, pageId } = req.body;
    if (!token || !pageId) return res.status(400).json({ success: false, error: 'Page Token and Page ID are required' });
    
    // Store pageId in bot_name (PageName|PageID format)
    const formattedName = `${name || 'Facebook Page'}|${pageId}`;
    
    const record = await db.insertBotConfig({
      bot_token: token,
      bot_name: formattedName,
      bot_type: 'facebook'
    });
    
    if (record) {
      // Register in memory
      global.fbPageTokens = global.fbPageTokens || {};
      global.fbPageTokens[pageId] = token;
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: 'فشل حفظ الإعدادات في قاعدة البيانات' });
    }
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/delete-config', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID is required' });
    
    // Find record first to clean up memory
    const configs = await db.getBotConfigs();
    const configRecord = configs.find(c => c.id === id);
    if (configRecord && configRecord.bot_type === 'facebook') {
      const parts = configRecord.bot_name.split('|');
      const pageId = parts[parts.length - 1].trim();
      if (global.fbPageTokens) delete global.fbPageTokens[pageId];
    }
    
    const success = await db.deleteBotConfig(id);
    res.json({ success });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/delete-wa', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone is required' });
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const folderName = `session_wa_${cleanPhone}`;
    
    // Disconnect active socket (matching by folder name OR resolved phone number)
    const activeClient = (global.clients || []).find(c => {
      const cNum = (c._num || (c.user?.id?.split(':')[0]) || '').replace(/[^0-9]/g, '');
      return c._folderName === folderName || (cNum && cNum === cleanPhone);
    });
    
    const realFolder = activeClient?._folderName || folderName;
    if (activeClient) { try { activeClient.end(); } catch (e) {} }
    global.clients = (global.clients || []).filter(c => c._folderName !== realFolder);
    
    // Delete session from DB and file system
    const success = await db.deleteWhatsAppSession(cleanPhone);
    const sessionPath = path.join(__dirname, 'sessions', realFolder);
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    
    res.json({ success });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ♻️ Reconnect WhatsApp: kills old socket, wipes local session files, starts fresh for pairing
app.post('/api/reconnect-wa', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone is required' });
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const folderName = `session_wa_${cleanPhone}`;
    
    // Kill existing socket for this number
    const activeClient = (global.clients || []).find(c => c._folderName === folderName);
    if (activeClient) {
      try { activeClient.end(); } catch (e) {}
      global.clients = (global.clients || []).filter(c => c._folderName !== folderName);
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Wipe local session files (so Baileys starts fresh without stale keys)
    const sessionPath = path.join(__dirname, 'sessions', folderName);
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    
    // Clear Supabase session data (but keep the record so pairing works)
    await db.updateWhatsAppSession(cleanPhone, null);
    await db.updatePairingCode(cleanPhone, null, 'disconnected');
    
    // Reset pairing globals
    delete (global.pendingPairingCodes || {})[cleanPhone];
    if (global.pairingMode) delete global.pairingMode[folderName];
    if (global.pairingCodeRequested) delete global.pairingCodeRequested[folderName];
    if (global.lastPairingRequestTime) delete global.lastPairingRequestTime[folderName];
    
    // Start fresh bot (will wait for pairing code request from dashboard)
    global.pairingMode = global.pairingMode || {};
    global.pairingMode[folderName] = true;
    startBot(folderName, cleanPhone).catch(err => console.error(`[API/Reconnect] Error:`, err.message));
    
    // Wait up to 30s for pairing code to be generated
    let attempts = 0;
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 500));
      if (global.pendingPairingCodes[cleanPhone]) {
        const { code } = global.pendingPairingCodes[cleanPhone];
        return res.json({ success: true, code, number: cleanPhone });
      }
      attempts++;
    }
    return res.status(504).json({ success: false, error: 'انتهت مهلة طلب الكود. يرجى المحاولة مرة أخرى.' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ⏸️ Toggle Pause Bot (WhatsApp, Telegram, Facebook)
app.post('/api/bots/toggle-pause', async (req, res) => {
  try {
    const { platform, id } = req.body;
    if (!platform || !id) return res.status(400).json({ success: false, error: 'Platform and ID are required' });

    global.pausedBots = global.pausedBots || { whatsapp: {}, telegram: {}, facebook: {} };
    if (!global.pausedBots[platform]) global.pausedBots[platform] = {};

    let targetKey = id;

    if (platform === 'telegram') {
      if (id === 'local_tg') {
        targetKey = config.telegramToken;
      } else {
        const configs = await db.getBotConfigs();
        const conf = configs.find(c => c.id.toString() === id.toString());
        if (conf && conf.bot_token) {
          targetKey = conf.bot_token;
        }
      }
    } else if (platform === 'facebook') {
      if (id === 'local_fb') {
        targetKey = config.fbPageId || 'me';
      } else {
        const configs = await db.getBotConfigs();
        const conf = configs.find(c => c.id.toString() === id.toString());
        if (conf && conf.bot_name) {
          const parts = conf.bot_name.split('|');
          targetKey = parts[parts.length - 1].trim();
        }
      }
    } else if (platform === 'whatsapp') {
      targetKey = id.replace(/[^0-9]/g, '');
    }

    if (!targetKey) {
      return res.status(404).json({ success: false, error: 'Bot configuration not found' });
    }

    const isCurrentlyPaused = !!global.pausedBots[platform][targetKey];
    global.pausedBots[platform][targetKey] = !isCurrentlyPaused;

    // Save configuration to Supabase cache
    await db.setCache('paused_bots', global.pausedBots);

    console.log(`[Pause/Resume] ${platform} bot (${targetKey.substring(0, 15)}) set to paused: ${!isCurrentlyPaused}`);

    res.json({ success: true, isPaused: !isCurrentlyPaused });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/settings', (req, res) => {
  try {
    const c = require('./config');
    res.json({ ...c, apkLimit: c.apkLimit || 5 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config.js');
    let src = fs.readFileSync(configPath, 'utf-8');
    const strFields = [
      'botName','botOwner','prefix','commandMode','timezone','pairingNumber',
      'AUTO_STATUS_REACT','AUTO_STATUS_REPLY','AUTO_STATUS_MSG','AUTORECORD','AUTOTYPE','AUTORECORDTYPE',
      'instagram','instagram2','instagramChannel','facebook','facebookPage','youtube','telegram',
      'waGroups','portfolio','officialChannel','packname','author','newsletterName','newsletterJid',
      'giphyApiKey','hfToken','supabaseUrl','supabaseKey','telegramToken','fbPageAccessToken','fbPageId','description',
      'enableNewsAutoPoster', 'enableTrafficBooster', 'trafficIntervalMinutes', 'enableChatbot', 'enableGroupChatbot',
      'enablePrayerScheduler', 'enableDuasScheduler', 'enableRamadanScheduler', 'enableGithubAutoPoster', 'enableAutoDL', 'enableTTS'
    ];
    const arrFields = ['ownerNumber','extraNumbers', 'trafficUrls'];
    for (const key of strFields) {
      if (req.body[key] !== undefined) {
        const val = String(req.body[key]).replace(/'/g, "\\'");
        src = src.replace(new RegExp(`(^\\s*${key}\\s*:\\s*)(.+?)(,?\\s*$)`, 'm'), `$1'${val}'$3`);
      }
    }
    for (const key of arrFields) {
      if (req.body[key] !== undefined && Array.isArray(req.body[key])) {
        src = src.replace(new RegExp(`(${key}\\s*:\\s*)\\[[^\\]]*\\]`), `$1${JSON.stringify(req.body[key])}`);
      }
    }
    fs.writeFileSync(configPath, src, 'utf-8');
    // Update in-memory config
    const currentConfig = require('./config');
    for (const key of strFields) { if (req.body[key] !== undefined) currentConfig[key] = req.body[key]; }
    for (const key of arrFields) { if (req.body[key] !== undefined && Array.isArray(req.body[key])) currentConfig[key] = req.body[key]; }
    delete require.cache[require.resolve('./config')];
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/apk-limit', (req, res) => {
  try {
    const limit = parseInt(req.body.limit);
    if (isNaN(limit) || limit < 1 || limit > 100) return res.status(400).json({ success: false, error: 'قيمة غير صالحة' });
    const configPath = path.join(__dirname, 'config.js');
    let src = fs.readFileSync(configPath, 'utf-8');
    if (src.includes('apkLimit:')) { src = src.replace(/(apkLimit\s*:\s*)(\d+)/, `$1${limit}`); }
    else { src = src.replace(/(const settings = \{)/, `$1\n  apkLimit: ${limit},`); }
    fs.writeFileSync(configPath, src, 'utf-8');
    try { const c = require('./config'); c.apkLimit = limit; } catch (e) {}
    delete require.cache[require.resolve('./config')];
    res.json({ success: true, limit });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/pair', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number || !/^\d{10,15}$/.test(number)) return res.status(400).json({ success: false, error: 'رقم غير صالح' });
    const cleanNumber = number.replace(/[^0-9]/g, '');
    const folderName = `session_wa_${cleanNumber}`;

    // ✅ Kill any existing socket for this number FIRST (prevents race condition)
    const existingClient = (global.clients || []).find(c => c._folderName === folderName);
    if (existingClient) {
      try { existingClient.end(); } catch (e) {}
      global.clients = (global.clients || []).filter(c => c._folderName !== folderName);
      await new Promise(r => setTimeout(r, 2000)); // Wait for socket to fully close
    }

    // Reset pairing code and throttle timer so it's forced fresh
    delete global.pendingPairingCodes[cleanNumber];
    if (global.lastPairingRequestTime) delete global.lastPairingRequestTime[folderName];
    if (global.pairingCodeRequested) delete global.pairingCodeRequested[folderName];

    // ✅ Mark as pairing-mode (suppress auto-reconnect while waiting)
    global.pairingMode = global.pairingMode || {};
    global.pairingMode[folderName] = true;

    startBot(folderName, cleanNumber).catch(err => console.error(`[API/Pair] Error:`, err.message));
    let attempts = 0;
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 500));
      if (global.pendingPairingCodes[cleanNumber]) {
        const { code } = global.pendingPairingCodes[cleanNumber];
        return res.json({ success: true, code, number: cleanNumber });
      }
      attempts++;
    }
    return res.status(504).json({ success: false, error: 'انتهت مهلة طلب الكود. يرجى المحاولة مرة أخرى.' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/pair-cancel', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ success: false, error: 'رقم مطلوب' });
    const cleanNumber = number.replace(/[^0-9]/g, '');
    const folderName = `session_wa_${cleanNumber}`;
    const activeClient = (global.clients || []).find(c => c._folderName === folderName);
    if (activeClient) { try { activeClient.end(); } catch (e) {} }
    global.clients = (global.clients || []).filter(c => c._folderName !== folderName);
    delete global.pendingPairingCodes[cleanNumber];
    if (global.pairingMode) delete global.pairingMode[folderName];
    if (global.pairingCodeRequested) delete global.pairingCodeRequested[folderName];
    if (global.lastPairingRequestTime) delete global.lastPairingRequestTime[folderName];
    const sessionPath = path.join(__dirname, 'sessions', folderName);
    const credsFile = path.join(sessionPath, 'creds.json');
    let isRegistered = false;
    if (fs.existsSync(credsFile)) { try { const c = JSON.parse(fs.readFileSync(credsFile,'utf-8')); isRegistered = !!c.registered; } catch (e) {} }
    if (!isRegistered && fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 📱 QR Code Connection Endpoints
app.post('/api/qr-start', async (req, res) => {
  try {
    const qrId = `session_wa_qr_${Date.now()}`;
    global.pendingQrs = global.pendingQrs || {};
    global.pendingQrs[qrId] = null;
    
    startBot(qrId, null).catch(err => console.error(`[API/QR-Start] Error:`, err.message));
    res.json({ success: true, id: qrId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/qr-status', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'ID is required' });
    
    const client = (global.clients || []).find(c => c._folderName === id);
    if (client && client.user) {
      const phone = (client.user.id.split('@')[0].split(':')[0] || client._num || '').replace(/[^0-9]/g, '');
      return res.json({ success: true, status: 'connected', phone });
    }
    
    const qr = global.pendingQrs ? global.pendingQrs[id] : null;
    if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 250 });
      return res.json({ success: true, status: 'qr', qr: qrDataUrl });
    }
    
    if (client) {
      return res.json({ success: true, status: 'waiting' });
    }
    
    res.json({ success: true, status: 'closed' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/qr-cancel', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID is required' });
    
    const activeClient = (global.clients || []).find(c => c._folderName === id);
    if (activeClient) { try { activeClient.end(); } catch (e) {} }
    global.clients = (global.clients || []).filter(c => c._folderName !== id);
    if (global.pendingQrs) delete global.pendingQrs[id];
    
    const sessionPath = path.join(__dirname, 'sessions', id);
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/restart', (req, res) => {
  res.json({ success: true, message: 'جاري إعادة التشغيل...' });
  setTimeout(() => process.exit(0), 500);
});

function getPlatformFromJid(jid) {
  if (!jid) return 'whatsapp';
  if (jid.startsWith('tg:')) return 'telegram';
  if (jid.startsWith('fb:')) return 'facebook';
  if (jid.includes('@')) return 'whatsapp';
  if (/^\d+$/.test(jid)) {
    return jid.length >= 15 ? 'facebook' : 'telegram';
  }
  return 'whatsapp';
}

// ============================================================
// /api/bot-subscribers — Per-bot user list with full details
// ============================================================
app.get('/api/bot-subscribers', async (req, res) => {
  try {
    const DATA_DIR = path.join(__dirname, 'data');
    let banned = [];
    try { banned = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'banned.json'), 'utf-8') || '[]'); } catch (_) {}

    // 1. Fetch all users from Supabase
    const rows = await db.getAllUsers();

    // Build clean user objects per platform
    const seenWa = new Set(), seenTg = new Set(), seenFb = new Set();
    const waUsers = [], tgUsers = [], fbUsers = [];

    const sortedRows = [...rows].sort((a, b) => {
      const aP = (a.jid || '').startsWith('tg:') || (a.jid || '').startsWith('fb:') ? 0 : 1;
      const bP = (b.jid || '').startsWith('tg:') || (b.jid || '').startsWith('fb:') ? 0 : 1;
      return aP - bP;
    });

    for (const u of sortedRows) {
      if (!u.jid) continue;
      if (u.jid.startsWith('names:') || u.jid.startsWith('cache:')) continue;
      const platform = getPlatformFromJid(u.jid);
      const cleanId = u.jid.replace('tg:', '').replace('fb:', '').split('@')[0];

      if (platform === 'telegram') {
        if (seenTg.has(cleanId)) continue; seenTg.add(cleanId);
        tgUsers.push({ id: cleanId, name: (global.tgNames && global.tgNames[cleanId]) || '', platform, lastSeen: u.updated_at, jid: u.jid, banned: banned.includes(`tg:${cleanId}`) });
      } else if (platform === 'facebook') {
        if (seenFb.has(cleanId)) continue; seenFb.add(cleanId);
        fbUsers.push({ id: cleanId, name: (global.fbNames && global.fbNames[cleanId]) || '', platform, lastSeen: u.updated_at, jid: u.jid, banned: banned.includes(`fb:${cleanId}`) });
      } else {
        const waKey = u.jid.split('@')[0];
        if (seenWa.has(waKey)) continue; seenWa.add(waKey);
        waUsers.push({ id: waKey, name: (global.waNames && global.waNames[waKey]) || '', platform: 'whatsapp', lastSeen: u.updated_at, jid: u.jid, banned: banned.includes(u.jid) || banned.includes(`${waKey}@s.whatsapp.net`) });
      }
    }

    // 2. Build bot list
    const configs = await db.getBotConfigs();

    // WhatsApp bots — one entry per active session
    const waBots = (global.clients || []).map(sock => {
      const user = sock?.user;
      const num = (user?.id?.split(':')[0] || sock._num || '').replace(/[^0-9]/g, '');
      return {
        id: `wa_${num}`,
        name: num ? `WhatsApp +${num}` : 'WhatsApp Bot',
        platform: 'whatsapp',
        number: num,
        connected: !!user,
        users: waUsers,
        userCount: waUsers.length
      };
    });

    // Telegram bots
    const tgBots = configs.filter(c => c.bot_type === 'telegram').map(c => ({
      id: `tg_${c.id}`,
      name: c.bot_name || 'Telegram Bot',
      platform: 'telegram',
      token: c.bot_token,
      connected: !!(global.telegramBots && global.telegramBots[c.bot_token]),
      users: tgUsers,
      userCount: tgUsers.length
    }));
    // Add local TG if not in DB
    if (config.telegramToken && !tgBots.some(b => b.token === config.telegramToken)) {
      tgBots.push({ id: 'local_tg', name: config.botName || 'Telegram Bot', platform: 'telegram', token: config.telegramToken, connected: !!global.telegramBot, users: tgUsers, userCount: tgUsers.length });
    }

    // Facebook bots
    const fbBots = configs.filter(c => c.bot_type === 'facebook').map(c => {
      const parts = (c.bot_name || '').split('|');
      const pageId = parts[parts.length - 1].trim();
      const pageName = parts[0] === pageId ? 'Facebook Page' : parts[0];
      return { id: `fb_${c.id}`, name: pageName || 'Facebook Bot', platform: 'facebook', pageId, connected: true, users: fbUsers, userCount: fbUsers.length };
    });
    // Add local FB config if not already in DB
    if (config.fbPageAccessToken) {
      const localPageId = config.fbPageId || 'me';
      if (!fbBots.some(b => b.pageId === localPageId)) {
        fbBots.push({ id: 'local_fb', name: 'Facebook Page (محلي)', platform: 'facebook', pageId: localPageId, connected: true, users: fbUsers, userCount: fbUsers.length });
      }
    }

    // Fallback: if no WA bots connected but users exist, show one aggregate WA bot
    if (waBots.length === 0) {
      waBots.push({ id: 'wa_all', name: 'WhatsApp Bot', platform: 'whatsapp', connected: false, users: waUsers, userCount: waUsers.length });
    }

    res.json({ ok: true, bots: [...waBots, ...tgBots, ...fbBots] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// /api/bot-stats/:platform — Detailed stats for a specific bot
// ============================================================
app.get('/api/bot-stats/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const DATA_DIR = path.join(__dirname, 'data');
    let banned = [];
    try { banned = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'banned.json'), 'utf-8') || '[]'); } catch (_) {}

    const rows = await db.getAllUsers();
    const now = Date.now();
    const DAY7 = 7 * 24 * 60 * 60 * 1000;
    const DAY1 = 24 * 60 * 60 * 1000;

    const seenIds = new Set();
    const users = [];

    for (const u of rows) {
      if (!u.jid) continue;
      if (u.jid.startsWith('names:') || u.jid.startsWith('cache:')) continue;
      const plat = getPlatformFromJid(u.jid);
      if (plat !== platform) continue;
      const cleanId = u.jid.replace('tg:', '').replace('fb:', '').split('@')[0];
      if (seenIds.has(cleanId)) continue;
      seenIds.add(cleanId);
      let name = '';
      if (platform === 'telegram') name = (global.tgNames && global.tgNames[cleanId]) || '';
      else if (platform === 'facebook') name = (global.fbNames && global.fbNames[cleanId]) || '';
      else name = (global.waNames && global.waNames[cleanId]) || '';
      const isBanned = banned.includes(u.jid) || banned.includes(`${cleanId}@s.whatsapp.net`) || banned.includes(`tg:${cleanId}`) || banned.includes(`fb:${cleanId}`);
      const lastSeenTs = u.updated_at ? new Date(u.updated_at).getTime() : 0;
      users.push({ id: cleanId, name, platform, lastSeen: u.updated_at, lastSeenTs, jid: u.jid, banned: isBanned });
    }

    const total = users.length;
    const active7d = users.filter(u => u.lastSeenTs && (now - u.lastSeenTs) < DAY7).length;
    const active24h = users.filter(u => u.lastSeenTs && (now - u.lastSeenTs) < DAY1).length;
    const banned_count = users.filter(u => u.banned).length;

    // Daily activity for chart (last 14 days)
    const dailyActivity = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = now - (i + 1) * DAY1;
      const dayEnd = now - i * DAY1;
      const count = users.filter(u => u.lastSeenTs >= dayStart && u.lastSeenTs < dayEnd).length;
      const d = new Date(dayEnd);
      dailyActivity.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, count });
    }

    // Top commands for this platform
    const platformCmdStats = (global._cmdStatsByPlatform && global._cmdStatsByPlatform[platform]) || {};
    const topCommands = Object.entries(platformCmdStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cmd, count]) => ({ cmd, count }));

    // Most recent 20 users (sorted by lastSeen desc)
    const recentUsers = [...users].sort((a, b) => (b.lastSeenTs || 0) - (a.lastSeenTs || 0)).slice(0, 50);

    res.json({ ok: true, total, active7d, active24h, banned_count, dailyActivity, topCommands, recentUsers });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const DATA_DIR = path.join(__dirname, 'data');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    let banned = [];
    try { banned = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'banned.json'), 'utf-8') || '[]'); } catch (e) {}

    // Fetch all users from Supabase
    const rows = await db.getAllUsers();
    
    const mappedWa = [];
    const mappedTg = [];
    const mappedFb = [];
    // Track seen IDs to deduplicate (rows with and without tg:/fb: prefix)
    const seenWa = new Set();
    const seenTg = new Set();
    const seenFb = new Set();

    // Sort rows so prefixed JIDs (tg:, fb:) are processed first — they are canonical
    const sortedRows = [...rows].sort((a, b) => {
      const aHasPrefix = (a.jid || '').startsWith('tg:') || (a.jid || '').startsWith('fb:') ? 0 : 1;
      const bHasPrefix = (b.jid || '').startsWith('tg:') || (b.jid || '').startsWith('fb:') ? 0 : 1;
      return aHasPrefix - bHasPrefix;
    });

    for (const u of sortedRows) {
      if (!u.jid) continue;
      // Skip internal rows (names cache, etc.)
      if (u.jid.startsWith('names:') || u.jid.startsWith('cache:')) continue;
      const platform = getPlatformFromJid(u.jid);
      const cleanId = u.jid.replace('tg:', '').replace('fb:', '').split('@')[0];
      let name = '';
      if (platform === 'telegram') {
        if (seenTg.has(cleanId)) continue; // skip duplicate
        seenTg.add(cleanId);
        name = (global.tgNames && global.tgNames[cleanId]) || '';
      } else if (platform === 'facebook') {
        if (seenFb.has(cleanId)) continue; // skip duplicate
        seenFb.add(cleanId);
        name = (global.fbNames && global.fbNames[cleanId]) || '';
      } else if (platform === 'whatsapp') {
        const waKey = u.jid.split('@')[0];
        if (seenWa.has(waKey)) continue; // skip duplicate
        seenWa.add(waKey);
        name = (global.waNames && global.waNames[waKey]) || '';
      }

      const userObj = {
        id: cleanId,
        name,
        platform,
        lastSeen: u.updated_at
      };

      if (platform === 'whatsapp') {
        mappedWa.push(userObj);
      } else if (platform === 'telegram') {
        mappedTg.push(userObj);
      } else if (platform === 'facebook') {
        mappedFb.push(userObj);
      }
    }

    const allUsers = [...mappedWa, ...mappedTg, ...mappedFb];
    const activeCount = global._activeUsers ? global._activeUsers.size : 0;

    res.json({
      ok: true,
      users: allUsers,
      waCount: mappedWa.length,
      tgCount: mappedTg.length,
      fbCount: mappedFb.length,
      total: allUsers.length,
      banned,
      activeCount
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/ban', async (req, res) => {
  try {
    const { number, platform } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'رقم مطلوب' });
    
    let jid = '';
    const cleanNum = number.trim();
    const plat = platform || 'whatsapp';
    if (plat === 'telegram') {
      jid = `tg:${cleanNum}`;
    } else if (plat === 'facebook') {
      jid = `fb:${cleanNum}`;
    } else {
      jid = cleanNum.includes('@') ? cleanNum : `${cleanNum}@s.whatsapp.net`;
    }
    
    let banned = [...(global.bannedUsersCache || [])];
    if (!banned.includes(jid)) {
      banned.push(jid);
      await global.syncBannedList(banned);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/unban', async (req, res) => {
  try {
    const { number, platform } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'رقم مطلوب' });
    
    let jid = '';
    const cleanNum = number.trim();
    const plat = platform || 'whatsapp';
    if (plat === 'telegram') {
      jid = `tg:${cleanNum}`;
    } else if (plat === 'facebook') {
      jid = `fb:${cleanNum}`;
    } else {
      jid = cleanNum.includes('@') ? cleanNum : `${cleanNum}@s.whatsapp.net`;
    }
    
    let banned = [...(global.bannedUsersCache || [])];
    banned = banned.filter(b => b !== jid && b !== cleanNum && b !== `tg:${cleanNum}` && b !== `fb:${cleanNum}`);
    await global.syncBannedList(banned);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});


app.post('/api/delete-all-users', async (req, res) => {
  try {
    const success = await db.deleteAllUsers();
    if (success) {
      if (global._activeUsers) global._activeUsers.clear();
      res.json({ ok: true });
    } else {
      res.status(500).json({ ok: false, error: 'فشل حذف المستخدمين' });
    }
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/delete-user', async (req, res) => {
  try {
    const { number, platform } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'رقم مطلوب' });
    
    let jid = '';
    const cleanNum = number.trim();
    const plat = platform || 'whatsapp';
    if (plat === 'telegram') {
      jid = `tg:${cleanNum}`;
    } else if (plat === 'facebook') {
      jid = `fb:${cleanNum}`;
    } else {
      jid = cleanNum.includes('@') ? cleanNum : `${cleanNum}@s.whatsapp.net`;
    }
    
    const success = await db.deleteUser(jid);
    if (success) {
      if (global._activeUsers) global._activeUsers.delete(jid);
      res.json({ ok: true });
    } else {
      res.status(500).json({ ok: false, error: 'فشل حذف المستخدم' });
    }
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { number, platform, message, mediaBase64, mediaType, mediaName, caption, ptt } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'الرقم أو المعرف مطلوب' });
    if (!message && !mediaBase64) return res.status(400).json({ ok: false, error: 'الرسالة أو الملف مطلوب' });

    const plat = (platform || 'whatsapp').toLowerCase();
    const cleanNum = number.trim();

    // Convert base64 to Buffer if media provided
    const mediaBuffer = mediaBase64 ? Buffer.from(mediaBase64, 'base64') : null;
    const msgCaption = caption || message || '';
    const fileName = mediaName || 'file';

    // Determine media category
    const isImage = mediaType && mediaType.startsWith('image/');
    const isAudio = mediaType && (mediaType.startsWith('audio/') || mediaType === 'video/ogg');
    const isVideo = mediaType && mediaType.startsWith('video/') && !isAudio;
    const isDoc = mediaBuffer && !isImage && !isAudio && !isVideo;

    console.log('[Send Message API Request]:', {
      number,
      platform: plat,
      messageLength: message?.length,
      hasMediaBuffer: !!mediaBuffer,
      mediaType,
      mediaName
    });

    if (plat === 'whatsapp') {
      const clients = global.clients || [];
      const sock = clients.find(c => c?.user) || clients[0];
      if (!sock) return res.status(500).json({ ok: false, error: 'لا يوجد جلسة واتساب نشطة حالياً' });

      const jid = cleanNum.includes('@') ? cleanNum : `${cleanNum}@s.whatsapp.net`;

      if (mediaBuffer) {
        if (isImage) {
          await sock.sendMessage(jid, { image: mediaBuffer, caption: msgCaption, mimetype: mediaType });
        } else if (isAudio) {
          await sock.sendMessage(jid, { audio: mediaBuffer, mimetype: mediaType, ptt: !!ptt });
          if (message) await sock.sendMessage(jid, { text: message });
        } else if (isVideo) {
          await sock.sendMessage(jid, { video: mediaBuffer, caption: msgCaption, mimetype: mediaType });
        } else {
          await sock.sendMessage(jid, { document: mediaBuffer, fileName: fileName, mimetype: mediaType || 'application/octet-stream', caption: msgCaption });
        }
      } else {
        await sock.sendMessage(jid, { text: message });
      }
      return res.json({ ok: true });

    } else if (plat === 'telegram') {
      const botTokens = Object.keys(global.telegramBots || {});
      if (config.telegramToken && !botTokens.includes(config.telegramToken)) {
        botTokens.push(config.telegramToken);
      }

      if (botTokens.length > 0) {
        let sent = false;
        let lastError = null;

        for (const token of botTokens) {
          const botInstance = global.telegramBots ? global.telegramBots[token] : null;
          try {
            if (botInstance) {
              if (mediaBuffer) {
                if (isImage) {
                  await botInstance.sendPhoto(cleanNum, mediaBuffer, { caption: msgCaption }, { filename: fileName, contentType: mediaType });
                } else if (isAudio) {
                  if (ptt) {
                    await botInstance.sendVoice(cleanNum, mediaBuffer, { caption: message || '' });
                  } else {
                    await botInstance.sendAudio(cleanNum, mediaBuffer, { caption: message || '' }, { filename: fileName, contentType: mediaType });
                  }
                } else if (isVideo) {
                  await botInstance.sendVideo(cleanNum, mediaBuffer, { caption: msgCaption });
                } else {
                  await botInstance.sendDocument(cleanNum, mediaBuffer, { caption: msgCaption }, { filename: fileName, contentType: mediaType });
                }
              } else {
                await botInstance.sendMessage(cleanNum, message);
              }
            } else {
              // Direct API call (text only fallback)
              await require('axios').post(
                `https://api.telegram.org/bot${token}/sendMessage`,
                {
                  chat_id: cleanNum,
                  text: (message || msgCaption).replace(/\*/g, '').replace(/_/g, ''),
                  parse_mode: 'HTML'
                },
                { timeout: 10000 }
              );
            }
            sent = true;
            break;
          } catch (e) {
            lastError = e;
            console.warn(`[Send Message API] Failed to send using bot token ${token.substring(0,8)}...:`, e.message);
          }
        }

        if (!sent) {
          const errorMsg = lastError ? (lastError.response?.data?.description || lastError.message) : 'Forbidden: bot can\'t initiate conversation with a user';
          return res.status(500).json({ ok: false, error: errorMsg });
        }
        return res.json({ ok: true });
      } else {
        return res.status(500).json({ ok: false, error: 'بوت تليجرام غير مفعّل' });
      }

    } else if (plat === 'facebook') {
      const pageTokens = Object.values(global.fbPageTokens || {});
      if (config.fbPageAccessToken && !pageTokens.includes(config.fbPageAccessToken)) {
        pageTokens.push(config.fbPageAccessToken);
      }

      if (pageTokens.length > 0) {
        let sent = false;
        let lastError = null;
        const { sendFacebookMessage, sendFacebookMedia } = require('./lib/facebook');

        for (const pageToken of pageTokens) {
          try {
            if (mediaBuffer && (typeof sendFacebookMedia === 'function')) {
              const fbType = isImage ? 'image' : (isAudio ? 'audio' : (isVideo ? 'video' : 'file'));
              await sendFacebookMedia(cleanNum, mediaBuffer, fbType, msgCaption, pageToken);
            } else {
              await sendFacebookMessage(cleanNum, message || msgCaption, pageToken);
            }
            sent = true;
            break;
          } catch (e) {
            lastError = e;
            console.error(chalk.red('[Send Message API] Failed to send Facebook media/message:'), e.message);
            if (e.response?.data) {
              console.error(chalk.red('[Send Message API] Facebook API Error details:'), JSON.stringify(e.response.data));
            }
            // Fallback to text if media fails
            try {
              if (message) {
                await sendFacebookMessage(cleanNum, message, pageToken);
                sent = true;
                break;
              }
            } catch (_) {}
            console.warn(`[Send Message API] Failed to send to Facebook using token ${pageToken.substring(0,8)}...:`, e.message);
          }
        }

        if (!sent) {
          const errorMsg = lastError ? (lastError.response?.data?.error?.message || lastError.message) : 'فشل الإرسال من جميع الصفحات النشطة';
          return res.status(500).json({ ok: false, error: errorMsg });
        }
        return res.json({ ok: true });
      } else {
        return res.status(500).json({ ok: false, error: 'حساب فيسبوك غير مفعّل' });
      }
    } else {
      return res.status(400).json({ ok: false, error: 'منصة غير معروفة' });
    }
  } catch (e) {
    console.error('[Send Message API] Error:', e);
    res.status(500).json({ ok: false, error: e.message || 'فشل إرسال الرسالة' });
  }
});

// 📬 Get developer inbox messages from DB table
app.get('/api/dev-messages', async (req, res) => {
  try {
    const messages = await db.getDevMessages();
    res.json({ ok: true, messages });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 💬 Reply to a developer inbox message
app.post('/api/dev-messages/reply', async (req, res) => {
  try {
    const { id, replyText, mediaBase64, mediaType, mediaName, ptt } = req.body;
    if (!id || (!replyText && !mediaBase64)) return res.status(400).json({ ok: false, error: 'Message ID and Reply Text or Media are required' });

    // Fetch the specific message from DB
    const allMessages = await db.getDevMessages();
    const msgObj = allMessages.find(m => m.id === id);
    if (!msgObj) return res.status(404).json({ ok: false, error: 'الرسالة غير موجودة أو تم حذفها' });

    const platform = (msgObj.platform || 'whatsapp').toLowerCase();
    
    // Media support
    const mediaBuffer = mediaBase64 ? Buffer.from(mediaBase64, 'base64') : null;
    const fileName = mediaName || 'file';
    const isImage = mediaType && mediaType.startsWith('image/');
    const isAudio = mediaType && (mediaType.startsWith('audio/') || mediaType === 'video/ogg');
    const isVideo = mediaType && mediaType.startsWith('video/') && !isAudio;

    console.log('[Dev Messages Reply Request]:', {
      id,
      platform,
      sender: msgObj.sender,
      replyTextLength: replyText?.length,
      hasMediaBuffer: !!mediaBuffer,
      mediaType,
      mediaName
    });

    const formattedReply = `╔═══════════════════════╗
║   📢 رسالة من مطور البوت   ║
╚═══════════════════════╝

💬 الرد على رسالتك:
"${replyText || (isAudio ? '🎙️ رسالة صوتية' : '📎 ملف مرفق')}"

━━━━━━━━━━━━━━━━━━━━━━━
👤 المطور: حمزة اعمرني 🇲🇦
💡 للرد مجدداً، اكتب: .msgtodev [رسالتك]`;

    let sent = false;
    let lastError = null;

    if (platform === 'whatsapp') {
      const clients = global.clients || [];
      const sock = clients.find(c => c?.user) || clients[0];
      if (!sock) return res.status(500).json({ ok: false, error: 'لا توجد جلسة واتساب نشطة لإرسال الرد' });
      const jid = msgObj.sender.includes('@') ? msgObj.sender : `${msgObj.sender}@s.whatsapp.net`;

      if (mediaBuffer) {
        if (isImage) {
          await sock.sendMessage(jid, { image: mediaBuffer, caption: formattedReply, mimetype: mediaType });
        } else if (isAudio) {
          await sock.sendMessage(jid, { audio: mediaBuffer, mimetype: mediaType, ptt: !!ptt });
          await sock.sendMessage(jid, { text: formattedReply });
        } else if (isVideo) {
          await sock.sendMessage(jid, { video: mediaBuffer, caption: formattedReply, mimetype: mediaType });
        } else {
          await sock.sendMessage(jid, { document: mediaBuffer, fileName: fileName, mimetype: mediaType || 'application/octet-stream', caption: formattedReply });
        }
      } else {
        await sock.sendMessage(jid, { text: formattedReply });
      }
      sent = true;

    } else if (platform === 'telegram') {
      const botTokens = Object.keys(global.telegramBots || {});
      if (config.telegramToken && !botTokens.includes(config.telegramToken)) botTokens.push(config.telegramToken);
      for (const token of botTokens) {
        const botInstance = global.telegramBots ? global.telegramBots[token] : null;
        try {
          if (botInstance) {
            if (mediaBuffer) {
              if (isImage) {
                await botInstance.sendPhoto(msgObj.sender, mediaBuffer, { caption: formattedReply }, { filename: fileName, contentType: mediaType });
              } else if (isAudio) {
                if (ptt) {
                  await botInstance.sendVoice(msgObj.sender, mediaBuffer, { caption: '' });
                } else {
                  await botInstance.sendAudio(msgObj.sender, mediaBuffer, { caption: '' }, { filename: fileName, contentType: mediaType });
                }
                await botInstance.sendMessage(msgObj.sender, formattedReply);
              } else if (isVideo) {
                await botInstance.sendVideo(msgObj.sender, mediaBuffer, { caption: formattedReply });
              } else {
                await botInstance.sendDocument(msgObj.sender, mediaBuffer, { caption: formattedReply }, { filename: fileName, contentType: mediaType });
              }
            } else {
              await botInstance.sendMessage(msgObj.sender, formattedReply);
            }
          } else {
            // Direct API call (text only fallback)
            await require('axios').post(
              `https://api.telegram.org/bot${token}/sendMessage`,
              { chat_id: msgObj.sender, text: formattedReply },
              { timeout: 10000 }
            );
          }
          sent = true;
          break;
        } catch (e) { lastError = e; }
      }

    } else if (platform === 'facebook') {
      const pageTokens = Object.values(global.fbPageTokens || {});
      if (config.fbPageAccessToken && !pageTokens.includes(config.fbPageAccessToken)) pageTokens.push(config.fbPageAccessToken);
      const { sendFacebookMessage, sendFacebookMedia } = require('./lib/facebook');
      for (const pageToken of pageTokens) {
        try {
          if (mediaBuffer && typeof sendFacebookMedia === 'function') {
            const fbType = isImage ? 'image' : (isAudio ? 'audio' : (isVideo ? 'video' : 'file'));
            await sendFacebookMedia(msgObj.sender, mediaBuffer, fbType, formattedReply, pageToken);
          } else {
            await sendFacebookMessage(msgObj.sender, formattedReply, pageToken);
          }
          sent = true;
          break;
        } catch (e) {
          lastError = e;
          console.error(chalk.red('[Dev Messages Reply] Failed to send Facebook media:'), e.message);
          if (e.response?.data) {
            console.error(chalk.red('[Dev Messages Reply] Facebook API Error details:'), JSON.stringify(e.response.data));
          }
          // Fallback to text
          try {
            await sendFacebookMessage(msgObj.sender, formattedReply, pageToken);
            sent = true;
            break;
          } catch (_) {}
        }
      }
    }

    if (!sent) {
      const errorMsg = lastError ? (lastError.response?.data?.description || lastError.message) : 'فشل إرسال الرد للمستخدم';
      return res.status(500).json({ ok: false, error: errorMsg });
    }

    // Mark replied in DB
    await db.markDevMessageReplied(id, replyText);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 🗑️ Delete a developer inbox message
app.post('/api/dev-messages/delete', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ ok: false, error: 'Message ID is required' });
    const ok = await db.deleteDevMessage(id);
    if (!ok) return res.status(404).json({ ok: false, error: 'الرسالة غير موجودة' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 🧹 Clear all developer inbox messages
app.post('/api/dev-messages/clear-all', async (req, res) => {
  try {
    await db.clearAllDevMessages();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});



app.post('/api/clear-activity', async (req, res) => {
  try {
    const success = await db.clearAllActivity();
    if (success) {
      global._activityLog = [];
      res.json({ ok: true });
    } else {
      res.status(500).json({ ok: false, error: 'فشل مسح سجل النشاط' });
    }
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});


app.get('/api/cmd-stats', (req, res) => {
  try {
    const { ALL_COMMANDS } = require('./lib/commandMap');
    const platform = req.query.platform || 'all';
    let stats = {};
    if (platform === 'all') {
      stats = global._cmdStats || {};
    } else {
      stats = (global._cmdStatsByPlatform || {})[platform] || {};
    }
    const cmdFiles = [...new Set(Object.values(ALL_COMMANDS))];
    const unusedFiles = cmdFiles.filter(f => {
      const cmdsForFile = Object.entries(ALL_COMMANDS).filter(([,v]) => v === f).map(([k]) => k);
      return !cmdsForFile.some(c => stats[c]);
    });
    const topCommands = Object.entries(stats).sort((a,b) => b[1]-a[1]).slice(0,20).map(([cmd,count]) => ({ cmd, count }));
    res.json({
      ok: true,
      total: cmdFiles.length,
      usedCount: cmdFiles.length - unusedFiles.length,
      unusedCount: unusedFiles.length,
      unusedFiles,
      topCommands,
      stats,
      platformStats: global._cmdStatsByPlatform || { whatsapp: {}, telegram: {}, facebook: {} }
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/activity', async (req, res) => {
  try {
    const memoryActivity = [];
    try {
      const rows = await db.getRecentActivity(50);
      for (const row of rows) {
        const jid = row.jid;
        if (!jid) continue;
        let platform = 'whatsapp';
        let user = jid.split('@')[0];
        if (jid.startsWith('tg:')) {
          platform = 'telegram';
          user = jid.replace('tg:', '');
        } else if (jid.startsWith('fb:')) {
          platform = 'facebook';
          user = jid.replace('fb:', '');
        }
        
        let message = '[No message history]';
        let cmd = '';
        if (row.history && row.history.length > 0) {
          const lastMsg = row.history[row.history.length - 1];
          message = lastMsg.content || '[Media]';
          if (message.startsWith('.') || message.startsWith('/')) {
            cmd = message.split(' ')[0].substring(1);
          }
        }
        
        memoryActivity.push({
          time: row.updated_at || new Date().toISOString(),
          platform,
          user,
          message: message.length > 60 ? message.substring(0, 60) + '...' : message,
          cmd
        });
      }
    } catch (e) {
      console.error('[Activity API] Supabase fetch error:', e.message);
    }

    const liveLog = global._activityLog || [];
    const merged = [];
    
    // Normalise liveLog entries
    for (const entry of liveLog) {
      merged.push({
        time: entry.time ? new Date(entry.time).toISOString() : new Date().toISOString(),
        platform: entry.platform || 'whatsapp',
        user: (entry.user || '').split('@')[0],
        message: entry.message || (entry.cmd ? '.' + entry.cmd : '') || 'استخدم البوت',
        cmd: entry.cmd || ''
      });
    }
    
    for (const mem of memoryActivity) {
      const exists = merged.some(m => 
        m.user === mem.user && 
        m.platform === mem.platform && 
        Math.abs(new Date(m.time) - new Date(mem.time)) < 5000
      );
      if (!exists) {
        merged.push(mem);
      }
    }

    merged.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json({ ok: true, log: merged.slice(0, 50) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/commands - return full command map with categories and counts
app.get('/api/commands', (req, res) => {
  try {
    const { ALL_COMMANDS, NLC_KEYWORDS } = require('./lib/commandMap');
    const stats = global._cmdStats || {};
    const categories = {};
    for (const [alias, filePath] of Object.entries(ALL_COMMANDS)) {
      const cat = filePath.split('/')[0];
      if (!categories[cat]) categories[cat] = { name: cat, commands: [], total: 0 };
      const existing = categories[cat].commands.find(c => c.file === filePath);
      if (existing) { existing.aliases.push(alias); }
      else { categories[cat].commands.push({ file: filePath, aliases: [alias], uses: stats[alias] || 0 }); categories[cat].total++; }
    }
    const nlcList = Object.entries(NLC_KEYWORDS).map(([key, file]) => ({ key, file, aliases: key.split('|') }));
    res.json({ ok: true, totalAliases: Object.keys(ALL_COMMANDS).length, totalFiles: [...new Set(Object.values(ALL_COMMANDS))].length, categories, nlcList, stats });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/banned - return banned users list
app.get('/api/banned', (req, res) => {
  try {
    const bannedPath = path.join(__dirname, 'data', 'banned.json');
    let banned = [];
    try { banned = JSON.parse(fs.readFileSync(bannedPath, 'utf8') || '[]'); } catch(_) {}
    res.json({ ok: true, banned });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/syslog - return live log ring buffer
app.get('/api/syslog', (req, res) => {
  try {
    res.json({ ok: true, logs: global._sysLog || [] });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// --- PYTHON SCRIPTS MANAGEMENT API ---
const { spawn, exec } = require('child_process');

// --- TEMPORARY EMAIL PROXY API ---
app.get('/api/tempmail/generate', (req, res) => {
  try {
    const domains = ['1secmail.com', '1secmail.org', '1secmail.net'];
    const username = Math.random().toString(36).substring(2, 10);
    const domain = domains[Math.floor(Math.random() * domains.length)];
    res.json({ ok: true, email: `${username}@${domain}` });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/tempmail/messages', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'بريد غير صالح' });
    const [login, domain] = email.split('@');
    const response = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
    res.json({ ok: true, messages: response.data || [] });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/tempmail/message', async (req, res) => {
  try {
    const { email, id } = req.query;
    if (!email || !email.includes('@')) return res.status(400).json({ ok: false, error: 'بريد غير صالح' });
    if (!id) return res.status(400).json({ ok: false, error: 'معرف الرسالة مطلوب' });
    const [login, domain] = email.split('@');
    const response = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${id}`);
    res.json({ ok: true, message: response.data || null });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Global process and log containers
global.tempEmailProcess = global.tempEmailProcess || null;
global.tempEmailLogs = global.tempEmailLogs || [];

app.get('/api/scripts/status', (req, res) => {
  try {
    const isRunning = !!(global.tempEmailProcess && global.tempEmailProcess.pid && !global.tempEmailProcess.killed);
    res.json({
      ok: true,
      running: isRunning,
      pid: isRunning ? global.tempEmailProcess.pid : null,
      config: {
        token: process.env.TELEGRAM_TOKEN || config.telegramToken || '',
        ownerId: process.env.TELEGRAM_OWNER_ID || (config.ownerNumber && config.ownerNumber[0]) || ''
      }
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/scripts/toggle', async (req, res) => {
  try {
    const { action, token, ownerId } = req.body;
    const isRunning = !!(global.tempEmailProcess && global.tempEmailProcess.pid && !global.tempEmailProcess.killed);

    if (action === 'start') {
      if (isRunning) {
        return res.json({ ok: true, message: 'Script is already running.', pid: global.tempEmailProcess.pid });
      }

      const scriptPath = path.join(__dirname, 'انشاء ايميلات مؤقته.py');
      if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ ok: false, error: 'Script file not found.' });
      }

      global.tempEmailLogs = global.tempEmailLogs || [];
      global.tempEmailLogs.push(`[${new Date().toLocaleTimeString()}] 🚀 Starting Temporary Email Bot process...`);

      const env = {
        ...process.env,
        TELEGRAM_TOKEN: token || process.env.TELEGRAM_TOKEN || config.telegramToken || 'token',
        TELEGRAM_OWNER_ID: ownerId || process.env.TELEGRAM_OWNER_ID || (config.ownerNumber && config.ownerNumber[0]) || 'ID'
      };

      const startProcess = (cmd) => {
        global.tempEmailLogs.push(`[${new Date().toLocaleTimeString()}] Spawning: ${cmd} for Temporary Email Bot`);
        const proc = spawn(cmd, [scriptPath], { env });
        
        proc.stdout.on('data', (data) => {
          const lines = data.toString().split('\n');
          lines.forEach(line => {
            if (line.trim()) {
              global.tempEmailLogs.push(`[${new Date().toLocaleTimeString()}] STDOUT: ${line}`);
            }
          });
          if (global.tempEmailLogs.length > 300) global.tempEmailLogs.shift();
        });

        proc.stderr.on('data', (data) => {
          const lines = data.toString().split('\n');
          lines.forEach(line => {
            if (line.trim()) {
              global.tempEmailLogs.push(`[${new Date().toLocaleTimeString()}] STDERR: ${line}`);
            }
          });
          if (global.tempEmailLogs.length > 300) global.tempEmailLogs.shift();
        });

        proc.on('error', (err) => {
          global.tempEmailLogs.push(`[${new Date().toLocaleTimeString()}] ERROR: Failed to start process with command '${cmd}': ${err.message}`);
          if (cmd === 'python3') {
            global.tempEmailLogs.push(`[${new Date().toLocaleTimeString()}] 🔄 Attempting fallback to 'python'...`);
            global.tempEmailProcess = startProcess('python');
          } else {
            global.tempEmailProcess = null;
          }
        });

        proc.on('exit', (code, signal) => {
          global.tempEmailLogs.push(`[${new Date().toLocaleTimeString()}] 🛑 Process exited with code ${code} and signal ${signal}`);
          global.tempEmailProcess = null;
        });

        return proc;
      };

      global.tempEmailProcess = startProcess('python3');
      
      // Wait a short time to check if spawn worked
      await new Promise(r => setTimeout(r, 1000));

      const nowRunning = !!(global.tempEmailProcess && global.tempEmailProcess.pid && !global.tempEmailProcess.killed);
      return res.json({ ok: true, running: nowRunning, pid: nowRunning ? global.tempEmailProcess.pid : null });

    } else if (action === 'stop') {
      if (!isRunning) {
        return res.json({ ok: true, message: 'Script is already stopped.' });
      }

      global.tempEmailLogs.push(`[${new Date().toLocaleTimeString()}] 🛑 Terminating script process (PID: ${global.tempEmailProcess.pid})...`);
      global.tempEmailProcess.kill('SIGINT');
      
      await new Promise(r => setTimeout(r, 1000));
      const stillRunning = !!(global.tempEmailProcess && global.tempEmailProcess.pid && !global.tempEmailProcess.killed);
      if (stillRunning) {
        global.tempEmailProcess.kill('SIGKILL');
      }

      global.tempEmailProcess = null;
      return res.json({ ok: true, running: false });
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid action. Use start or stop.' });
    }
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/scripts/logs', (req, res) => {
  try {
    res.json({ ok: true, logs: global.tempEmailLogs || [] });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// Global process and log containers for Instagram Hunter
global.instaHunterProcess = global.instaHunterProcess || null;
global.instaHunterLogs = global.instaHunterLogs || [];
global.instaHunterHits = global.instaHunterHits || [];
global.instaHunterSendTelegram = global.instaHunterSendTelegram !== undefined ? global.instaHunterSendTelegram : true;

app.get('/api/insta/status', (req, res) => {
  try {
    const isRunning = !!(global.instaHunterProcess && global.instaHunterProcess.pid && !global.instaHunterProcess.killed);
    res.json({
      ok: true,
      running: isRunning,
      pid: isRunning ? global.instaHunterProcess.pid : null,
      sendTelegram: global.instaHunterSendTelegram,
      hits: global.instaHunterHits,
      config: {
        token: process.env.INSTA_HUNTER_TELEGRAM_TOKEN || '',
        ownerId: process.env.INSTA_HUNTER_TELEGRAM_OWNER_ID || ''
      }
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/insta/hits', (req, res) => {
  res.json({ ok: true, hits: global.instaHunterHits || [] });
});

app.post('/api/insta/hits/clear', (req, res) => {
  global.instaHunterHits = [];
  res.json({ ok: true });
});

app.post('/api/insta/toggle', async (req, res) => {
  try {
    const { action, token, ownerId, sendTelegram } = req.body;
    const isRunning = !!(global.instaHunterProcess && global.instaHunterProcess.pid && !global.instaHunterProcess.killed);

    if (action === 'start') {
      if (isRunning) {
        return res.json({ ok: true, message: 'Process is already running.', pid: global.instaHunterProcess.pid });
      }

      const scriptPath = path.join(__dirname, 'انستا 2012-عشوائي قوية ❤️‍🔥.py');
      if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ ok: false, error: 'Script file not found.' });
      }

      global.instaHunterSendTelegram = sendTelegram !== undefined ? sendTelegram : true;
      global.instaHunterLogs = [];
      global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] 🚀 Starting Instagram Hunter process...`);

      const env = {
        ...process.env,
        INSTA_HUNTER_TELEGRAM_TOKEN: token || '',
        INSTA_HUNTER_TELEGRAM_OWNER_ID: ownerId || '',
        SEND_TELEGRAM: global.instaHunterSendTelegram ? 'true' : 'false'
      };

      const startProcess = (cmd) => {
        global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] Spawning: ${cmd} for Instagram Hunter`);
        const proc = spawn(cmd, [scriptPath], { env });
        
        proc.stdout.on('data', (data) => {
          // Strip ANSI escape codes
          const cleanData = data.toString().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
          const lines = cleanData.split('\n');
          lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
              if (trimmed.startsWith('__HIT__|')) {
                // Parse hit details: __HIT__|username|email|followers|posts|link|full_name
                const parts = trimmed.split('|');
                const hitObj = {
                  username: parts[1] || '',
                  email: parts[2] || '',
                  followers: parts[3] || 'None',
                  posts: parts[4] || '0',
                  link: parts[5] || '',
                  fullName: parts[6] || 'None',
                  timestamp: new Date().toISOString()
                };
                global.instaHunterHits = global.instaHunterHits || [];
                global.instaHunterHits.unshift(hitObj);
                if (global.instaHunterHits.length > 200) global.instaHunterHits.pop();
              } else if (trimmed.includes('━━━') || trimmed.includes('┃ ✦')) {
                // Strip redundant drawing boxes but keep stats lines formatted nicely
                global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] 📊 ${trimmed.replace(/┃ ✦ /g, '').replace(/┃/g, '')}`);
              } else {
                global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] STDOUT: ${trimmed}`);
              }
            }
          });
          if (global.instaHunterLogs.length > 300) global.instaHunterLogs.splice(0, global.instaHunterLogs.length - 300);
        });

        proc.stderr.on('data', (data) => {
          const lines = data.toString().split('\n');
          lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
              global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] STDERR: ${trimmed}`);
            }
          });
          if (global.instaHunterLogs.length > 300) global.instaHunterLogs.splice(0, global.instaHunterLogs.length - 300);
        });

        proc.on('error', (err) => {
          global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] ERROR: Failed to start process with command '${cmd}': ${err.message}`);
          if (cmd === 'python3') {
            global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] 🔄 Attempting fallback to 'python'...`);
            global.instaHunterProcess = startProcess('python');
          } else {
            global.instaHunterProcess = null;
          }
        });

        proc.on('exit', (code, signal) => {
          global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] 🛑 Process exited with code ${code} and signal ${signal}`);
          global.instaHunterProcess = null;
        });

        return proc;
      };

      global.instaHunterProcess = startProcess('python3');
      
      // Wait a short time to check if spawn worked
      await new Promise(r => setTimeout(r, 1000));

      const nowRunning = !!(global.instaHunterProcess && global.instaHunterProcess.pid && !global.instaHunterProcess.killed);
      return res.json({ ok: true, running: nowRunning, pid: nowRunning ? global.instaHunterProcess.pid : null });

    } else if (action === 'stop') {
      if (!isRunning) {
        return res.json({ ok: true, message: 'Process is already stopped.' });
      }

      global.instaHunterLogs.push(`[${new Date().toLocaleTimeString()}] 🛑 Terminating process (PID: ${global.instaHunterProcess.pid})...`);
      global.instaHunterProcess.kill('SIGINT');
      
      await new Promise(r => setTimeout(r, 1000));
      const stillRunning = !!(global.instaHunterProcess && global.instaHunterProcess.pid && !global.instaHunterProcess.killed);
      if (stillRunning) {
        global.instaHunterProcess.kill('SIGKILL');
      }

      global.instaHunterProcess = null;
      return res.json({ ok: true, running: false });
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid action. Use start or stop.' });
    }
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/insta/logs', (req, res) => {
  try {
    res.json({ ok: true, logs: global.instaHunterLogs || [] });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.post('/api/broadcast', async (req, res) => {
  try {
    const { message, platform, mediaBase64, mediaType, mediaName, caption, ptt } = req.body;
    if (!message && !mediaBase64) return res.status(400).json({ ok: false, error: 'رسالة أو ملف مطلوب' });

    // Media support
    const mediaBuffer = mediaBase64 ? Buffer.from(mediaBase64, 'base64') : null;
    const fileName = mediaName || 'broadcast';
    const msgCaption = caption || message || '';
    const isImage = mediaType && mediaType.startsWith('image/');
    const isAudio = mediaType && (mediaType.startsWith('audio/') || mediaType === 'video/ogg');
    const isVideo = mediaType && mediaType.startsWith('video/') && !isAudio;
    
    const targetPlatform = platform || 'all';
    let results = { whatsapp: { sent: 0, failed: 0 }, telegram: { sent: 0, failed: 0 }, facebook: { sent: 0, failed: 0 } };

    console.log('[Broadcast Request]:', {
      platform: targetPlatform,
      messageLength: message?.length,
      hasMediaBuffer: !!mediaBuffer,
      mediaType,
      mediaName
    });
    
    // Format broadcast message with developer header
    const formattedMessage = `\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n\u2551   \uD83D\uDCE2 \u0631\u0633\u0627\u0644\u0629 \u0645\u0646 \u0645\u0637\u0648\u0631 \u0627\u0644\u0628\u0648\u062a\n\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n\n${message}\n\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\u2694\uFE0F *\u062d\u0645\u0632\u0629 \u0627\u0639\u0645\u0631\u0646\u064a*`;
    
    // Fetch all users from Supabase to construct target lists
    let waUsers = [], tgUsers = [], fbUsers = [];
    try {
      const rows = await db.getAllUsers();
      const waSet = new Set(); const tgSet = new Set(); const fbSet = new Set();
      for (const u of rows) {
        if (!u.jid) continue;
        const plat = getPlatformFromJid(u.jid);
        const cleanId = u.jid.replace('tg:', '').replace('fb:', '');
        if (plat === 'whatsapp' && !waSet.has(u.jid)) { waSet.add(u.jid); waUsers.push(u.jid); }
        else if (plat === 'telegram' && !tgSet.has(cleanId)) { tgSet.add(cleanId); tgUsers.push(cleanId); }
        else if (plat === 'facebook' && !fbSet.has(cleanId)) { fbSet.add(cleanId); fbUsers.push({ id: cleanId }); }
      }
    } catch (e) {
      console.error('[Broadcast API] Failed to fetch users from Supabase:', e.message);
      try { waUsers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/users.json'), 'utf-8') || '[]'); } catch (_) {}
      try { tgUsers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/tg_users.json'), 'utf-8') || '[]'); } catch (_) {}
      try { fbUsers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/fb_users.json'), 'utf-8') || '[]'); } catch (_) {}
    }

    const totalUsers = (
      (targetPlatform === 'all' || targetPlatform === 'whatsapp' ? waUsers.length : 0) +
      (targetPlatform === 'all' || targetPlatform === 'telegram' ? tgUsers.length : 0) +
      (targetPlatform === 'all' || targetPlatform === 'facebook' ? fbUsers.length : 0)
    );

    // Initialize global progress tracker
    global.broadcastProgress = {
      running: true,
      total: totalUsers,
      done: 0,
      sent: 0,
      failed: 0,
      log: [],
      startedAt: new Date().toISOString()
    };

    const pushLog = (icon, name, platform, ok) => {
      global.broadcastProgress.done++;
      if (ok) global.broadcastProgress.sent++;
      else global.broadcastProgress.failed++;
      global.broadcastProgress.log.unshift({ icon, name, platform, ok, time: new Date().toLocaleTimeString('ar-MA', { hour12: false }) });
      if (global.broadcastProgress.log.length > 60) global.broadcastProgress.log.length = 60;
    };

    // Respond immediately — broadcast runs in background
    res.json({ ok: true, started: true, total: totalUsers });

    // === BACKGROUND BROADCAST ===
    (async () => {
      try {
        // 1. WhatsApp
        if (targetPlatform === 'all' || targetPlatform === 'whatsapp') {
          const clients = global.clients || [];
          const sock = clients.find(c => c?.user) || clients[0];
          for (const user of waUsers) {
            const jid = typeof user === 'string' ? user : (user.id || user.jid);
            const name = global.waNames?.[jid?.split('@')[0]] || jid?.split('@')[0] || 'WA';
            if (!jid || jid === 'test@s.whatsapp.net') continue;
            let ok = false;
            try {
              if (sock) {
                if (mediaBuffer) {
                  if (isImage) {
                    await sock.sendMessage(jid, { image: mediaBuffer, caption: formattedMessage, mimetype: mediaType });
                  } else if (isAudio) {
                    await sock.sendMessage(jid, { audio: mediaBuffer, mimetype: mediaType, ptt: !!ptt });
                    if (formattedMessage) await sock.sendMessage(jid, { text: formattedMessage });
                  } else if (isVideo) {
                    await sock.sendMessage(jid, { video: mediaBuffer, caption: formattedMessage, mimetype: mediaType });
                  } else {
                    await sock.sendMessage(jid, { document: mediaBuffer, fileName: fileName, mimetype: mediaType || 'application/octet-stream', caption: formattedMessage });
                  }
                } else {
                  await sock.sendMessage(jid, { text: formattedMessage });
                }
                ok = true;
              }
            } catch (_) {}
            pushLog('📱', name, 'WhatsApp', ok);
            await new Promise(r => setTimeout(r, 500));
          }
        }

        // 2. Telegram
        if (targetPlatform === 'all' || targetPlatform === 'telegram') {
          const allBots = Object.values(global.telegramBots || {});
          if (global.telegramBot && !allBots.includes(global.telegramBot)) allBots.unshift(global.telegramBot);
          for (const chatId of tgUsers) {
            const name = global.tgNames?.[chatId] || chatId;
            let sent = false;
            for (const botInstance of allBots) {
              try {
                if (mediaBuffer) {
                  if (isImage) {
                    await botInstance.sendPhoto(chatId, mediaBuffer, { caption: formattedMessage }, { filename: fileName, contentType: mediaType });
                  } else if (isAudio) {
                    if (ptt) {
                      await botInstance.sendVoice(chatId, mediaBuffer, { caption: message || '' });
                    } else {
                      await botInstance.sendAudio(chatId, mediaBuffer, { caption: message || '' }, { filename: fileName, contentType: mediaType });
                    }
                  } else if (isVideo) {
                    await botInstance.sendVideo(chatId, mediaBuffer, { caption: formattedMessage });
                  } else {
                    await botInstance.sendDocument(chatId, mediaBuffer, { caption: formattedMessage }, { filename: fileName, contentType: mediaType });
                  }
                } else {
                  await botInstance.sendMessage(chatId, formattedMessage, { parse_mode: 'Markdown' });
                }
                sent = true; break;
              } catch (_) {}
            }
            pushLog('✈️', name, 'Telegram', sent);
            await new Promise(r => setTimeout(r, 300));
          }
        }

        // 3. Facebook
        if (targetPlatform === 'all' || targetPlatform === 'facebook') {
          if (config.fbPageAccessToken) {
            const { sendFacebookMessage } = require('./lib/facebook');
            for (const user of fbUsers) {
              const recipientId = typeof user === 'string' ? user : user.id;
              const name = global.fbNames?.[recipientId] || recipientId;
              const pageId = typeof user === 'object' ? user.pageId : null;
              let ok = false;
              try {
                const { sendFacebookMedia } = require('./lib/facebook');
                if (mediaBuffer && typeof sendFacebookMedia === 'function') {
                  const fbType = isImage ? 'image' : (isAudio ? 'audio' : (isVideo ? 'video' : 'file'));
                  await sendFacebookMedia(recipientId, mediaBuffer, fbType, formattedMessage, pageId || config.fbPageAccessToken);
                } else {
                  await sendFacebookMessage(recipientId, formattedMessage, pageId || config.fbPageAccessToken);
                }
                ok = true;
              } catch (err) {
                console.error(chalk.red(`[Broadcast Facebook] Failed to send media to ${recipientId}:`), err.message);
                if (err.response?.data) {
                  console.error(chalk.red('[Broadcast Facebook] Facebook API Error details:'), JSON.stringify(err.response.data));
                }
                // Fallback to text
                try { await sendFacebookMessage(recipientId, formattedMessage, pageId || config.fbPageAccessToken); ok = true; } catch (__) {}
              }
              pushLog('🔵', name, 'Facebook', ok);
              await new Promise(r => setTimeout(r, 500));
            }
          } else {
            fbUsers.forEach(u => pushLog('🔵', u.id || u, 'Facebook', false));
          }
        }
      } catch (bgErr) {
        console.error('[Broadcast BG Error]:', bgErr.message);
      } finally {
        if (global.broadcastProgress) global.broadcastProgress.running = false;
      }
    })();

  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Broadcast Progress — Live polling endpoint
app.get('/api/broadcast/progress', (req, res) => {
  res.json(global.broadcastProgress || { running: false, total: 0, done: 0, sent: 0, failed: 0, log: [] });
});




// Error Logs API — Returns recent command errors from Supabase error_logs table
app.get('/api/errors', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const errors = await db.getRecentErrors(limit);
    res.json({ ok: true, errors });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Profanity Logs API — get all violation logs
app.get('/api/profanity-logs', async (req, res) => {
  try {
    const logs = await db.getCache('profanity_logs') || [];
    res.json({ ok: true, logs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Profanity Reset API — reset warnings for a specific user
app.post('/api/profanity/reset', async (req, res) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
    await db.setCache(`profanity_warnings:${jid}`, { warnings_left: 3 });
    // Remove from logs
    let logs = await db.getCache('profanity_logs') || [];
    logs = logs.filter(l => l.jid !== jid);
    await db.setCache('profanity_logs', logs);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Profanity Ban API — immediately ban a user from their jid
app.post('/api/profanity/ban', async (req, res) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
    let banned = [...(global.bannedUsersCache || [])];
    if (!banned.includes(jid)) {
      banned.push(jid);
      await global.syncBannedList(banned);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Profanity Message API — send a message (text or image) to a violating user
app.post('/api/profanity/message', async (req, res) => {
  try {
    const { jid, platform, message, mediaBase64, mediaType, mediaName, ptt } = req.body;
    if (!jid || !platform || (!message && !mediaBase64)) {
      return res.status(400).json({ ok: false, error: 'jid, platform, and message or media required' });
    }

    const mediaBuffer = mediaBase64 ? Buffer.from(mediaBase64, 'base64') : null;
    const fileName = mediaName || 'file';
    const isImage = mediaType && mediaType.startsWith('image/');
    const isAudio = mediaType && (mediaType.startsWith('audio/') || mediaType === 'video/ogg');
    const isVideo = mediaType && mediaType.startsWith('video/') && !isAudio;
    const isDoc   = mediaBuffer && !isImage && !isAudio && !isVideo;

    const headerText = `╔═══════════════════════╗\n║   📢 رسالة من مطور البوت   ║\n╚═══════════════════════╝\n\n`;
    const footerText = `\n\n━━━━━━━━━━━━━━━━━━━━━━━\n👤 المطور: حمزة اعمرني 🇲🇦`;
    const formattedMsg = message ? `${headerText}${message}${footerText}` : `📎 ملف مرفق`;

    const plat = platform.toLowerCase();
    let sent = false;

    // ─── WhatsApp ──────────────────────────────────────────────────────────
    if (plat === 'wa' || plat === 'whatsapp') {
      const clients = global.clients || [];
      const sock = clients.find(c => c?.user) || clients[0];
      if (!sock) return res.status(500).json({ ok: false, error: 'لا توجد جلسة واتساب نشطة' });
      const targetJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;

      if (mediaBuffer && isImage) {
        await sock.sendMessage(targetJid, { image: mediaBuffer, caption: formattedMsg, mimetype: mediaType });
      } else if (mediaBuffer && isAudio) {
        await sock.sendMessage(targetJid, { audio: mediaBuffer, mimetype: mediaType, ptt: !!ptt });
        if (message) await sock.sendMessage(targetJid, { text: formattedMsg });
      } else if (mediaBuffer && isVideo) {
        await sock.sendMessage(targetJid, { video: mediaBuffer, caption: formattedMsg, mimetype: mediaType });
      } else if (mediaBuffer && isDoc) {
        await sock.sendMessage(targetJid, { document: mediaBuffer, fileName, mimetype: mediaType || 'application/octet-stream', caption: formattedMsg });
      } else {
        await sock.sendMessage(targetJid, { text: formattedMsg });
      }
      sent = true;

    // ─── Telegram ─────────────────────────────────────────────────────────
    } else if (plat === 'tg' || plat === 'telegram') {
      const botTokens = Object.keys(global.telegramBots || {});
      if (config.telegramToken && !botTokens.includes(config.telegramToken)) botTokens.push(config.telegramToken);
      for (const token of botTokens) {
        const botInstance = global.telegramBots ? global.telegramBots[token] : null;
        try {
          if (botInstance) {
            if (mediaBuffer && isImage) {
              await botInstance.sendPhoto(jid, mediaBuffer, { caption: formattedMsg }, { filename: fileName, contentType: mediaType });
            } else if (mediaBuffer && isAudio) {
              if (ptt) {
                await botInstance.sendVoice(jid, mediaBuffer, { caption: message || '' });
              } else {
                await botInstance.sendAudio(jid, mediaBuffer, { caption: message || '' }, { filename: fileName, contentType: mediaType });
              }
            } else if (mediaBuffer && isVideo) {
              await botInstance.sendVideo(jid, mediaBuffer, { caption: formattedMsg });
            } else if (mediaBuffer && isDoc) {
              await botInstance.sendDocument(jid, mediaBuffer, { caption: formattedMsg }, { filename: fileName, contentType: mediaType || 'application/octet-stream' });
            } else {
              await botInstance.sendMessage(jid, formattedMsg);
            }
          } else {
            await require('axios').post(`https://api.telegram.org/bot${token}/sendMessage`,
              { chat_id: jid, text: formattedMsg }, { timeout: 10000 });
          }
          sent = true; break;
        } catch (e) { console.error('[Profanity Msg] TG send error:', e.message); }
      }

    // ─── Facebook ─────────────────────────────────────────────────────────
    } else if (plat === 'fb' || plat === 'facebook') {
      const pageTokens = Object.values(global.fbPageTokens || {});
      if (config.fbPageAccessToken && !pageTokens.includes(config.fbPageAccessToken)) pageTokens.push(config.fbPageAccessToken);
      const { sendFacebookMessage, sendFacebookMedia } = require('./lib/facebook');
      const cleanJid = jid.replace('fb:', '');
      for (const pageToken of pageTokens) {
        try {
          if (mediaBuffer && isImage && typeof sendFacebookMedia === 'function') {
            await sendFacebookMedia(cleanJid, mediaBuffer, mediaType || 'image/jpeg', pageToken);
            if (message) await sendFacebookMessage(cleanJid, formattedMsg, pageToken);
          } else {
            await sendFacebookMessage(cleanJid, formattedMsg, pageToken);
          }
          sent = true; break;
        } catch (e) { console.error('[Profanity Msg] FB send error:', e.message); }
      }
    }

    if (!sent) return res.status(500).json({ ok: false, error: 'فشل إرسال الرسالة — تأكد من تشغيل البوت على المنصة المحددة' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Profanity Msg] Error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ibhaya (adult content) Logs API
app.get('/api/ibhaya-logs', async (req, res) => {
  try {
    const logs = await db.getCache('ibhaya_logs') || [];
    res.json({ ok: true, logs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ibhaya Reset API — reset warnings for a specific user
app.post('/api/ibhaya/reset', async (req, res) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
    await db.setCache(`ibhaya_warnings:${jid}`, { warnings_left: 3 });
    let logs = await db.getCache('ibhaya_logs') || [];
    logs = logs.filter(l => l.jid !== jid);
    await db.setCache('ibhaya_logs', logs);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ibhaya Ban API
app.post('/api/ibhaya/ban', async (req, res) => {
  try {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
    let banned = [...(global.bannedUsersCache || [])];
    if (!banned.includes(jid)) {
      banned.push(jid);
      await global.syncBannedList(banned);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ibhaya Warn API — send automated warning message to violating user
app.post('/api/ibhaya/warn', async (req, res) => {
  try {
    const { jid, warnings_left } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });

    const remaining = (typeof warnings_left === 'number') ? warnings_left : 1;
    const warnMsg = `⚠️ *تحذير رسمي من الإدارة!*\n\nلقد تم اكتشاف محتوى مخالف في رسائلك.\n\n🔴 المتبقي لديك: *${remaining} تحذير${remaining !== 1 ? 'ات' : ''}* قبل الحظر النهائي.\n\n❌ إذا تكررت المخالفة مرة أخرى — سيتم حظرك فوراً وبشكل دائم.\n\n📋 يُرجى الالتزام بقواعد الاستخدام واحترام الآداب العامة.`;

    let sent = false;

    if (jid.startsWith('tg:')) {
      // Telegram
      const tgId = jid.replace('tg:', '');
      const bots = global.telegramBots ? Object.values(global.telegramBots) : [];
      if (global.telegramBot) bots.unshift(global.telegramBot);
      for (const bot of bots) {
        try {
          await bot.telegram.sendMessage(tgId, warnMsg, { parse_mode: 'Markdown' });
          sent = true; break;
        } catch (_) {}
      }
    } else if (jid.startsWith('fb:')) {
      // Facebook
      const fbId = jid.replace('fb:', '');
      const { sendFbMessage } = require('./lib/facebook');
      const fbTokens = [config.fbPageAccessToken].filter(Boolean);
      for (const token of fbTokens) {
        try {
          await sendFbMessage(fbId, warnMsg, token);
          sent = true; break;
        } catch (_) {}
      }
    } else {
      // WhatsApp
      const cleanJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
      for (const sock of (global.clients || [])) {
        try {
          if (sock.user) {
            await sock.sendMessage(cleanJid, { text: warnMsg });
            sent = true; break;
          }
        } catch (_) {}
      }
    }

    res.json({ ok: true, sent });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ibhaya Words API — list blocked keywords
app.get('/api/ibhaya-words', async (req, res) => {
  try {
    const { IBHAYA_WORDS } = require('./lib/ibhaya');
    res.json({ ok: true, words: IBHAYA_WORDS, count: IBHAYA_WORDS.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Leaderboard API — returns top users for each platform
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { getTopUsers } = require('./lib/leaderboard');
    const wa = await getTopUsers('whatsapp', 30);
    const tg = await getTopUsers('telegram', 30);
    const fb = await getTopUsers('facebook', 30);
    res.json({ ok: true, leaderboard: { whatsapp: wa, telegram: tg, facebook: fb } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Refresh Names API — Bulk-fetch profile names for registered Telegram and Facebook users
app.post('/api/refresh-names', async (req, res) => {
  try {
    const { fetchFbProfileName } = require('./lib/facebook');
    const rows = await db.getAllUsers();
    
    // 1. Facebook Names
    global.fbNames = global.fbNames || {};
    const botConfigs = await db.getBotConfigs();
    const fbTokens = botConfigs
      .filter(c => c.platform === 'facebook' && c.token)
      .map(c => c.token);
    if (config.fbPageAccessToken) fbTokens.push(config.fbPageAccessToken);
    const uniqueTokens = [...new Set(fbTokens)];

    const fbUsers = rows.filter(u => u.jid && u.jid.startsWith('fb:'));
    let fbFetched = 0;
    let fbFailed = 0;

    for (const u of fbUsers) {
      const cleanId = u.jid.replace('fb:', '');
      if (global.fbNames[cleanId]) continue; // already have name, skip
      let name = null;
      for (const token of uniqueTokens) {
        name = await fetchFbProfileName(cleanId, token);
        if (name) break;
      }
      if (name) {
        global.fbNames[cleanId] = name;
        fbFetched++;
      } else {
        fbFailed++;
      }
      await new Promise(r => setTimeout(r, 200)); // avoid rate-limiting
    }

    if (fbFetched > 0) {
      await db.saveUserNames('facebook', global.fbNames).catch(() => {});
    }

    // 2. Telegram Names
    const tgUsers = rows.filter(u => u.jid && u.jid.startsWith('tg:'));
    global.tgNames = global.tgNames || {};
    let tgFetched = 0;
    let tgFailed = 0;

    const allBots = Object.values(global.telegramBots || {});
    if (global.telegramBot && !allBots.includes(global.telegramBot)) allBots.unshift(global.telegramBot);

    if (allBots.length > 0) {
      for (const u of tgUsers) {
        const cleanId = u.jid.replace('tg:', '');
        if (global.tgNames[cleanId]) continue; // already have name, skip
        
        let name = null;
        for (const botInstance of allBots) {
          try {
            const chat = await botInstance.getChat(cleanId);
            if (chat) {
              name = `${chat.first_name || ''} ${chat.last_name || ''}`.trim() || chat.title || chat.username || null;
              if (name) break;
            }
          } catch (_) {}
        }
        
        if (name) {
          global.tgNames[cleanId] = name;
          tgFetched++;
        } else {
          tgFailed++;
        }
        await new Promise(r => setTimeout(r, 150)); // avoid rate-limiting
      }
      if (tgFetched > 0) {
        await db.saveUserNames('telegram', global.tgNames).catch(() => {});
      }
    }

    res.json({
      ok: true,
      facebook: { fetched: fbFetched, failed: fbFailed, total: fbUsers.length },
      telegram: { fetched: tgFetched, failed: tgFailed, total: tgUsers.length }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Facebook Webhook Authentication
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === (config.fbVerifyToken || "HAMZA_BOT_VERIFY_TOKEN")) {
      console.log(chalk.green("✅ Facebook Webhook Verified!"));
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Facebook Webhook Message Handling
app.post("/webhook", (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    body.entry.forEach((entry) => {
      entry.messaging.forEach((event) => {
        // Accept text messages AND photo/video attachments
        // Previously only event.message.text was handled — photos were silently ignored!
        const hasText = event.message && event.message.text;
        const hasAttachment = event.message && event.message.attachments && event.message.attachments.length > 0;
        if ((hasText || hasAttachment) && !event.message.is_echo) {
          handleFacebookMessage(event);
        }
      });
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(chalk.green(`✅ Server listening on port ${port} (0.0.0.0)`));

  // Load saved public URL from local file or Supabase cache
  (async () => {
    try {
      const urlPath = path.join(__dirname, "server_url.json");
      if (fs.existsSync(urlPath)) {
        const saved = JSON.parse(fs.readFileSync(urlPath, "utf-8"));
        if (saved && saved.url) {
          config.publicUrl = saved.url;
          console.log(chalk.cyan(`🌐 Loaded Public URL from server_url.json: ${config.publicUrl}`));
        }
      }
      if (db && db.getCache) {
        const cachedUrl = await db.getCache("public_url");
        if (cachedUrl) {
          config.publicUrl = cachedUrl;
          console.log(chalk.green(`🌐 Loaded Public URL from Supabase cache: ${config.publicUrl}`));
        }
      }
    } catch (e) {
      console.error("Error loading startup public URL:", e);
    }
    console.log(chalk.cyan(`🌐 Keep-Alive: ${config.publicUrl || "⚠️ Not Set"}`));
  })();

  /* 
   * 🌟 Keep-Alive Mechanism 🌟
   * Pings the server every 30 seconds to prevent sleeping.
   * This is critical for free-tier hosting like Koyeb/Render.
   */
  const pingInterval = setInterval(() => {
    // Ping localhost health endpoint
    axios.get(`http://127.0.0.1:${port}/health`).catch(() => {
      console.error(chalk.red("Health check failed, potential restart..."));
      // process.exit(1); // Optional: only exit if truly unhealthy
    });

    // Make all active bots show as online
    if (global.clients && global.clients.length > 0) {
      global.clients.forEach(sock => {
        try {
          if (sock && sock.user && sock.sendPresenceUpdate) {
            sock.sendPresenceUpdate("available").catch(() => {});
          }
        } catch (_) {}
      });
    }

    // Ping external public URL if set — use /health endpoint to avoid 404 on root
    if (config.publicUrl) {
      const pingUrl = config.publicUrl.replace(/\/$/, '') + '/health';
      axios.get(pingUrl, { timeout: 10000 })
        .catch((err) => {
          // Only log non-404 errors (404 = route missing, others = real network issues)
          if (!err.response || err.response.status !== 404) {
            console.error(chalk.yellow(`Keep-Alive Ping Failed: ${err.message}`));
          }
        });
    }
  }, 30 * 1000); // 30 seconds interval
});

async function sendYTVideo(sock, chatId, videoUrl, title, quoted) {
  let tmpPath;
  try {
    tmpPath = path.join(__dirname, 'tmp', `yt_${Date.now()}.mp4`);
    fs.ensureDirSync(path.join(__dirname, 'tmp'));
    const writer = fs.createWriteStream(tmpPath);
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 120000
    });
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    await sock.sendMessage(chatId, {
      video: { url: tmpPath },
      caption: `🎬 *${title}*\n\n✅ *Hamza Amirni YouTube Downloader*\n⚔️ ${config.botName}`,
      mimetype: 'video/mp4'
    }, { quoted });
  } catch (e) {
    console.error("sendYTVideo Error:", e.message);
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

async function sendFBVideo(sock, chatId, videoUrl, apiName, quoted) {
  let tmpPath;
  try {
    tmpPath = path.join(__dirname, 'tmp', `fb_${Date.now()}.mp4`);
    fs.ensureDirSync(path.join(__dirname, 'tmp'));
    const writer = fs.createWriteStream(tmpPath);
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 120000
    });
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    await sock.sendMessage(chatId, {
      video: { url: tmpPath },
      caption: `🎬 *Facebook Video*\n\nSource: ${apiName}\n✅ *Hamza Amirni FB Downloader*\n⚔️ ${config.botName}`,
      mimetype: 'video/mp4'
    }, { quoted });
  } catch (e) {
    console.error("sendFBVideo Error:", e.message);
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

async function saveFullSessionToDb(num, sessionDir) {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const files = fs.readdirSync(sessionDir);
    const sessionData = {};
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(sessionDir, file);
        try {
          const content = fs.readJsonSync(filePath);
          sessionData[file] = content;
        } catch (e) {
          // ignore read errors for individual files
        }
      }
    }
    if (sessionData['creds.json']) {
      await db.updateWhatsAppSession(num, sessionData);
    }
  } catch (err) {
    console.error(`[Session/Save] Error saving session to DB for ${num}:`, err.message);
  }
}

async function startBot(folderName, phoneNumber) {
  global._activeBots = global._activeBots || {};
  if (global._activeBots[folderName]) {
    console.log(chalk.yellow(`⚠️ [startBot] Bot instance for ${folderName} is already starting or running. Skipping duplicate spawn.`));
    return;
  }
  global._activeBots[folderName] = true;

  const sessionDir = path.join(__dirname, "sessions", folderName);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  let num = phoneNumber;
  if (!num && !folderName.startsWith("session_wa_qr_")) {
    num = process.env.PAIRING_NUMBER || config.pairingNumber;
  }
  if (num) num = num.replace(/[^0-9]/g, "");

  // --- Load Session from Supabase ---
  if (num && !fs.existsSync(path.join(sessionDir, "creds.json"))) {
    const authRecord = await db.getWhatsAppAuth(num);
    if (authRecord && authRecord.session_data) {
      const sessionData = authRecord.session_data;
      if (sessionData && typeof sessionData === 'object' && sessionData['creds.json']) {
        console.log(chalk.cyan(`📥 Loading full multi-file session for ${num} from Supabase...`));
        fs.ensureDirSync(sessionDir);
        for (const [file, content] of Object.entries(sessionData)) {
          fs.writeFileSync(path.join(sessionDir, file), JSON.stringify(content, null, 2));
        }
      } else {
        console.log(chalk.cyan(`📥 Loading legacy creds.json session for ${num} from Supabase...`));
        fs.writeFileSync(path.join(sessionDir, "creds.json"), JSON.stringify(sessionData, null, 2));
      }
    }
  }

  // legacy session ID support
  const sessionID = process.env[`SESSION_ID_${folderName.toUpperCase()}`] || process.env[folderName.toUpperCase()] || (folderName === "session_1" ? process.env.SESSION_ID : null);

  if (sessionID && !fs.existsSync(path.join(sessionDir, "creds.json"))) {
    try {
      const encodedData = sessionID.split("Session~")[1] || sessionID;
      const decodedData = Buffer.from(encodedData, "base64").toString("utf-8");
      const creds = JSON.parse(decodedData);
      fs.ensureDirSync(sessionDir);
      fs.writeFileSync(path.join(sessionDir, "creds.json"), JSON.stringify(creds, null, 2));
    } catch (e) {
      fs.writeFileSync(path.join(sessionDir, "creds.json"), sessionID);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const usePairingCode = !!num;

  const sock = makeWASocket({
    version,
    qrTimeout: undefined,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    logger: pino({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
    },
    patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(message.interactiveMessage || message.interactiveResponse || message.buttonsMessage || message.templateMessage || message.listMessage);
        if (requiresPatch) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {}
                        },
                        ...message
                    }
                }
            };
        }
        return message;
    },
    getMessage: async (key) => ({ conversation: config.botName }),
    defaultQueryTimeoutMs: 0,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    emitOwnEvents: true,
    fireInitQueries: true,
    generateHighQualityLinkPreview: true,
    shouldSyncHistory: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  // Register socket in global clients list for dashboard
  sock._folderName = folderName;
  sock._num = num || null;
  global.clients = (global.clients || []).filter(c => c._folderName !== folderName);
  global.clients.push(sock);

  const isPairingMode = global.pairingMode && global.pairingMode[folderName];
  const codeAlreadyRequested = global.pairingCodeRequested && global.pairingCodeRequested[folderName];

  if (!sock.authState.creds.registered && num && isPairingMode && !codeAlreadyRequested) {
    // Throttling logic to avoid duplicate/spam pairing code requests
    global.lastPairingRequestTime = global.lastPairingRequestTime || {};
    const lastRequest = global.lastPairingRequestTime[folderName] || 0;
    const now = Date.now();
    if (now - lastRequest > 120_000) {
      setTimeout(async () => {
        try {
          if (!sock.authState.creds.registered) {
            global.pairingCodeRequested[folderName] = true; // Mark as requested BEFORE requesting to prevent race conditions
            global.lastPairingRequestTime[folderName] = Date.now();
            let code = await sock.requestPairingCode(num);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log(chalk.black.bgGreen(` [${folderName}] PAIRING CODE: `), chalk.white.bgRed.bold(` ${code} `));
            
            // Store for dashboard API polling
            global.pendingPairingCodes = global.pendingPairingCodes || {};
            global.pendingPairingCodes[num] = { code, time: Date.now() };
            
            // 🚀 Real-time: Upload pairing code to Supabase
            await db.updatePairingCode(num, code, 'connecting');
          }
        } catch (e) {
          console.log(chalk.red(`[${folderName}] Failed to get pairing code: ${e.message}`));
          // Reset status on failure so we can try again
          if (global.pairingCodeRequested) delete global.pairingCodeRequested[folderName];
          if (global.lastPairingRequestTime) delete global.lastPairingRequestTime[folderName];
        }
      }, 5000); // 5 seconds delay is much safer to ensure socket negotiation
    } else {
      console.log(chalk.yellow(`⚠️ [${folderName}] A pairing code request was skipped to avoid rate limits.`));
    }
  } else if (!sock.authState.creds.registered && num) {
    console.log(chalk.blue(`ℹ️ [${folderName}] Socket is unregistered. PairingMode: ${isPairingMode}, CodeRequested: ${codeAlreadyRequested}. Waiting for user action...`));
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log(chalk.yellow(`🔑 [${folderName}] New QR Code generated`));
      global.pendingQrs = global.pendingQrs || {};
      global.pendingQrs[folderName] = qr;
    }
    if (num) await db.updateWAStatus(num, connection || 'disconnected');

    if (connection === "close") {
      // Remove from global clients on disconnect
      global.clients = (global.clients || []).filter(c => c._folderName !== folderName);
      try {
        sock.ev.removeAllListeners();
      } catch (_) {}
      if (global._activeBots) {
        global._activeBots[folderName] = false;
      }
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      const isPendingAuth = isPairingMode || folderName.startsWith("session_wa_qr_") || (global.pendingQrs && global.pendingQrs[folderName]);
      if (!sock.authState.creds.registered && !isPendingAuth) {
        return;
      }

      if (statusCode === 401) {
        // Logged out — clear session and restart clean
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
        if (num) await db.updateWhatsAppSession(num, null);
        setTimeout(() => startBot(folderName, phoneNumber), 2000);
      } else if (shouldReconnect) {
        setTimeout(() => startBot(folderName, phoneNumber), 10000);
      }
    } else if (connection === "open") {
      console.log(chalk.green(`✅ [${folderName}] Connected!`));
      
      const resolvedNum = num || (sock.user?.id?.split('@')[0]?.split(':')[0]);
      if (resolvedNum) {
        sock._num = resolvedNum;
        if (global.pendingQrs) delete global.pendingQrs[folderName];
      }

      // ✅ Clear pairing mode on successful connection
      if (global.pairingMode) delete global.pairingMode[folderName];
      if (global.pairingCodeRequested) delete global.pairingCodeRequested[folderName];
      if (resolvedNum && global.pendingPairingCodes) delete global.pendingPairingCodes[resolvedNum];
      if (resolvedNum) await db.updatePairingCode(resolvedNum, null, 'connected'); // Clear code on success
      
      // Sync credentials to Supabase for the first time
      if (resolvedNum) {
        await saveFullSessionToDb(resolvedNum, sessionDir);
      }
      // Session backup - wrapped in try-catch to prevent crashes
      setTimeout(async () => {
        try {
          if (!sock.ws || sock.ws.readyState !== 1) return; // Prevent crash if closed
          const credsPath = path.join(sessionDir, "creds.json");
          if (fs.existsSync(credsPath)) {
            const creds = fs.readFileSync(credsPath);
            await sock.sendMessage(sock.user.id, {
              document: creds,
              mimetype: "application/json",
              fileName: "creds.json",
              caption: `📂 Session backup (${folderName})`
            });
          }
        } catch (e) {
          console.log(`[${folderName}] Session backup skipped:`, e.message);
        }
      }, 10000); // Wait 10 seconds after connection before sending

      try {
        if (!sock._schedulersStarted) {
          sock._schedulersStarted = true;
          startDuasScheduler(sock, { sendWithChannelButton, config });
          startRamadanScheduler(sock);
          startPrayerScheduler(sock);
        }
        
        if (!global._globalSchedulersStarted) {
          global._globalSchedulersStarted = true;
          startTrafficInterval(); // New Traffic Booster
          const { startNewsScheduler } = require("./lib/newsAutoPoster");
          startNewsScheduler(); // Enabled fresh news poster
          const { startGithubScheduler } = require("./lib/githubAutoPoster");
          startGithubScheduler(); // Enabled GitHub trending poster
        }
      } catch (e) {
        console.log(`[${folderName}] Schedulers error:`, e.message);
      }
    }
  });

  let lastCredsSync = 0;
  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
    } catch (err) {
      // Ignore ENOENT if folder was deleted
    }
    if (num) {
      // Throttle Supabase sync to once every 5 minutes (300000 ms)
      const now = Date.now();
      if (now - lastCredsSync > 300000) {
        lastCredsSync = now;
        await saveFullSessionToDb(num, sessionDir);
      }
    }
  });

  sock.ev.on("call", async (callNode) => {
    const { enabled } = readAntiCallState();
    if (!enabled) return;
    for (const call of callNode) {
      if (call.status === "offer") {
        await sock.rejectCall(call.id, call.from);
        const warningMsg = `🚫 *ممنوع الاتصال*\n\nتم رفض المكالمة تلقائياً. المرجو التواصل عبر الرسائل فقط.\n\n📸 *Instagram:* ${config.instagram}\n⚔️ ${config.botName}`;
        await sock.sendMessage(call.from, { text: warningMsg });
        await sock.updateBlockStatus(call.from, "block");
      }
    }
  });

  sock.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      if (chatUpdate.type !== "notify") return;
      for (const msg of chatUpdate.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        // Skip old messages (> 120 seconds) to avoid spam bans/unanswered blue ticks on reconnect
        const messageTime = msg.messageTimestamp ? (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : parseInt(msg.messageTimestamp)) : null;
        if (messageTime) {
          const currentTime = Math.floor(Date.now() / 1000);
          if (currentTime - messageTime > 120) {
            console.log(chalk.yellow(`⏳ [WA MSG] Skipping old message from ${msg.key.remoteJid} (sent ${currentTime - messageTime}s ago)`));
            continue;
          }
        }

        // Check if this WhatsApp bot is paused
        const cleanBotPhone = (sock.user?.id?.split(':')[0] || sock._num || '').replace(/[^0-9]/g, '');
        if (cleanBotPhone && global.pausedBots?.whatsapp?.[cleanBotPhone]) {
          continue;
        }

        let realMessage = msg.message;
        if (realMessage?.viewOnceMessage?.message) realMessage = realMessage.viewOnceMessage.message;
        if (realMessage?.viewOnceMessageV2?.message) realMessage = realMessage.viewOnceMessageV2.message;
        if (realMessage?.viewOnceMessageV2Extension?.message) realMessage = realMessage.viewOnceMessageV2Extension.message;
        if (realMessage?.documentWithCaptionMessage?.message) realMessage = realMessage.documentWithCaptionMessage.message;

        const type = Object.keys(realMessage)[0];
        let body = type === "conversation" ? realMessage.conversation : type === "extendedTextMessage" ? realMessage.extendedTextMessage.text : type === "imageMessage" ? realMessage.imageMessage.caption : type === "videoMessage" ? realMessage.videoMessage.caption : "";

        if (type === 'interactiveResponseMessage') {
          const response = realMessage.interactiveResponseMessage;
          if (response.nativeFlowResponseMessage) {
            try {
              const params = JSON.parse(response.nativeFlowResponseMessage.paramsJson);
              body = params.id || params.text || response.nativeFlowResponseMessage.paramsJson;
            } catch (e) {
              body = response.nativeFlowResponseMessage.paramsJson;
            }
          } else if (response.body) {
            body = response.body.text;
          }
        } else if (type === 'buttonsResponseMessage') {
          body = realMessage.buttonsResponseMessage.selectedButtonId || realMessage.buttonsResponseMessage.selectedDisplayText;
        } else if (type === 'templateButtonReplyMessage') {
          body = realMessage.templateButtonReplyMessage.selectedId || realMessage.templateButtonReplyMessage.selectedDisplayText;
        } else if (type === 'listResponseMessage') {
          body = realMessage.listResponseMessage.singleSelectReply?.selectedRowId;
        } else if (type === 'messageContextInfo' || realMessage.messageContextInfo) {
          const reply = realMessage.listResponseMessage?.singleSelectReply?.selectedRowId || realMessage.buttonsResponseMessage?.selectedButtonId || realMessage.templateButtonReplyMessage?.selectedId;
          if (reply) body = reply;
        }

        console.log(chalk.magenta(`[WA MSG] from: ${msg.key.remoteJid} | type: ${type} | body: ${body ? body.substring(0,40) : '[no text]'}`));
        console.log(chalk.gray(`[WA MSG Key]: ${JSON.stringify(msg.key)}`));
        console.log(chalk.gray(`[WA MSG Full]: ${JSON.stringify(msg)}`));

        if (!body && type !== "imageMessage" && type !== "videoMessage" && type !== "audioMessage") continue;
        if (msg.key.remoteJid === "status@broadcast" || msg.key.remoteJid.includes("@newsletter")) continue;

        let sender = msg.key.remoteJid;
        const isGroup = sender.endsWith("@g.us");
        const userPhoneJid = msg.key.senderPn || (isGroup ? msg.key.participant : sender);

        if (isGroup) {
          // If it's a group, only reply if:
          // 1. It starts with a prefix (command)
          // 2. OR it mentions the bot
          // 3. OR it's a reply to the bot's own message
          // 4. OR group chatbot auto-reply is explicitly enabled
          const botNumber = sock.user.id.split(':')[0].split('@')[0];
          const botJid = `${botNumber}@s.whatsapp.net`;
          
          const isPrefixed = body && (body.startsWith('.') || body.startsWith('/'));
          
          // Check mentions
          const msgContent = msg.message?.[type];
          const contextInfo = msgContent?.contextInfo || msg.message?.extendedTextMessage?.contextInfo;
          const mentions = contextInfo?.mentionedJid || [];
          const isMentioned = mentions.includes(botJid) || (body && body.includes(`@${botNumber}`));
          
          // Check if replying to bot's message
          const isReplyToBot = contextInfo?.quotedMessage && contextInfo?.participant?.split(':')[0] === botNumber;
          
          if (config.enableGroupChatbot !== 'true' && !isPrefixed && !isMentioned && !isReplyToBot) {
            continue; // Skip normal chatter in groups
          }
        }

        logUser(userPhoneJid || sender);

        if (msg.pushName) {
          global.waNames = global.waNames || {};
          const cleanId = (userPhoneJid || sender).split('@')[0];
          if (global.waNames[cleanId] !== msg.pushName) {
            global.waNames[cleanId] = msg.pushName;
            db.saveUserNames('whatsapp', global.waNames).catch(() => {});
          }
        }

        // Activity log for dashboard
        try {
          global._activityLog = global._activityLog || [];
          const preview = body ? (body.length > 60 ? body.substring(0, 60) + '...' : body) : '[Media]';
          global._activityLog.unshift({
            time: new Date().toISOString(),
            platform: 'whatsapp',
            user: (userPhoneJid || sender).split('@')[0],
            message: preview
          });
          if (global._activityLog.length > 50) global._activityLog.length = 50;
        } catch (_) {}

        // --- Intercept Audio / Voice Messages for Voice-to-Voice Chatbot ---
        let isVoiceQuery = false;
        if (type === "audioMessage") {
          try {
            const stream = await require('@whiskeysockets/baileys').downloadContentFromMessage(
              msg.message.audioMessage,
              'audio'
            );
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const transcribed = await ai.transcribeAudio(buffer, "audio/ogg");
            if (transcribed) {
              body = transcribed;
              isVoiceQuery = true;
              console.log(chalk.cyan(`🎤 Voice query transcribed: "${body}"`));
            } else {
              // Transcription returned empty — notify user so message is not silently dropped
              await sock.sendMessage(sender, { text: "❌ لم أتمكن من فهم الرسالة الصوتية. جرب إرسال نص بدلاً." }, { quoted: msg });
              continue;
            }
          } catch (err) {
            console.error('[Voice Transcription Error]:', err.message);
            await sock.sendMessage(sender, { text: "❌ خطأ في معالجة الصوت. حاول مرة أخرى." }, { quoted: msg }).catch(() => {});
            continue;
          }
        }

        // Check if user is banned
        try {
          const senderJid = (userPhoneJid || sender).includes('@') ? (userPhoneJid || sender) : `${userPhoneJid || sender}@s.whatsapp.net`;
          if (global.bannedUsersCache && global.bannedUsersCache.includes(senderJid)) continue;
        } catch (_) {}

        // ===== OWNER CHECK =====
        const senderNum = (userPhoneJid || sender).replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
        const isOwner = config.ownerNumber.some(n => n.replace(/[^0-9]/g, '') === senderNum);
        // ===== END OWNER CHECK =====

        // Check for profanity / bad language (exclude owner)
        if (body && !msg.key.fromMe && !isOwner) {
          const { scanMessage, handleProfanity } = require('./lib/profanity');
          const matchedBadWord = scanMessage(body);
          if (matchedBadWord) {
            const senderName = msg.pushName || sender.split('@')[0];
            await handleProfanity('WA', sender, senderName, body, matchedBadWord, sock, msg);
            continue;
          }
          const { scanMessage: scanIbhaya, handleIbhaya } = require('./lib/ibhaya');
          const matchedIbhaya = scanIbhaya(body);
          if (matchedIbhaya) {
            const senderName = msg.pushName || sender.split('@')[0];
            await handleIbhaya('WA', sender, senderName, body, matchedIbhaya, sock, msg);
            continue;
          }
        }

        // Increment message count for leaderboard
        if (body && !msg.key.fromMe) {
          const { incrementUser } = require('./lib/leaderboard');
          const senderName = msg.pushName || sender.split('@')[0];
          incrementUser('whatsapp', (userPhoneJid || sender), senderName);
        }

        if (phoneNumber) {
          if (!botUsersMap[phoneNumber]) botUsersMap[phoneNumber] = new Set();
          botUsersMap[phoneNumber].add(userPhoneJid || sender);
        }

        if (body && !msg.key.fromMe) {
          if (require('./config').enableAutoDL !== 'false') {
            const skipAI = await handleAutoDL(sock, sender, msg, body, processedMessages, { sendFBVideo, sendYTVideo, getYupraVideoByUrl, getOkatsuVideoByUrl });
            if (skipAI) continue;
          }
        }



        try { await sock.sendPresenceUpdate("available", sender); } catch (_) {}
        try { await sock.sendPresenceUpdate("composing", sender); } catch (_) {}
        const delayPromise = new Promise((resolve) => setTimeout(resolve, 500));

        let reply;
        let isCommand = false;
        const nanoKeywords = "nano|edit|adel|3adil|sawb|qad|badel|ghayir|ghayar|tahwil|convert|photoshop|ps|tadil|modify|change|عدل|تعديل|غير|تغيير|بدل|تبديل|صاوب|قاد|تحويل|حول|رد|دير|اضف|أضف|زيد";
        const enhanceKeywords = "hd|enhance|upscale|removebg|bg|background|وضح|تصفية|جودة|وضوح|خلفية|حيد-الخلفية";
        const colorizeKeywords = "colorize|color|لون|تلوين";
        const ghibliKeywords = "ghibli|anime-art|جيبلي|أنمي-فني";
        const allAIPrefixRegex = new RegExp(`^([\\.!])?(${nanoKeywords}|${enhanceKeywords}|${colorizeKeywords}|${ghibliKeywords})(\\s+.*|$)`, "i");
        const aiMatch = body ? body.match(allAIPrefixRegex) : null;

        if (aiMatch) {
          const keyword = aiMatch[2].toLowerCase();
          const rest = (aiMatch[3] || "").trim();
          const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (aiMatch[1] || (quotedMsg && (quotedMsg.imageMessage || quotedMsg.documentWithCaptionMessage?.message?.imageMessage))) {
            let aiType = "nano";
            if (new RegExp(`^(${enhanceKeywords})$`, "i").test(keyword)) {
              aiType = "enhance";
              if (keyword.includes("bg") || keyword.includes("background") || keyword.includes("خلفية")) aiType = "remove-bg";
              if (keyword.includes("upscale") || keyword.includes("جودة")) aiType = "upscale";
            } else if (new RegExp(`^(${colorizeKeywords})$`, "i").test(keyword)) aiType = "colorize";
            else if (new RegExp(`^(${ghibliKeywords})$`, "i").test(keyword)) aiType = "ghibli";

            try {
              try { await sock.readMessages([msg.key]); } catch (_) {}
              const editCmd = require('./commands/image/edit');
              await editCmd(sock, sender, msg, [], { aiType, aiPrompt: rest }, "ar");
              isCommand = true;
              continue;
            } catch (err) { }
          }
        }

        const isPrefixed = body && body.startsWith(".");
        const cleanBody = isPrefixed ? body.slice(1).trim() : body.trim();
        const cmdMatch = cleanBody.match(/^([a-zA-Z0-9\u0600-\u06FF\-_]+)(\s+.*|$)/i);

        if (cmdMatch) {
          const command = cmdMatch[1].toLowerCase();
          const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);
          const allCmds = ALL_COMMANDS;

          // Only trigger ALL_COMMANDS if the prefix is present
          if (isPrefixed && allCmds[command]) {
            try {
              try { await sock.readMessages([msg.key]); } catch (_) {}
              const cmdFile = require(`./commands/${allCmds[command]}`);
              await cmdFile(sock, sender, msg, args, { 
                getAutoGPTResponse, addToHistory, delayPromise, getUptime, 
                command, proto, generateWAMessageContent, generateWAMessageFromContent,
                commandUsage, commandErrors 
              }, "ar");
              isCommand = true;
              commandUsage[command] = (commandUsage[command] || 0) + 1;
              activeUsers.add(sender);
              // Log activity for dashboard
              if (!global._activityLog) global._activityLog = [];
              global._activityLog.unshift({ time: Date.now(), cmd: command, user: sender, chat: sender });
              if (global._activityLog.length > 100) global._activityLog.length = 100;
              if (global.trackCommand) global.trackCommand(command, 'whatsapp');
              continue;
            } catch (err) { 
              console.error(chalk.red(`[Command Error] .${command}:`), err.message);
              commandErrors[command] = (commandErrors[command] || 0) + 1;
              await db.logError(command, err.message, 'WA').catch(() => {});
            }
          }
        }

        // --- PRIORITY 1: IMAGE / AUDIO / DOCUMENT (always takes full control) ---
        const ai = require('./lib/ai');
        const isRawImage = type === "imageMessage";
        const isRawVideo = type === "videoMessage";
        const isMediaMsg = msg.message?.imageMessage || msg.message?.documentMessage;

        if (isMediaMsg) {
          // Image received → silently save to context history; do NOT auto-analyze or reply
          try {
            if (msg.message.imageMessage) {
              const stream = await require('@whiskeysockets/baileys').downloadContentFromMessage(
                msg.message.imageMessage, 'image'
              );
              let buffer = Buffer.from([]);
              for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
              if (buffer && buffer.length > 0) {
                try { await addToHistory(sender, "user", body || "[Image]", { buffer, mime: 'image/jpeg' }); } catch (_) {}
              }
            }
          } catch (mediaErr) {
            const isConnClosed = mediaErr?.output?.statusCode === 428 || mediaErr?.message?.includes('Connection Closed');
            if (!isConnClosed) console.error('[Media Save Error]:', mediaErr.message);
          }
          continue; // ← HARD STOP: never fall through to NLC or text AI
        }

        if (isRawImage || isRawVideo) {
          // Fallback: imageMessage/videoMessage — silently save to context history
          try {
            if (isRawImage) {
              const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: pino({ level: "silent" }) });
              if (buffer && buffer.length > 0) {
                try { await addToHistory(sender, "user", body || "[Image]", { buffer, mime: 'image/jpeg' }); } catch (_) {}
              }
            }
          } catch (err) {}
          continue;
        }

        // --- PRIORITY 2: NLC KEYWORDS (text only, no image attached) ---
        if (body && !isCommand && !body.startsWith(".") && !isQuestionOrInquiry(body)) {
          const lowerBody = body.toLowerCase();
          const nlcKeywords = NLC_KEYWORDS;
          const context = await getContext(sender);
          const hasRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;

          let nlcFound = false;
          for (const [key, nlcPath] of Object.entries(nlcKeywords)) {
            // Skip NLC image generation if user is likely asking about the recent photo they just sent
            if (hasRecentImg && key.includes("صورة") && (lowerBody.includes("في") || lowerBody.includes("شنو") || lowerBody.includes("اش") || lowerBody.includes("معنى") || lowerBody.includes("وصف") || lowerBody.includes("معايا"))) {
                continue;
            }

            const regex = new RegExp(`(^|\\s)(${key})(\\s|$)`, "i");
            if (regex.test(lowerBody)) {
              try {
                try { await sock.readMessages([msg.key]); } catch (_) {}
                const cmdFile = require(`./commands/${nlcPath}`);
                let rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                const cmdName = key.split("|")[0];
                await cmdFile(sock, sender, msg, rest, { 
                  getAutoGPTResponse, addToHistory, delayPromise, getUptime, 
                  command: cmdName, proto, generateWAMessageContent, generateWAMessageFromContent,
                  commandUsage, commandErrors
                }, detectLanguage(body));
                commandUsage[cmdName] = (commandUsage[cmdName] || 0) + 1;
                activeUsers.add(sender);
                nlcFound = true;
                break;
              } catch (e) { 
                console.error(chalk.red(`[NLC Error] ${key}:`), e.message);
                commandErrors[key.split("|")[0]] = (commandErrors[key.split("|")[0]] || 0) + 1;
                await db.logError(key.split("|")[0], e.message, 'WA').catch(() => {});
              }
            }
          }
          if (nlcFound) { isCommand = true; continue; }
        }

        // If it's a dot-command successfully handled, stop here
        // Note: if the command failed (isCommand=false), fall through to AI response
        if (isCommand) continue;

        // If chatbot is disabled globally, skip AI chat responses (read fresh config every time)
        if (require('./config').enableChatbot === 'false') continue;

        // --- PRIORITY 2.5: AUTO-DOWNLOAD (TikTok, CapCut, Twitter only — FB/IG/YT handled by handleAutoDL above) ---
        if (body && !isCommand) {
          const lowerForDL = body.toLowerCase();
          const isTikTokCapcutTwitter = /tiktok\.com|capcut\.com|twitter\.com|x\.com/.test(lowerForDL);
          if (isTikTokCapcutTwitter) {
            const waExtra = { getAutoGPTResponse, addToHistory, delayPromise, getUptime, proto, generateWAMessageContent, generateWAMessageFromContent, commandUsage, commandErrors };
            const downloaded = await handleAutoDownload(body, sock, sender, msg, waExtra);
            if (downloaded) continue;
          }
        }

        // --- PRIORITY 3: TEXT AI (pure text messages only) ---
        {
          let quotedText = "";
          if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedType = Object.keys(quotedMsg)[0];
            quotedText = quotedType === "conversation" ? quotedMsg.conversation : quotedType === "extendedTextMessage" ? quotedMsg.extendedTextMessage.text : quotedType === "imageMessage" ? quotedMsg.imageMessage.caption : quotedType === "videoMessage" ? quotedMsg.videoMessage.caption : "";
            if (quotedText) body = `[Mktob: "${quotedText}"]\n\nRd: ${body}`;
          }

          const context = await getContext(sender);
          const isRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
          if (isRecentImg && body.length > 2 && !body.startsWith(".")) {
            try {
              const analyze = require('./commands/ai/analyze');
              await analyze(sock, sender, msg, body.split(" "), { buffer: context.lastImage.buffer, mime: context.lastImage.mime, caption: body }, detectLanguage(body));
              continue; // analyze handles the reply
            } catch (e) {
              console.error("NL Vision Error:", e.message);
            }
          }

          if (!reply) {
            const aiPromises = [];
            if (config.geminiApiKey) aiPromises.push(getGeminiResponse(sender, body));
            if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(sender, body));

            // Add other free models to race
            aiPromises.push(getLuminAIResponse(sender, body));
            aiPromises.push(getAIDEVResponse(sender, body));
            aiPromises.push(getPollinationsResponse(sender, body));
            aiPromises.push(getBlackboxResponse(sender, body));
            aiPromises.push(getStableAIResponse(sender, body));
            aiPromises.push(getAutoGPTResponse(sender, body));

            console.log(chalk.cyan(`[AI] Racing ${aiPromises.length} providers for: "${body.substring(0,30)}"`));

            try {
              // Race them and return the first one that resolves with a value
              const racePromise = Promise.any(aiPromises.map(p => p.then(res => {
                if (!res) throw new Error("No response");
                return res;
              })));

              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000));
              reply = await Promise.race([racePromise, timeoutPromise]);
              if (reply) console.log(chalk.green(`[AI] Got response (${reply.length} chars)`));
            } catch (e) {
              console.log(chalk.yellow(`[AI] Race failed (${e.message}). Trying sequential fallback...`));
              // Sequential fallback for the most reliable one
              reply = await getStableAIResponse(sender, body) || await getBlackboxResponse(sender, body) || await getPollinationsResponse(sender, body);
              if (reply) console.log(chalk.green(`[AI] Sequential fallback succeeded`));
            }

            // Last resort: if ALL AI providers failed, give a basic reply so user knows bot is alive
            if (!reply) {
              console.log(chalk.red(`[AI] ALL providers failed for "${body.substring(0,30)}". Using fallback.`));
              reply = `🤖 *بوت حمزة اعمرني*\n\nأنا هنا! خدمات الذكاء الاصطناعي بطيئة قليلاً الآن.\n\nجرب:\n• *.menu* لرؤية الأوامر\n• *.ping* للتحقق من الاتصال\n• *.weather* للطقس\n• *.gen* لتوليد صورة`;
            }
          }
        }

        if (reply) {
          try { await sock.readMessages([msg.key]); } catch (_) {}
          await addToHistory(sender, "user", body);
          let botReplyText = reply;
          let extractedCommand = null;

          const cmdMatchAI = reply.match(/\[COMMAND:\s*(\.[a-zA-Z0-9\u0600-\u06FF\-_]+.*?)]/i);
          if (cmdMatchAI) {
            extractedCommand = cmdMatchAI[1].trim();
            botReplyText = reply.replace(cmdMatchAI[0], '').trim();
          }

          if (botReplyText) {
             await addToHistory(sender, "assistant", botReplyText);
             if (isVoiceQuery) {
               const audioBuffer = await generateTTS(botReplyText, detectLanguage(body));
               if (audioBuffer && audioBuffer.length > 0) {
                 try { await sock.sendPresenceUpdate("recording", sender); } catch (_) {}
                 await new Promise(res => setTimeout(res, 1500));
                 try {
                   await sock.sendMessage(sender, {
                     audio: audioBuffer,
                     mimetype: 'audio/mp4',
                     ptt: true
                   }, { quoted: msg });
                 } catch (msgErr) {
                   await sock.sendMessage(sender, {
                     audio: audioBuffer,
                     mimetype: 'audio/mp4',
                     ptt: true
                   });
                 }
                 try { await sock.sendPresenceUpdate("paused", sender); } catch (_) {}
               } else {
                  let sentRes;
                  try {
                    sentRes = await sock.sendMessage(sender, { text: botReplyText }, { quoted: msg });
                  } catch (msgErr) {
                    console.warn(`[WA Warn] Failed voice fallback JID send: ${msgErr.message}`);
                    sentRes = await sock.sendMessage(sender, { text: botReplyText });
                  }
                  console.log(chalk.green(`[WA Sent Voice Fallback] JID: ${sender} | Result: ${JSON.stringify(sentRes?.key)}`));
                }
             } else {
               const isAudio = botReplyText.length < 50 && (botReplyText.includes("تفضل") || botReplyText.includes("أوديو"));
               try { await sock.sendPresenceUpdate(isAudio ? "recording" : "composing", sender); } catch (_) {}
               const words = botReplyText.split(" ").length;
               const typingDelay = Math.min(Math.max(words * 200, 1500), 5000); 
               await new Promise(res => setTimeout(res, typingDelay));
               let sentRes;
                try {
                  sentRes = await sock.sendMessage(sender, { text: botReplyText }, { quoted: msg });
                } catch (msgErr) {
                  console.warn(`[WA Warn] Failed text JID send: ${msgErr.message}`);
                  sentRes = await sock.sendMessage(sender, { text: botReplyText });
                }
                console.log(chalk.green(`[WA Sent Text] JID: ${sender} | Result: ${JSON.stringify(sentRes?.key)}`));
                try { await sock.sendPresenceUpdate("paused", sender); } catch (_) {}
             }
          } else {
             await addToHistory(sender, "assistant", "[تم تنفيذ الأداة بنجاح]");
          }

          if (extractedCommand) {
              const cmdMatch = extractedCommand.match(/^[\.]?([a-zA-Z0-9\u0600-\u06FF\-_]+)(\s+.*|$)/i);
             if (cmdMatch) {
                const command = cmdMatch[1].toLowerCase();
                const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);
                const allCmds = ALL_COMMANDS;
                if (allCmds[command]) {
                    try {
                        const cmdFile = require(`./commands/${allCmds[command]}`);
                        await cmdFile(sock, sender, msg, args, { getAutoGPTResponse, addToHistory, delayPromise, getUptime, command, proto, generateWAMessageContent, generateWAMessageFromContent }, "ar");
                        commandUsage[command] = (commandUsage[command] || 0) + 1;
                        activeUsers.add(sender);
                        if (global.trackCommand) global.trackCommand(command, 'whatsapp');
                    } catch (err) {
                        console.error("AI Command Execution Error:", err);
                        await db.logError(command, err.message, 'WA').catch(() => {});
                    }
                }
             }
          }
        }
      }
    } catch (e) {
      console.error(`[MSG Handler Error]:`, e);
    }
  });
}

// --- Multi-Bot Startup via Supabase ---
(async () => {
  console.log(chalk.cyan("🔄 Initializing bots from Supabase..."));
  
  try {
    global.tgNames = await db.loadUserNames('telegram');
    global.fbNames = await db.loadUserNames('facebook');
    global.waNames = await db.loadUserNames('whatsapp');
    console.log(chalk.cyan(`📥 Loaded ${Object.keys(global.tgNames || {}).length} Telegram names, ${Object.keys(global.fbNames || {}).length} Facebook names, and ${Object.keys(global.waNames || {}).length} WhatsApp names from Supabase.`));
  } catch (e) {}

  // Load persisted command stats from Supabase
  try {
    const savedStats = await db.loadCmdStats();
    if (savedStats && savedStats.stats && typeof savedStats.stats === 'object') {
      global._cmdStats = savedStats.stats;
      global._cmdStatsByPlatform = savedStats.byPlatform || { whatsapp: {}, telegram: {}, facebook: {} };
      const totalCmds = Object.values(global._cmdStats).reduce((s, v) => s + v, 0);
      console.log(chalk.green(`📊 Restored ${Object.keys(global._cmdStats).length} command stats (${totalCmds} total uses) from Supabase.`));
    }
  } catch (e) {
    console.error(chalk.yellow('[Startup] Could not load cmd stats from Supabase:', e.message));
  }

  // Load paused bots list from Supabase cache
  global.pausedBots = { whatsapp: {}, telegram: {}, facebook: {} };
  try {
    const paused = await db.getCache('paused_bots');
    if (paused && typeof paused === 'object') {
      global.pausedBots = paused;
      console.log(chalk.green('⏸️ Loaded paused bots config from Supabase.'));
    }
  } catch (e) {
    console.error(chalk.yellow('[Startup] Could not load paused bots config:', e.message));
  }
  
  // 1. WhatsApp Bots
  const waBots = await db.getAllWhatsAppAuth();
  const uniqueBots = [];
  if (waBots && waBots.length > 0) {
    const seenNumbers = new Set();
    for (const bot of waBots) {
      if (!bot.phone_number) continue;
      const cleanNum = bot.phone_number.replace(/[^0-9]/g, '');
      if (cleanNum && !seenNumbers.has(cleanNum)) {
        seenNumbers.add(cleanNum);
        bot.phone_number = cleanNum;
        uniqueBots.push(bot);
      }
    }
  }

  if (uniqueBots.length > 0) {
    uniqueBots.forEach((bot, index) => {
      setTimeout(() => startBot(`session_wa_${bot.phone_number}`, bot.phone_number), 5000 * index);
    });
  } else {
    // Fallback if DB is empty
    startBot("session_1", config.pairingNumber);
  }

  // 2. Telegram/Facebook Bots from configs
  const botConfigs = await db.getBotConfigs();
  const dbTgTokens = new Set();
  if (botConfigs && botConfigs.length > 0) {
    botConfigs.forEach(conf => {
      if (conf.bot_type === 'telegram') {
        console.log(chalk.green(`✅ Starting Telegram Bot: ${conf.bot_name || 'Bot'}`));
        startTelegramBot(conf.bot_token);
        dbTgTokens.add(conf.bot_token);
      }
      if (conf.bot_type === 'facebook') {
        global.fbPageTokens = global.fbPageTokens || {};
        const parts = conf.bot_name.split('|');
        const pageId = parts[parts.length - 1].trim();
        global.fbPageTokens[pageId] = conf.bot_token;
        console.log(chalk.green(`✅ Registered Facebook Page Token for Page ID: ${pageId} (${parts[0]})`));
      }
    });
  }
  // Also start local config Telegram token if not already started from DB
  if (config.telegramToken && !dbTgTokens.has(config.telegramToken)) {
    startTelegramBot(); // guard inside will skip if already running
  }
})();

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('Connection Closed') || msg.includes('Bad MAC') || msg.includes('Stream Errored')) return;
  console.error(chalk.red('[Process] Unhandled Rejection:'), reason?.stack || reason);
});

process.on('uncaughtException', (err) => {
  const msg = err.message || '';
  if (msg.includes('Connection Closed')) return;
  console.error(chalk.red('[Process] Uncaught Exception:'), err?.stack || err);
  if (msg.includes('EBADF') || msg.includes('ENOMEM')) process.exit(1);
});
