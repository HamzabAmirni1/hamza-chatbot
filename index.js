const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, delay, Browsers, downloadMediaMessage, jidDecode } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const path = require('path');
const config = require('./config');
const { Boom } = require('@hapi/boom');

const sessionDir = path.join(__dirname, 'session');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    if (used > 450) {
        console.log(chalk.red('⚠️ RAM too high (>450MB), restarting bot...'));
        process.exit(1);
    }
}, 30000);

// Filter console logs to suppress Baileys noise
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

const silencePatterns = ['Bad MAC', 'Session error', 'Failed to decrypt', 'Closing session', 'Closing open session', 'Conflict', 'Stream Errored'];

function shouldSilence(args) {
    const msg = args[0];
    if (typeof msg === 'string') return silencePatterns.some(pattern => msg.includes(pattern));
    return false;
}

console.error = (...args) => { if (!shouldSilence(args)) originalConsoleError.apply(console, args); };
console.log = (...args) => { if (!shouldSilence(args)) originalConsoleLog.apply(console, args); };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const express = require('express');
const app = express();
const port = process.env.PORT || 8000;

// Simple Keep-Alive Server for Koyeb
app.get('/', (req, res) => res.send(`Bot ${config.botName} is Running! 🚀`));
app.listen(port, () => {
    console.log(chalk.green(`Server listening on port ${port}`));
    setInterval(() => {
        axios.get(`http://localhost:${port}`).catch(() => { });
    }, 5 * 60 * 1000);
});

const systemPromptText = `You are ${config.botName}, a helpful WhatsApp assistant developed by ${config.botOwner}. Answer in the same language as the user. You have memory of the conversation and can see images provided previously.`;

// Conversation Memory Storage
const chatMemory = new Map();
const MAX_HISTORY = 30; // Number of previous messages to remember (increased from 10)

function getContext(jid) {
    if (!chatMemory.has(jid)) {
        chatMemory.set(jid, { messages: [], lastImage: null });
    }
    return chatMemory.get(jid);
}

function addToHistory(jid, role, content, image = null) {
    const context = getContext(jid);
    context.messages.push({ role, content });
    if (image) context.lastImage = image;
    if (context.messages.length > MAX_HISTORY) context.messages.shift();
}

async function getOpenRouterResponse(jid, text, imageBuffer = null) {
    if (!config.openRouterKey) return null;
    const context = getContext(jid);
    const activeImage = imageBuffer || context.lastImage?.buffer;

    // Ordered list of reliable free models
    // Llama 3 90b is often most stable free model on OpenRouter
    const freeModels = [
        "meta-llama/llama-3.2-11b-vision-instruct:free",
        "google/gemini-2.0-flash-exp:free",
        "nousresearch/hermes-3-llama-3.1-405b:free",
        "qwen/qwen-2-7b-instruct:free",
    ];

    const messages = [
        { role: "system", content: systemPromptText },
        ...context.messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const userContent = [{ type: "text", text: text }];
    if (activeImage) {
        userContent.push({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${activeImage.toString('base64')}` }
        });
    }
    messages.push({ role: "user", content: userContent });

    for (const model of freeModels) {
        try {
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: model,
                messages: messages
            }, {
                headers: {
                    "Authorization": `Bearer ${config.openRouterKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/HamzabAmirni1/hamza-chatbot",
                    "X-Title": "Hamza Chatbot"
                },
                timeout: 20000 // 20s timeout
            });

            const reply = response.data?.choices?.[0]?.message?.content;
            if (reply) return reply;

        } catch (error) {
            console.log(chalk.yellow(`⚠️ OpenRouter Model ${model} failed: ${error.message}`));
            continue;
        }
    }
    return null;
}

async function getGeminiResponse(jid, text, imageBuffer = null, mimeType = 'image/jpeg') {
    if (!config.geminiApiKey) return null;
    const context = getContext(jid);
    const activeImage = imageBuffer || context.lastImage?.buffer;
    const activeMime = imageBuffer ? mimeType : (context.lastImage?.mime || 'image/jpeg');

    // Trying 'gemini-1.5-flash' on 'v1beta' (best)
    // Fallback 'gemini-pro' on 'v1' (legacy stable)
    const models = [
        { name: "gemini-1.5-flash", version: "v1beta" },
        { name: "gemini-pro", version: "v1" }
    ];

    for (const model of models) {
        if (model.name === 'gemini-pro' && activeImage) continue;

        try {
            const url = `https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:generateContent?key=${config.geminiApiKey}`;

            let fullPrompt = systemPromptText + "\n\n";
            context.messages.slice(-10).forEach(m => {
                fullPrompt += `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}\n`;
            });
            fullPrompt += `User: ${text}`;

            const contents = [{
                parts: [{ text: fullPrompt }]
            }];

            if (activeImage && model.name !== 'gemini-pro') {
                contents[0].parts.push({
                    inline_data: { mime_type: activeMime, data: activeImage.toString('base64') }
                });
            }

            const response = await axios.post(url, { contents }, { timeout: 20000 });
            const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (result) return result;

        } catch (error) {
            console.log(chalk.red(`⚠️ Gemini Direct Error (${model.name}): ${error.response?.data?.error?.message || error.message}`));
            continue;
        }
    }
    return null;
}


