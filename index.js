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
  getBlackboxResponse,
  getStableAIResponse,
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

const bodyParser = require("body-parser");
const { Boom } = require("@hapi/boom");
const { db } = require("./lib/supabase");


// Store processed message IDs to prevent duplicates
const processedMessages = new Set();
const commandUsage = {};
const activeUsers = new Set();
const botUsersMap = {}; // { 'phoneNumber': Set(['userJid']) }

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
app.use(bodyParser.json());

// 🚀 Enhanced Keep-Alive Server for Koyeb (Prevents Sleep Mode)
app.get("/", (req, res) => {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host;
  if (host && !host.includes("127.0.0.1") && !host.includes("localhost")) {
    const detectedUrl = `${protocol}://${host}`;
    if (!config.publicUrl || config.publicUrl.includes("available-karena")) {
      config.publicUrl = detectedUrl;
      console.log(chalk.green(`✨ Auto-Detected Public URL: ${config.publicUrl}`));
      try {
        fs.writeFileSync(path.join(__dirname, "server_url.json"), JSON.stringify({ url: detectedUrl }));
      } catch (e) { }
    }
  }

  const status = {
    bot: config.botName, status: "running", uptime: getUptime(),
    timestamp: new Date().toISOString(), memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    version: config.version, publicUrl: config.publicUrl,
    platform: process.platform, arch: process.arch, node: process.version
  };
  res.json(status);
});

