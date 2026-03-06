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

// --- DNS FIX ---
try {
  dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1']);
  console.log(chalk.green('✅ DNS Servers set to Cloudflare/Google (1.1.1.1)'));
} catch (e) {
  console.error(chalk.red('❌ Failed to set DNS servers:'), e.message);
}

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
const { startTrafficInterval } = require("./lib/trafficBooster");
const { ALL_COMMANDS, NLC_KEYWORDS } = require('./lib/commandMap');
const bodyParser = require("body-parser");
const { Boom } = require("@hapi/boom");

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

const sessionBaseDir = path.join(__dirname, "sessions");
if (!fs.existsSync(sessionBaseDir)) fs.mkdirSync(sessionBaseDir, { recursive: true });

// Boot Sequence Delay
console.log(chalk.cyan("⏱️  Waiting 5 seconds... Instance created. Preparing to start..."));
setTimeout(() => {
  console.log(chalk.green("🚀 Starting Hamza Chatbot with Enhanced Stability..."));
}, 5000);

// Memory monitoring - Restart if RAM gets too high (Target: 512MB Server)
setInterval(() => {
  const used = process.memoryUsage().rss / 1024 / 1024;
  if (used > 450) { // Adjusted for 500MB server
    console.log(chalk.red("⚠️ RAM too high (>450MB), restarting bot..."));
    process.exit(1);
  }
}, 30000);

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
  };
  res.json(status);
});

app.get("/health", (req, res) => res.status(200).json({ status: "healthy", uptime: getUptime() }));
app.get("/ping", (req, res) => res.status(200).send("pong"));

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
  try {
    await sock.sendMessage(chatId, {
      video: { url: videoUrl },
      caption: `🎬 *${title}*\n\n✅ *Hamza Amirni YouTube Downloader*\n⚔️ ${config.botName}`,
      mimetype: 'video/mp4'
    }, { quoted });
  } catch (e) {
    console.error("sendYTVideo Error:", e.message);
  }
}

async function sendFBVideo(sock, chatId, videoUrl, apiName, quoted) {
  try {
    await sock.sendMessage(chatId, {
      video: { url: videoUrl },
      caption: `🎬 *Facebook Video*\n\nSource: ${apiName}\n✅ *Hamza Amirni FB Downloader*\n⚔️ ${config.botName}`,
      mimetype: 'video/mp4'
    }, { quoted });
  } catch (e) {
    console.error("sendFBVideo Error:", e.message);
  }
}