async function getGPTResponse(jid, message) {
    try {
        const context = getContext(jid);
        let historyText = context.messages.map(m => `${m.role}: ${m.content}`).join("\n");
        const systemPrompt = `You are ${config.botName}, developed by ${config.botOwner}. History:\n${historyText}\n\nQuery: `;
        const { data } = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(systemPrompt + message)}`);
        return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error) {
        console.error("GPT API Error:", error.message);
        return null;
    }
}

async function startBot() {
    // 🔄 Sync Session (Base64 Support)
    const sessionID = process.env.SESSION_ID;
    if (sessionID && !fs.existsSync(path.join(sessionDir, 'creds.json'))) {
        try {
            console.log(chalk.cyan('🔄 SESSION_ID detected, syncing session...'));
            const encodedData = sessionID.split('Session~')[1] || sessionID;
            const decodedData = Buffer.from(encodedData, 'base64').toString('utf-8');
            const creds = JSON.parse(decodedData);
            fs.ensureDirSync(sessionDir);
            fs.writeFileSync(path.join(sessionDir, 'creds.json'), JSON.stringify(creds, null, 2));
            console.log(chalk.green('✅ Session successfully restored from SESSION_ID'));
        } catch (e) {
            // Fallback to raw if not Base64 JSON
            fs.writeFileSync(path.join(sessionDir, 'creds.json'), sessionID);
        }
    } else if (!sessionID) {
        // Only clear if empty or invalid structure, but here we trust the previous cleanup step or existing logic
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        getMessage: async (key) => { return { conversation: config.botName } },
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
            if (requiresPatch) {
                message = { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, ...message } } };
            }
            return message;
        }
    });

    // Pairing Code Logic
    if (!sock.authState.creds.registered) {
        const hardcodedNumber = config.pairingNumber;
        let phoneNumber = process.env.PAIRING_NUMBER || hardcodedNumber;

        if (phoneNumber) {
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            console.log(chalk.cyan(`🔢 Initializing Pairing Code for: ${phoneNumber}...`));

            setTimeout(async () => {
                try {
                    console.log(chalk.yellow(`📡 Requesting code for ${phoneNumber}...`));
                    let code = await sock.requestPairingCode(phoneNumber);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(chalk.black.bgGreen(` ✅ PAIRING CODE: `), chalk.white.bgRed.bold(` ${code} `));
                    console.log(chalk.cyan("👉 Step 1: Open WhatsApp > Linked Devices"));
                    console.log(chalk.cyan("👉 Step 2: Link with phone number instead"));
                    console.log(chalk.cyan(`👉 Step 3: Enter: ${code}`));
                } catch (e) {
                    console.error(chalk.red("❌ Pairing Error:"), e.message);
                }
            }, 10000); // 10s Delay strictly for stability
        } else {
            console.log(chalk.red("❌ Please set PAIRING_NUMBER in config.js or Environment Variables!"));
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error?.output?.statusCode) || (lastDisconnect?.error?.code);
            const reason = lastDisconnect?.error?.message || (new Boom(lastDisconnect?.error)?.output?.payload?.message) || 'not specified';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(chalk.red(`❌ Connection closed. Status: ${statusCode} | Reason: ${reason}`));

            if (statusCode === 401) {
                console.log(chalk.red("🔐 Session Expired or Logged Out. Clearing session..."));
                if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
                setTimeout(() => startBot(), 2000);
            } else if (shouldReconnect) {
                // FIXED: Increased delay to 10-15s to definitively stop the loop
                const delayReconnect = (statusCode === 428 || statusCode === 515) ? 10000 : 15000;
                console.log(chalk.yellow(`♻️ Reconnecting in ${delayReconnect}ms...`));
                setTimeout(() => startBot(), delayReconnect);
            } else {
                console.log(chalk.red("🛑 Reconnection disabled for this error. Exit."));
                process.exit(1);
            }
        } else if (connection === 'open') {
            console.log(chalk.green(`✅ ${config.botName} Connected! Auto-Reply is active.`));
            // Send Session (creds.json) to Self
            try {
                const creds = fs.readFileSync(path.join(sessionDir, 'creds.json'));
                // Send as file
                await sock.sendMessage(sock.user.id, { document: creds, mimetype: 'application/json', fileName: 'creds.json', caption: '📂 هادي Session ديالك (ملف احتياطي).' });

                // Send as Text for SESSION_ID
                const sessionStr = creds.toString();
                // Avoid sending huge texts if possible, but keeping logic
                await sock.sendMessage(sock.user.id, { text: sessionStr });
                await sock.sendMessage(sock.user.id, { text: '⚠️ مهم جداً: الرسالة اللي فوق 👆 هي الـ SESSION_ID ديالك.\nكوبي هاد الكود كامل وحطو ف Environment Variables ف Koyeb بسمية `SESSION_ID` باش البوت ميبقاش يطلب سكان كل مرة.' });
            } catch (e) {
                console.error("Failed to send session file:", e.message);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            // Only process notify messages
            if (chatUpdate.type !== 'notify') return;

            for (const msg of chatUpdate.messages) {
                if (!msg.message || msg.key.fromMe) continue; // Ignore self and empty messages

                const type = Object.keys(msg.message)[0];

                // Extract text body
                let body = (type === 'conversation') ? msg.message.conversation :
                    (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text :
                        (type === 'imageMessage') ? msg.message.imageMessage.caption :
                            (type === 'videoMessage') ? msg.message.videoMessage.caption : '';

                if (!body) continue;

                // Ignore Status Updates, Newsletters AND Groups (Private Only)
                if (msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid.includes('@newsletter') || msg.key.remoteJid.endsWith('@g.us')) continue;

                console.log(chalk.cyan(`Thinking response for: ${body.substring(0, 30)}...`));

                // Anti-Ban: Mark read and Type
                await sock.readMessages([msg.key]);
                await sock.sendPresenceUpdate('composing', msg.key.remoteJid);

                // Speed Optimization: Start "Thinking" immediately, don't wait 3s blocks
                // We run the delay concurrently with the AI request to ensure minimum "human-like" feel but max speed
                const delayPromise = new Promise(resolve => setTimeout(resolve, 500)); // Just 0.5s minimum delay

                let reply;
                const sender = msg.key.remoteJid;

                // 🚀 SUPER FAST COMMANDS (Running locally)
                if (body.toLowerCase() === '.ping') {
                    const start = Date.now();
                    await delayPromise;
                    await sock.sendMessage(sender, { text: `🏓 Pong! Speed: ${Date.now() - start}ms` }, { quoted: msg });
                    continue;
                }

                // AI Processing
                // 1. Try Image Analysis (if Image Message)
                if (type === 'imageMessage') {
                    console.log(chalk.yellow("📸 Downloading Image..."));
                    try {
                        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        const caption = msg.message.imageMessage.caption || "Describe this image.";
                        const mime = msg.message.imageMessage.mimetype;

                        // Priority 1: OpenRouter (Vision)
                        reply = await getOpenRouterResponse(sender, caption, buffer);

                        // Priority 2: Gemini Direct (Vision)
                        if (!reply) {
                            reply = await getGeminiResponse(sender, caption, buffer, mime);
                        }

                        if (!reply) {
                            reply = "⚠️ عافاك دير API Key (OpenRouter or Gemini) ف config.js باش نقدر نشوف التصاور.";
                        } else {
                            // Update history with image info
                            addToHistory(sender, 'user', caption, { buffer, mime });
                            addToHistory(sender, 'assistant', reply);
                        }

                    } catch (err) {
                        console.error("Image Download Error:", err);
                        reply = "❌ فشل تحميل الصورة.";
                    }
                } else {
                    // 2. Text Message

                    // Priority 1: OpenRouter (Supports Text & Vision History)
                    reply = await getOpenRouterResponse(sender, body);

                    // Priority 2: Gemini Direct
                    if (!reply) {
                        reply = await getGeminiResponse(sender, body);
                    }

                    // Priority 3: Pollinations (Fallback)
                    if (!reply) {
                        console.log(chalk.gray("⚠️ AI Providers Failed. Using Pollinations..."));
                        reply = await getGPTResponse(sender, body);
                    }

                    if (reply) {
                        addToHistory(sender, 'user', body);
                        addToHistory(sender, 'assistant', reply);
                    }
                }

                // Wait for the minimum delay if AI was super fast (unlikely, but good for UX)
                await delayPromise;

                // Reply to user
                if (reply) {
                    await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
                }
            }

        } catch (err) {
            console.error('Error in message handler:', err);
        }
    });
}

// Handle unhandled rejections to prevent crash (Global Scope - Fix Memory Leak)
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

startBot();