app.get("/health", (req, res) => res.status(200).json({ status: "healthy", uptime: getUptime() }));

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
  
  // Register in DB first
  await db.updateWhatsAppAuth(cleanPhone, null);
  
  // Start the bot (in a separate non-blocking call if needed, but startBot handles async naturally)
  startBot(`session_wa_${cleanPhone}`, cleanPhone);
  
  res.json({ status: "initiated", message: "Bot starting, wait for pairing code in Dashboard." });
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
  console.log(chalk.cyan(`🌐 Keep-Alive: ${config.publicUrl || "⚠️ Not Set"}`));

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

    // Ping external public URL if set
    if (config.publicUrl) {
      axios.get(config.publicUrl, { timeout: 10000 })
        .then(() => {
          // Success - silent or debug log
        })
        .catch((err) => {
          console.error(chalk.yellow(`Keep-Alive Ping Failed: ${err.message}`));
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

  if (!sock.authState.creds.registered && num) {
    // Reduced delay to 2.5s. Baileys often closes the connection if it waits too long
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log(chalk.black.bgGreen(` [${folderName}] PAIRING CODE: `), chalk.white.bgRed.bold(` ${code} `));
        
        // 🚀 Real-time: Upload pairing code to Supabase
        await db.updatePairingCode(num, code, 'connecting');
      } catch (e) {
        console.log(chalk.red(`[${folderName}] Failed to get pairing code: ${e.message}`));
      }
    }, 2500);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (num) await db.updateWAStatus(num, connection || 'disconnected');

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (statusCode === 401) {
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
        if (num) await db.updateWhatsAppSession(num, null); // Clear corrupted session
        setTimeout(() => startBot(folderName, phoneNumber), 2000);
      } else if (shouldReconnect) {
        setTimeout(() => startBot(folderName, phoneNumber), 10000);
      }
    } else if (connection === "open") {
      console.log(chalk.green(`✅ [${folderName}] Connected!`));
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
        startDuasScheduler(sock, { sendWithChannelButton, config });
        startRamadanScheduler(sock);
        startPrayerScheduler(sock);
        const ownerJid = config.ownerNumber?.[0] ? `${config.ownerNumber[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null;
        // startFbPostScheduler(sock, ownerJid); // Disabled per user request (not engaging)
        startTrafficInterval(); // New Traffic Booster
        const { startNewsScheduler } = require("./lib/newsAutoPoster");
        startNewsScheduler(); // Enabled fresh news poster
        const { startGithubScheduler } = require("./lib/githubAutoPoster");
        startGithubScheduler(); // Enabled GitHub trending poster
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
        if (!body && type !== "imageMessage" && type !== "videoMessage") continue;
        if (msg.key.remoteJid === "status@broadcast" || msg.key.remoteJid.includes("@newsletter") || msg.key.remoteJid.endsWith("@g.us")) continue;

        const sender = msg.key.remoteJid;
        logUser(sender);
        
        // Track unique users per bot
        if (phoneNumber) {
          if (!botUsersMap[phoneNumber]) botUsersMap[phoneNumber] = new Set();
          botUsersMap[phoneNumber].add(sender);
        }

        if (body && !msg.key.fromMe) {
          const skipAI = await handleAutoDL(sock, sender, msg, body, processedMessages, { sendFBVideo, sendYTVideo, getYupraVideoByUrl, getOkatsuVideoByUrl });
          if (skipAI) continue;
        }

        await sock.readMessages([msg.key]);
        await sock.sendPresenceUpdate("available", sender);
        await sock.sendPresenceUpdate("composing", sender);
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
              await cmdFile(sock, sender, msg, args, { getAutoGPTResponse, addToHistory, delayPromise, getUptime, command, proto, generateWAMessageContent, generateWAMessageFromContent }, "ar");
              isCommand = true;
              commandUsage[command] = (commandUsage[command] || 0) + 1;
              activeUsers.add(sender);
              continue;
            } catch (err) { }
          }
        }

        // --- PRIORITY 1: IMAGE / AUDIO / DOCUMENT (always takes full control) ---
        const ai = require('./lib/ai');
        const isRawImage = type === "imageMessage";
        const isRawVideo = type === "videoMessage";
        const isMediaMsg = msg.message?.imageMessage || msg.message?.audioMessage || msg.message?.documentMessage;

        if (isMediaMsg) {
          // Image/audio/document received → analyze ONLY, skip all NLC/command keyword matching
          try {
            const stream = await require('@whiskeysockets/baileys').downloadContentFromMessage(
              msg.message.imageMessage || msg.message.audioMessage || msg.message.documentMessage,
              msg.message.imageMessage ? 'image' : (msg.message.audioMessage ? 'audio' : 'document')
            );
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            await sock.sendPresenceUpdate('composing', sender);
            let response = "";

            if (msg.message.imageMessage) {
              const userQ = body || "اشرح لي هذه الصورة بالتفصيل.";
              response = await ai.analyzeImage(buffer, msg.message.imageMessage.mimetype || "image/jpeg", userQ);
              // Save context so follow-up questions work
              try { await addToHistory(sender, "user", userQ, { buffer, mime: 'image/jpeg' }); } catch (_) {}
            } else if (msg.message.audioMessage) {
              response = await ai.transcribeAudio(buffer, "audio/ogg");
            } else if (msg.message.documentMessage) {
              response = await ai.analyzeDocument(buffer, msg.message.documentMessage.mimetype, body || "Analyze this");
            }

            if (response) {
              try { await addToHistory(sender, "assistant", response); } catch (_) {}
              await sock.sendMessage(sender, { text: `🤖 *حمزة اعمرني AI:*\n\n${response}` }, { quoted: msg });
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

          let nlcFound = false;
          for (const [key, nlcPath] of Object.entries(nlcKeywords)) {
            const regex = new RegExp(`(^|\\s)(${key})(\\s|$)`, "i");
            if (regex.test(lowerBody)) {
              try {
                let rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                const cmdFile = require(`./commands/${nlcPath}`);
                await cmdFile(sock, sender, msg, rest, { getAutoGPTResponse, addToHistory, delayPromise, getUptime, command: key.split("|")[0], proto, generateWAMessageContent, generateWAMessageFromContent }, "ar");
                commandUsage[key.split("|")[0]] = (commandUsage[key.split("|")[0]] || 0) + 1;
                activeUsers.add(sender);
                nlcFound = true;
                break;
              } catch (e) { }
            }
          }
          if (nlcFound) { isCommand = true; continue; }
        }

        // If it's a dot-command already handled, stop here
        if (isCommand || (body && body.startsWith("."))) continue;

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
              await analyze(sock, sender, msg, body.split(" "), { buffer: context.lastImage.buffer, mime: context.lastImage.mime, caption: body }, "ar");
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

            try {
              // Race them and return the first one that resolves with a value
              const racePromise = Promise.any(aiPromises.map(p => p.then(res => {
                if (!res) throw new Error("No response");
                return res;
              })));

              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000));
              reply = await Promise.race([racePromise, timeoutPromise]);
            } catch (e) {
              console.log("AI Race failed or timed out. Falling back to sequential...");
              // Sequential fallback for the most reliable one
              reply = await getStableAIResponse(sender, body) || await getBlackboxResponse(sender, body) || await getPollinationsResponse(sender, body);
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
             const isAudio = botReplyText.length < 50 && (botReplyText.includes("تفضل") || botReplyText.includes("أوديو"));
             await sock.sendPresenceUpdate(isAudio ? "recording" : "composing", sender);
             const words = botReplyText.split(" ").length;
             const typingDelay = Math.min(Math.max(words * 200, 1500), 5000); 
             await new Promise(res => setTimeout(res, typingDelay));
             await sock.sendMessage(sender, { text: botReplyText }, { quoted: msg });
             await sock.sendPresenceUpdate("paused", sender);
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
                    } catch (err) { console.error("AI Command Execution Error:", err); }
                }
             }
          }
        }
      }
    } catch (e) { }
  });
}

// --- Multi-Bot Startup via Supabase ---
(async () => {
  console.log(chalk.cyan("🔄 Initializing bots from Supabase..."));
  
  // 1. WhatsApp Bots
  const waBots = await db.getAllWhatsAppAuth();
  if (waBots && waBots.length > 0) {
    waBots.forEach((bot, index) => {
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
      // Add FB token logic here if needed
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