async function startBot(folderName, phoneNumber) {
  const sessionDir = path.join(__dirname, "sessions", folderName);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

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

  const usePairingCode = !!(phoneNumber || process.env.PAIRING_NUMBER || config.pairingNumber);

  const sock = makeWASocket({
    version,
    qrTimeout: undefined,
    browser: usePairingCode ? ["Ubuntu", "Chrome", "20.0.04"] : ["Hamza Bot", "Safari", "3.0"],
    logger: pino({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
    },
    getMessage: async (key) => ({ conversation: config.botName }),
    defaultQueryTimeoutMs: 120000,
    connectTimeoutMs: 120000,
    keepAliveIntervalMs: 10000,
    shouldSyncHistory: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  if (!sock.authState.creds.registered) {
    let num = phoneNumber || process.env.PAIRING_NUMBER || config.pairingNumber;
    if (num) {
      num = num.replace(/[^0-9]/g, "");
      setTimeout(async () => {
        try {
          let code = await sock.requestPairingCode(num);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(chalk.black.bgGreen(` [${folderName}] PAIRING CODE: `), chalk.white.bgRed.bold(` ${code} `));
        } catch (e) {
          console.log(chalk.red(`[${folderName}] Failed to get pairing code: ${e.message}`));
        }
      }, 5000 + (Math.random() * 5000)); // Stagger slightly
    }
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (statusCode === 401) {
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
        setTimeout(() => startBot(folderName, phoneNumber), 2000); // Pass args back
      } else if (shouldReconnect) {
        setTimeout(() => startBot(folderName, phoneNumber), 10000); // Pass args back
      } else {
        // Only exit process if main session fails repeatedly or config dictates
        console.log(chalk.red(`[${folderName}] Connection closed permanently (logged out).`));
      }
    } else if (connection === "open") {
      console.log(chalk.green(`✅ [${folderName}] Connected!`));
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
        startFbPostScheduler(sock, ownerJid);
        startTrafficInterval(); // New Traffic Booster
      } catch (e) {
        console.log(`[${folderName}] Schedulers error:`, e.message);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

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

        const cmdMatch = body && body.match(/^[\.]?([a-zA-Z0-9\u0600-\u06FF]+)(\s+.*|$)/i);
        if (cmdMatch) {
          const command = cmdMatch[1].toLowerCase();
          const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);
          const allCmds = ALL_COMMANDS;

          if (allCmds[command]) {
            try {
              const cmdFile = require(`./commands/${allCmds[command]}`);
              await cmdFile(sock, sender, msg, args, { getAutoGPTResponse, addToHistory, delayPromise, getUptime, command, proto, generateWAMessageContent, generateWAMessageFromContent }, "ar");
              isCommand = true;
              continue;
            } catch (err) { }
          }
        }

        // Natural Language Commands (Detect keywords without dot)
        if (body && !body.startsWith(".")) {
          const lowerBody = body.toLowerCase();
          const nlcKeywords = NLC_KEYWORDS;

          let nlcFound = false;
          for (const [key, path] of Object.entries(nlcKeywords)) {
            // Use word boundary for English and simple check for Arabic (starting with keyword)
            const regex = new RegExp(`(^|\\s)(${key})(\\s|$)`, "i");
            if (regex.test(lowerBody)) {
              try {
                let rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                // For Quran, if they mentions a surah name but not the word "quran", we should still try.
                // But for now, let's stick to these primary triggers.
                const cmdFile = require(`./commands/${path}`);
                await cmdFile(sock, sender, msg, rest, { getAutoGPTResponse, addToHistory, delayPromise, getUptime, command: key.split("|")[0], proto, generateWAMessageContent, generateWAMessageFromContent }, "ar");
                nlcFound = true;
                break;
              } catch (e) { }
            }
          }
          if (nlcFound) {
            isCommand = true;
            continue;
          }
        }

        // If it's a command, don't let AI handle it
        if (isCommand || (body && body.startsWith("."))) continue;

        if (type === "imageMessage" || type === "videoMessage") {
          try {
            const analyze = require('./commands/ai/analyze');
            const buffer = type === "imageMessage" ? await downloadMediaMessage(msg, "buffer", {}, { logger: pino({ level: "silent" }) }) : null;
            const mime = type === "imageMessage" ? msg.message.imageMessage.mimetype : msg.message.videoMessage.mimetype;
            const caption = type === "imageMessage" ? msg.message.imageMessage.caption : msg.message.videoMessage.caption;
            await analyze(sock, sender, msg, caption ? caption.split(" ") : [], { type, isVideo: type === "videoMessage", buffer, mime, caption }, "ar");
            continue;
          } catch (err) { }
        } else {
          let quotedText = "";
          if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedType = Object.keys(quotedMsg)[0];
            quotedText = quotedType === "conversation" ? quotedMsg.conversation : quotedType === "extendedTextMessage" ? quotedMsg.extendedTextMessage.text : quotedType === "imageMessage" ? quotedMsg.imageMessage.caption : quotedType === "videoMessage" ? quotedMsg.videoMessage.caption : "";
            if (quotedText) body = `[Mktob: "${quotedText}"]\n\nRd: ${body}`;
          }

          const context = getContext(sender);
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
          addToHistory(sender, "user", body);
          addToHistory(sender, "assistant", reply);
          await delayPromise;
          await sock.sendMessage(sender, { text: reply }, { quoted: msg });
        }
      }
    } catch (e) { }
  });
}

// Start Main Bot
startBot("session_1", config.pairingNumber);

// Start Telegram Bot
startTelegramBot();

// --- Global Error Handlers (Prevents crashes from Baileys internal errors) ---
process.on('unhandledRejection', (reason, promise) => {
  // Silently ignore known non-fatal Baileys errors
  const msg = reason?.message || String(reason);
  if (msg.includes('Connection Closed') || msg.includes('Bad MAC') || msg.includes('Stream Errored')) return;
  console.error(chalk.red('[Process] Unhandled Rejection:'), msg);
});

process.on('uncaughtException', (err) => {
  const msg = err.message || '';
  // 'Connection Closed' (428) is NORMAL in Baileys — WhatsApp reconnects automatically.
  // DO NOT exit the process for it — it caused "Instance stopped" every time analyze ran!
  if (msg.includes('Connection Closed')) {
    // Just log and let the auto-reconnect handle it
    return;
  }
  console.error(chalk.red('[Process] Uncaught Exception:'), msg);
  // Only exit for truly unrecoverable OS-level errors
  if (msg.includes('EBADF') || msg.includes('ENOMEM')) {
    console.log(chalk.yellow('🔄 Critical OS error detected, performing graceful restart...'));
    process.exit(1);
  }
});

// Start Extra Bots
if (config.extraNumbers && config.extraNumbers.length > 0) {
  config.extraNumbers.forEach((num, index) => {
    setTimeout(() => {
      startBot(`session_${index + 2}`, num);
    }, 10000 * (index + 1));
  });
}
