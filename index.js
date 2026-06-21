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
const { ALL_COMMANDS, NLC_KEYWORDS } = require('./lib/commandMap');
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

global.trackCommand = (command, platform) => {
  if (!global._cmdStats) global._cmdStats = {};
  if (!global._cmdStatsByPlatform) global._cmdStatsByPlatform = { whatsapp: {}, telegram: {}, facebook: {} };
  global._cmdStats[command] = (global._cmdStats[command] || 0) + 1;
  const plat = platform ? platform.toLowerCase() : 'whatsapp';
  if (!global._cmdStatsByPlatform[plat]) {
    global._cmdStatsByPlatform[plat] = {};
  }
  global._cmdStatsByPlatform[plat][command] = (global._cmdStatsByPlatform[plat][command] || 0) + 1;
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
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/api/status', async (req, res) => {
  try {
    const sessions = (global.clients || []).map(sock => {
      const user = sock?.user;
      return {
        jid: user?.id || null,
        number: user?.id?.split(':')[0] || sock._num || null,
        connected: !!user,
        path: sock._folderName || null
      };
    });
    
    // Fetch Telegram/Facebook configs from DB
    const configs = await db.getBotConfigs();
    const telegramBots = configs.filter(c => c.bot_type === 'telegram').map(c => ({
      id: c.id,
      name: c.bot_name,
      connected: !!(global.telegramBots && global.telegramBots[c.bot_token]) || (c.bot_token === config.telegramToken && !!global.telegramBot),
      token: c.bot_token ? `${c.bot_token.substring(0, 8)}...` : 'N/A'
    }));
    const facebookPages = configs.filter(c => c.bot_type === 'facebook').map(c => {
      const parts = c.bot_name.split('|');
      const pageId = parts[parts.length - 1].trim();
      const pageName = parts[0] === pageId ? 'Facebook Page' : parts[0];
      return {
        id: c.id,
        name: pageName,
        pageId: pageId,
        connected: true,
        token: c.bot_token ? `${c.bot_token.substring(0, 8)}...` : 'N/A'
      };
    });
    
    // Add local config defaults if not already present
    if (config.telegramToken && !telegramBots.some(b => b.token.startsWith(config.telegramToken.substring(0, 8)))) {
      telegramBots.push({
        id: 'local_tg',
        name: config.botName || 'Telegram Bot (محلي)',
        connected: !!global.telegramBot,
        token: `${config.telegramToken.substring(0, 8)}...`
      });
    }
    if (config.fbPageAccessToken && !facebookPages.some(p => p.token.startsWith(config.fbPageAccessToken.substring(0, 8)))) {
      facebookPages.push({
        id: 'local_fb',
        name: 'Facebook Page (محلي)',
        pageId: config.fbPageId || 'me',
        connected: true,
        token: `${config.fbPageAccessToken.substring(0, 8)}...`
      });
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
    
    // Disconnect active socket
    const activeClient = (global.clients || []).find(c => c._folderName === folderName);
    if (activeClient) { try { activeClient.end(); } catch (e) {} }
    global.clients = (global.clients || []).filter(c => c._folderName !== folderName);
    
    // Delete session from DB and file system
    const success = await db.deleteWhatsAppSession(cleanPhone);
    const sessionPath = path.join(__dirname, 'sessions', folderName);
    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    
    res.json({ success });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
      'enableNewsAutoPoster', 'enableTrafficBooster', 'trafficIntervalMinutes', 'enableChatbot', 'enableGroupChatbot'
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

    for (const u of rows) {
      if (!u.jid) continue;
      const platform = getPlatformFromJid(u.jid);
      const cleanId = u.jid.replace('tg:', '').replace('fb:', '').split('@')[0];
      const userObj = {
        id: cleanId,
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

app.post('/api/ban', (req, res) => {
  try {
    const { number, platform } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'رقم مطلوب' });
    const bannedPath = path.join(__dirname, 'data/banned.json');
    if (!fs.existsSync(path.dirname(bannedPath))) fs.mkdirSync(path.dirname(bannedPath), { recursive: true });
    let banned = [];
    try { banned = JSON.parse(fs.readFileSync(bannedPath, 'utf-8')); } catch (e) { banned = []; }
    
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
    
    if (!banned.includes(jid)) banned.push(jid);
    fs.writeFileSync(bannedPath, JSON.stringify(banned, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/unban', (req, res) => {
  try {
    const { number, platform } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'رقم مطلوب' });
    const bannedPath = path.join(__dirname, 'data/banned.json');
    let banned = [];
    try { banned = JSON.parse(fs.readFileSync(bannedPath, 'utf-8')); } catch (e) { banned = []; }
    
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
    
    banned = banned.filter(b => b !== jid && b !== cleanNum && b !== `tg:${cleanNum}` && b !== `fb:${cleanNum}`);
    fs.writeFileSync(bannedPath, JSON.stringify(banned, null, 2));
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


app.post('/api/broadcast', async (req, res) => {
  try {
    const { message, platform } = req.body;
    if (!message) return res.status(400).json({ ok: false, error: 'رسالة مطلوبة' });
    
    const targetPlatform = platform || 'all';
    let results = { whatsapp: { sent: 0, failed: 0 }, telegram: { sent: 0, failed: 0 }, facebook: { sent: 0, failed: 0 } };
    
    // Fetch all users from Supabase to construct target lists
    let waUsers = [], tgUsers = [], fbUsers = [];
    try {
      const rows = await db.getAllUsers();
      for (const u of rows) {
        if (!u.jid) continue;
        const plat = getPlatformFromJid(u.jid);
        const cleanId = u.jid.replace('tg:', '').replace('fb:', '');
        if (plat === 'whatsapp') {
          waUsers.push(u.jid);
        } else if (plat === 'telegram') {
          tgUsers.push(cleanId);
        } else if (plat === 'facebook') {
          fbUsers.push({ id: cleanId });
        }
      }
    } catch (e) {
      console.error('[Broadcast API] Failed to fetch users from Supabase, falling back to local files:', e.message);
      try { waUsers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/users.json'), 'utf-8') || '[]'); } catch (_) {}
      try { tgUsers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/tg_users.json'), 'utf-8') || '[]'); } catch (_) {}
      try { fbUsers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/fb_users.json'), 'utf-8') || '[]'); } catch (_) {}
    }
    
    // 1. WhatsApp Broadcast
    if (targetPlatform === 'all' || targetPlatform === 'whatsapp') {
      const clients = global.clients || [];
      if (waUsers.length > 0) {
        if (clients.length > 0) {
          const sock = clients.find(c => c?.user) || clients[0];
          for (const user of waUsers) {
            try {
              const jid = typeof user === 'string' ? user : (user.id || user.jid);
              if (!jid || jid === 'test@s.whatsapp.net') continue;
              await sock.sendMessage(jid, { text: message });
              results.whatsapp.sent++;
              await new Promise(r => setTimeout(r, 500));
            } catch (e) { results.whatsapp.failed++; }
          }
        } else {
          results.whatsapp.failed += waUsers.length;
        }
      }
    }
    
    // 2. Telegram Broadcast
    if (targetPlatform === 'all' || targetPlatform === 'telegram') {
      if (tgUsers.length > 0) {
        if (config.telegramToken) {
          const { sendTelegramPrayerReminder } = require('./lib/telegram');
          for (const chatId of tgUsers) {
            try {
              if (global.telegramBot) {
                await global.telegramBot.sendMessage(chatId, message);
              } else {
                await sendTelegramPrayerReminder(chatId, message);
              }
              results.telegram.sent++;
              await new Promise(r => setTimeout(r, 500));
            } catch (e) { results.telegram.failed++; }
          }
        } else {
          results.telegram.failed += tgUsers.length;
        }
      }
    }
    
    // 3. Facebook Broadcast
    if (targetPlatform === 'all' || targetPlatform === 'facebook') {
      if (fbUsers.length > 0) {
        if (config.fbPageAccessToken) {
          const { sendFacebookMessage } = require('./lib/facebook');
          for (const user of fbUsers) {
            try {
              const recipientId = typeof user === 'string' ? user : user.id;
              const pageId = typeof user === 'object' ? user.pageId : null;
              await sendFacebookMessage(recipientId, message, pageId || config.fbPageAccessToken);
              results.facebook.sent++;
              await new Promise(r => setTimeout(r, 500));
            } catch (e) { results.facebook.failed++; }
          }
        } else {
          results.facebook.failed += fbUsers.length;
        }
      }
    }
    
    const totalSent = results.whatsapp.sent + results.telegram.sent + results.facebook.sent;
    const totalFailed = results.whatsapp.failed + results.telegram.failed + results.facebook.failed;
    
    res.json({
      ok: true,
      sent: totalSent,
      failed: totalFailed,
      total: totalSent + totalFailed,
      details: results
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
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
          if (sock && sock.sendPresenceUpdate) {
            sock.sendPresenceUpdate("available");
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

async function startBot(folderName, phoneNumber) {
  global._activeBots = global._activeBots || {};
  if (global._activeBots[folderName]) {
    console.log(chalk.yellow(`⚠️ [startBot] Bot instance for ${folderName} is already starting or running. Skipping duplicate spawn.`));
    return;
  }
  global._activeBots[folderName] = true;

  const sessionDir = path.join(__dirname, "sessions", folderName);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  let num = phoneNumber || process.env.PAIRING_NUMBER || config.pairingNumber;
  if (num) num = num.replace(/[^0-9]/g, "");

  // --- Load Session from Supabase ---
  if (num && !fs.existsSync(path.join(sessionDir, "creds.json"))) {
    const authRecord = await db.getWhatsAppAuth(num);
    if (authRecord && authRecord.session_data) {
      console.log(chalk.cyan(`📥 Loading session for ${num} from Supabase...`));
      fs.writeFileSync(path.join(sessionDir, "creds.json"), JSON.stringify(authRecord.session_data, null, 2));
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
    browser: usePairingCode ? ['Ubuntu', 'Chrome', '20.0.04'] : ["Hamza Bot", "Safari", "3.0"],
    logger: pino({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
    },
    patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(message.interactiveResponse || message.buttonsMessage || message.templateMessage || message.listMessage);
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
    const { connection, lastDisconnect } = update;
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
      // ✅ Clear pairing mode on successful connection
      if (global.pairingMode) delete global.pairingMode[folderName];
      if (global.pairingCodeRequested) delete global.pairingCodeRequested[folderName];
      if (num) delete global.pendingPairingCodes[num];
      if (num) await db.updatePairingCode(num, null, 'connected'); // Clear code on success
      
      // Sync credentials to Supabase for the first time
      const credsPath = path.join(sessionDir, "creds.json");
      if (num && fs.existsSync(credsPath)) {
        const creds = fs.readJsonSync(credsPath);
        await db.updateWhatsAppSession(num, creds);
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
        try {
          const creds = fs.readJsonSync(path.join(sessionDir, "creds.json"));
          await db.updateWhatsAppSession(num, creds);
        } catch (e) {
             // Ignore read errors
        }
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
        const type = Object.keys(msg.message)[0];
        let body = type === "conversation" ? msg.message.conversation : type === "extendedTextMessage" ? msg.message.extendedTextMessage.text : type === "imageMessage" ? msg.message.imageMessage.caption : type === "videoMessage" ? msg.message.videoMessage.caption : "";
        console.log(chalk.magenta(`[WA MSG] from: ${msg.key.remoteJid} | type: ${type} | body: ${body ? body.substring(0,40) : '[no text]'}`));
        console.log(chalk.gray(`[WA MSG Key]: ${JSON.stringify(msg.key)}`));
        console.log(chalk.gray(`[WA MSG Full]: ${JSON.stringify(msg)}`));

        if (type === 'interactiveResponseMessage') {
          const response = msg.message.interactiveResponseMessage;
          if (response.nativeFlowResponseMessage) {
            const params = JSON.parse(response.nativeFlowResponseMessage.paramsJson);
            body = params.id;
          } else if (response.body) {
            body = response.body.text;
          }
        } else if (type === 'templateButtonReplyMessage') {
          body = msg.message.templateButtonReplyMessage.selectedId || msg.message.templateButtonReplyMessage.selectedDisplayText;
        } else if (type === 'listResponseMessage') {
          body = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        } else if (type === 'messageContextInfo') {
          const reply = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || msg.message.buttonsResponseMessage?.selectedButtonId || msg.message.templateButtonReplyMessage?.selectedId;
          if (reply) body = reply;
        }
        if (!body && type !== "imageMessage" && type !== "videoMessage" && type !== "audioMessage") continue;
        if (msg.key.remoteJid === "status@broadcast" || msg.key.remoteJid.includes("@newsletter")) continue;

        let sender = msg.key.remoteJid;
        if (sender.endsWith("@lid") && msg.key.senderPn) {
          sender = msg.key.senderPn;
          msg.key.remoteJid = sender;
        }
        const isGroup = sender.endsWith("@g.us");

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

        logUser(sender);

        // Activity log for dashboard
        try {
          global._activityLog = global._activityLog || [];
          const preview = body ? (body.length > 60 ? body.substring(0, 60) + '...' : body) : '[Media]';
          global._activityLog.unshift({
            time: new Date().toISOString(),
            platform: 'whatsapp',
            user: sender.split('@')[0],
            message: preview
          });
          if (global._activityLog.length > 50) global._activityLog.length = 50;
        } catch (_) {}

        // Check if user is banned
        try {
          const bannedPath = path.join(__dirname, 'data', 'banned.json');
          let bannedUsers = [];
          try { bannedUsers = JSON.parse(fs.readFileSync(bannedPath, 'utf8') || '[]'); } catch (_) {}
          const senderJid = sender.includes('@') ? sender : `${sender}@s.whatsapp.net`;
          if (bannedUsers.includes(senderJid)) continue;
        } catch (_) {}

        // ===== OWNER CHECK =====
        const senderNum = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
        const isOwner = config.ownerNumber.some(n => n.replace(/[^0-9]/g, '') === senderNum);
        // ===== END OWNER CHECK =====
        if (phoneNumber) {
          if (!botUsersMap[phoneNumber]) botUsersMap[phoneNumber] = new Set();
          botUsersMap[phoneNumber].add(sender);
        }

        if (body && !msg.key.fromMe) {
          const skipAI = await handleAutoDL(sock, sender, msg, body, processedMessages, { sendFBVideo, sendYTVideo, getYupraVideoByUrl, getOkatsuVideoByUrl });
          if (skipAI) continue;
        }

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
              console.log(chalk.cyan(`🎙️ Voice query transcribed: "${body}"`));
            }
          } catch (err) {
            console.error('[Voice Transcription Error]:', err.message);
          }
        }

        try { await sock.readMessages([msg.key]); } catch (_) {}
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
              const editCmd = require('./commands/image/edit');
              await editCmd(sock, sender, msg, [], { aiType, aiPrompt: rest }, "ar");
              isCommand = true;
              continue;
            } catch (err) { }
          }
        }

        const isPrefixed = body && body.startsWith(".");
        const cleanBody = isPrefixed ? body.slice(1).trim() : body.trim();
        const cmdMatch = cleanBody.match(/^([a-zA-Z0-9\u0600-\u06FF]+)(\s+.*|$)/i);

        if (cmdMatch) {
          const command = cmdMatch[1].toLowerCase();
          const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);
          const allCmds = ALL_COMMANDS;

          // Only trigger ALL_COMMANDS if the prefix is present
          if (isPrefixed && allCmds[command]) {
            try {
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
            }
          }
        }

        // --- PRIORITY 1: IMAGE / AUDIO / DOCUMENT (always takes full control) ---
        const ai = require('./lib/ai');
        const isRawImage = type === "imageMessage";
        const isRawVideo = type === "videoMessage";
        const isMediaMsg = msg.message?.imageMessage || msg.message?.documentMessage;

        if (isMediaMsg) {
          // Image/audio/document received → analyze ONLY, skip all NLC/command keyword matching
          try {
            const stream = await require('@whiskeysockets/baileys').downloadContentFromMessage(
              msg.message.imageMessage || msg.message.audioMessage || msg.message.documentMessage,
              msg.message.imageMessage ? 'image' : (msg.message.audioMessage ? 'audio' : 'document')
            );
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            try { await sock.sendPresenceUpdate('composing', sender); } catch (_) {}
            let response = "";

            if (msg.message.imageMessage) {
              const userQ = body || "Please analyze this image. If it contains text or a task, solve it in its original language.";
              response = await ai.analyzeImage(buffer, msg.message.imageMessage.mimetype || "image/jpeg", userQ);
              // Save context so follow-up questions work
              try { await addToHistory(sender, "user", userQ, { buffer, mime: 'image/jpeg' }); } catch (_) {}
            } else if (msg.message.documentMessage) {
              response = await ai.analyzeDocument(buffer, msg.message.documentMessage.mimetype, body || "Analyze this");
            }

            if (response) {
              try { await addToHistory(sender, "assistant", response); } catch (_) {}
              try {
                await sock.sendMessage(sender, { text: `🤖 *مساعد حمزة اعمرني:*\\n\\n${response}` }, { quoted: msg });
              } catch (msgErr) {
                await sock.sendMessage(sender, { text: `🤖 *مساعد حمزة اعمرني:*\\n\\n${response}` });
              }
            }
          } catch (mediaErr) {
            const isConnClosed = mediaErr?.output?.statusCode === 428 || mediaErr?.message?.includes('Connection Closed');
            if (!isConnClosed) console.error('[Media Handler Error]:', mediaErr.message);
          }
          continue; // ← HARD STOP: never fall through to NLC or text AI
        }

        if (isRawImage || isRawVideo) {
          // Fallback: imageMessage that didn't pass the isMediaMsg check (edge case)
          try {
            const analyze = require('./commands/ai/analyze');
            const buffer = isRawImage ? await downloadMediaMessage(msg, "buffer", {}, { logger: pino({ level: "silent" }) }) : null;
            const mime = isRawImage ? msg.message.imageMessage.mimetype : msg.message.videoMessage.mimetype;
            const caption = isRawImage ? msg.message.imageMessage.caption : msg.message.videoMessage.caption;
            await analyze(sock, sender, msg, caption ? caption.split(" ") : [], { type, isVideo: isRawVideo, buffer, mime, caption }, "ar");
          } catch (err) {}
          continue;
        }

        // --- PRIORITY 2: NLC KEYWORDS (text only, no image attached) ---
        if (body && !isCommand && !body.startsWith(".")) {
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
          await addToHistory(sender, "user", body);
          let botReplyText = reply;
          let extractedCommand = null;

          const cmdMatchAI = reply.match(/\[COMMAND:\s*(\.[a-zA-Z0-9\u0600-\u06FF\-]+.*?)]/i);
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
             const cmdMatch = extractedCommand.match(/^[\.]?([a-zA-Z0-9\u0600-\u06FF\-]+)(\s+.*|$)/i);
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
                    } catch (err) { console.error("AI Command Execution Error:", err); }
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
  if (botConfigs && botConfigs.length > 0) {
    botConfigs.forEach(conf => {
      if (conf.bot_type === 'telegram') {
        console.log(chalk.green(`✅ Starting Telegram Bot: ${conf.bot_name || 'Bot'}`));
        startTelegramBot(conf.bot_token);
      }
      if (conf.bot_type === 'facebook') {
        global.fbPageTokens = global.fbPageTokens || {};
        const parts = conf.bot_name.split('|');
        const pageId = parts[parts.length - 1].trim();
        global.fbPageTokens[pageId] = conf.bot_token;
        console.log(chalk.green(`✅ Registered Facebook Page Token for Page ID: ${pageId} (${parts[0]})`));
      }
    });
  } else {
    // Fallback to local config
    startTelegramBot();
  }
})();

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('Connection Closed') || msg.includes('Bad MAC') || msg.includes('Stream Errored')) return;
  console.error(chalk.red('[Process] Unhandled Rejection:'), msg);
});

process.on('uncaughtException', (err) => {
  const msg = err.message || '';
  if (msg.includes('Connection Closed')) return;
  console.error(chalk.red('[Process] Uncaught Exception:'), msg);
  if (msg.includes('EBADF') || msg.includes('ENOMEM')) process.exit(1);
});
