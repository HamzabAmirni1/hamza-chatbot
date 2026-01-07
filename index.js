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

const systemPromptText = `You are ${config.botName}, an advanced AI assistant developed by ${config.botOwner}. 

**Your Capabilities:**
- You understand and respond fluently in: Moroccan Darija (الدارجة المغربية), Standard Arabic (العربية الفصحى), English, and French
- You have perfect memory of this conversation and can reference previous messages
- You can analyze images when provided
- You provide detailed, accurate, and helpful responses
- You're knowledgeable about: technology, science, history, culture, religion, entertainment, coding, and general knowledge

**Your Personality:**
- Friendly, helpful, and professional
- You adapt your tone to match the user (casual for Darija, formal for Arabic)
- You give comprehensive answers with examples when needed
- You're honest when you don't know something

**Important Rules:**
- ALWAYS respond in the SAME language the user uses (if they write in Darija, respond in Darija)
- For religious questions, be respectful and accurate
- For technical questions, provide clear step-by-step explanations
- Keep responses concise but complete (2-4 paragraphs max unless asked for more)

Remember: You're here to help with ANYTHING - from simple questions to complex problems. Be smart, be helpful, be comprehensive!`;

// Conversation Memory Storage
const chatMemory = new Map();
const MAX_HISTORY = 50; // Increased for better context understanding

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

async function getPollinationsResponse(jid, message) {
    try {
        const context = getContext(jid);
        let historyText = context.messages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n");
        const systemPrompt = `You are ${config.botName}, developed by ${config.botOwner}. History:\n${historyText}\n\nQuery: `;
        const { data } = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(systemPrompt + message)}`, { timeout: 30000 });
        return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error) {
        console.error(chalk.red("Pollinations API Error:"), error.message);
        return null;
    }
}

async function getHuggingFaceResponse(jid, text) {
    try {
        const context = getContext(jid);
        let prompt = systemPromptText + "\n\n";
        context.messages.slice(-5).forEach(m => {
            prompt += `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}\n`;
        });
        prompt += `User: ${text}\nAssistant:`;

        const response = await axios.post(
            "https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1",
            { inputs: prompt, parameters: { max_new_tokens: 500, temperature: 0.7 } },
            { timeout: 30000 }
        );

        const reply = response.data?.[0]?.generated_text?.split('Assistant:').pop()?.trim();
        return reply || null;
    } catch (error) {
        console.error(chalk.red("HuggingFace API Error:"), error.message);
        return null;
    }
}

async function getOpenRouterResponse(jid, text, imageBuffer = null) {
    if (!config.openRouterKey) return null;
    const context = getContext(jid);
    const activeImage = imageBuffer || context.lastImage?.buffer;

    // Only try models that are actually working
    const freeModels = [
        "google/gemini-2.0-flash-exp:free",
        "nousresearch/hermes-3-llama-3.1-405b:free"
    ];

    const messages = [
        { role: "system", content: systemPromptText },
        ...context.messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
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
                timeout: 30000
            });

            const reply = response.data?.choices?.[0]?.message?.content;
            if (reply) return reply;

        } catch (error) {
            // Silently skip if rate limited
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

    // Only try gemini-2.0-flash-exp since that's what the user's key supports
    const models = [
        { name: "gemini-2.0-flash-exp", version: "v1beta" }
    ];

    for (const model of models) {
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

            if (activeImage) {
                contents[0].parts.push({
                    inline_data: { mime_type: activeMime, data: activeImage.toString('base64') }
                });
            }

            const response = await axios.post(url, { contents }, { timeout: 20000 });
            const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (result) return result;

        } catch (error) {
            // Silently skip if quota exceeded
            continue;
        }
    }
    return null;
}

async function getObitoAnalyze(imageBuffer, prompt = "ما الموجود في هذه الصورة؟ وذكر اسم الشخصية إن وجدت", mime = "image/jpeg") {
    // Some APIs (like Vercel) have a 4.5MB limit. Base64 adds ~33% overhead.
    // 3MB buffer results in ~4MB base64 string.
    if (imageBuffer.length > 3 * 1024 * 1024) {
        console.log(chalk.yellow("⚠️ Image too large for Obito API (>3MB). Skipping to fallbacks..."));
        return null;
    }

    try {
        const base64Image = `data:${mime};base64,${imageBuffer.toString('base64')}`;
        const { data } = await axios.post("https://obito-mr-apis.vercel.app/api/ai/analyze", {
            image: base64Image,
            prompt: prompt,
            lang: "ar"
        }, { timeout: 35000 });
        return data.results?.description || null;
    } catch (error) {
        if (error.response?.status !== 413) {
            console.error(chalk.red("Obito Analyze API Error:"), error.message);
        }
        return null; // Fallback to other providers
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
        keepAliveIntervalMs: 30000, // Standard stable value
        retryRequestDelayMs: 5000,
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

                // If no body and not a media message, skip
                if (!body && type !== 'imageMessage' && type !== 'videoMessage') continue;

                // Ignore Status Updates, Newsletters AND Groups (Private Only)
                if (msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid.includes('@newsletter') || msg.key.remoteJid.endsWith('@g.us')) continue;

                console.log(chalk.cyan(`Thinking response for: ${body ? body.substring(0, 30) : 'Media File'}...`));

                // Anti-Ban: Mark read and Type
                await sock.readMessages([msg.key]);
                await sock.sendPresenceUpdate('composing', msg.key.remoteJid);

                // Speed Optimization: Start "Thinking" immediately, don't wait 3s blocks
                // We run the delay concurrently with the AI request to ensure minimum "human-like" feel but max speed
                const delayPromise = new Promise(resolve => setTimeout(resolve, 500)); // Just 0.5s minimum delay

                let reply;
                const sender = msg.key.remoteJid;

                // 🚀 SUPER FAST COMMANDS (Running locally)
                if (body && body.toLowerCase() === '.ping') {
                    const start = Date.now();
                    await delayPromise;
                    await sock.sendMessage(sender, { text: `🏓 Pong! Speed: ${Date.now() - start}ms` }, { quoted: msg });
                    continue;
                }

                if (body && (body.toLowerCase() === '.menu' || body.toLowerCase() === '.help')) {
                    const menu = `╭─── *💎 ${config.botName} 💎* ───╮
│
│ *🤖 أوامر الذكاء الاصطناعي:*
│ ├ صيفط سؤال عادي (درجة، فصحى...)
│ ├ صيفط تصويرة مع وصف (شرح...)
│ ├ *.hl* - تحليل ذكي للصور (Anime/Characters)
│ └ البوت كيعقل على الهضرة (Context)
│
│ *🔧 أوامر الخدمة:*
│ ├ *.ping* - سرعة البوت
│ ├ *.credits* - حالة الـ APIs
│ └ *.menu* - هذه القائمة
│
│ *📱 حساباتي الشخصية:*
│ ├ 📸 *Instagram:* ${config.instagram}
│ ├ ✈️ *Telegram:* ${config.telegram}
│ ├ 📺 *YouTube:* ${config.youtube}
│ ├ 📘 *Facebook:* ${config.facebookPage}
│ ├ 📢 *WhatsApp Channel:* ${config.officialChannel}
│ └ 🌐 *Portfolio:* ${config.portfolio}
│
│ *🌍 اللغات المدعومة:*
│ ├ الدارجة المغربية 🇲🇦
│ ├ العربية الفصحى 🇸🇦
│ ├ English 🇺🇸
│ └ Français 🇫🇷
│
╰─── *Dev by ${config.botOwner}* ───╯
`;
                    await delayPromise;
                    await sock.sendMessage(sender, { text: menu }, { quoted: msg });
                    continue;
                }

                // 🚀 SOCIAL MEDIA COMMANDS
                if (body && body.toLowerCase() === '.ig') {
                    await sock.sendMessage(sender, { text: `📸 *Instagram:* ${config.instagram}\n📸 *Instagram 2:* ${config.instagram2}` }, { quoted: msg });
                    continue;
                }
                if (body && body.toLowerCase() === '.tg') {
                    await sock.sendMessage(sender, { text: `✈️ *Telegram:* ${config.telegram}` }, { quoted: msg });
                    continue;
                }
                if (body && body.toLowerCase() === '.yt') {
                    await sock.sendMessage(sender, { text: `📺 *YouTube:* ${config.youtube}` }, { quoted: msg });
                    continue;
                }
                if (body && body.toLowerCase() === '.fb') {
                    await sock.sendMessage(sender, { text: `📘 *Facebook:* ${config.facebook}\n📘 *Page:* ${config.facebookPage}` }, { quoted: msg });
                    continue;
                }
                if (body && body.toLowerCase() === '.channel') {
                    await sock.sendMessage(sender, { text: `📢 *WhatsApp Channel:* ${config.officialChannel}` }, { quoted: msg });
                    continue;
                }
                if (body && body.toLowerCase() === '.web') {
                    await sock.sendMessage(sender, { text: `🌐 *Portfolio:* ${config.portfolio}` }, { quoted: msg });
                    continue;
                }

                if (body && (body.toLowerCase() === '.credits' || body.toLowerCase() === '.quota')) {
                    let status = "📊 *حالة API ديالك:*\n\n";

                    // Check Gemini
                    if (config.geminiApiKey) {
                        try {
                            const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${config.geminiApiKey}`;
                            await axios.post(testUrl, { contents: [{ parts: [{ text: "test" }] }] }, { timeout: 5000 });
                            status += "✅ *Gemini API:* شغال\n";
                        } catch (error) {
                            if (error.response?.status === 429 || error.response?.data?.error?.message?.includes('quota')) {
                                status += "⚠️ *Gemini API:* Quota نفذ (0 requests)\n";
                            } else {
                                status += "❌ *Gemini API:* فيه مشكل\n";
                            }
                        }
                    } else {
                        status += "⚪ *Gemini API:* ما مفعلش\n";
                    }

                    // Check OpenRouter
                    if (config.openRouterKey) {
                        try {
                            const testResponse = await axios.get("https://openrouter.ai/api/v1/auth/key", {
                                headers: { "Authorization": `Bearer ${config.openRouterKey}` },
                                timeout: 5000
                            });
                            const credits = testResponse.data?.data?.limit_remaining || 0;
                            status += `✅ *OpenRouter:* ${credits} requests باقيين\n`;
                        } catch (error) {
                            status += "❌ *OpenRouter:* فيه مشكل\n";
                        }
                    } else {
                        status += "⚪ *OpenRouter:* ما مفعلش\n";
                    }

                    // Pollinations & HuggingFace (always available)
                    status += "✅ *Pollinations AI:* Unlimited (شغال)\n";
                    status += "✅ *HuggingFace:* Unlimited (شغال)\n";

                    status += "\n💡 البوت خدام ب 4 APIs، حتى واحد يوقف، الباقي يكملو!";

                    await sock.sendMessage(sender, { text: status }, { quoted: msg });
                    continue;
                }

                // AI Processing
                // 1. Try Image Analysis (if Image Message)
                if (type === 'imageMessage' || type === 'videoMessage') {
                    const isVideo = type === 'videoMessage';
                    console.log(chalk.yellow(`📸 Downloading ${isVideo ? 'Video' : 'Image'}...`));
                    try {
                        let buffer;
                        let caption;
                        let mime;

                        if (isVideo) {
                            caption = msg.message.videoMessage.caption || "ماذا يوجد في هذا الفيديو؟";
                            mime = msg.message.videoMessage.mimetype;
                            reply = await getPollinationsResponse(sender, caption);
                        } else {
                            buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                            caption = msg.message.imageMessage.caption || "";
                            mime = msg.message.imageMessage.mimetype;

                            const isQuestion = caption.length > 2;

                            // If it's a specific question, prioritize powerful reasoning models (Gemini/OpenRouter)
                            if (isQuestion) {
                                // Priority 1: OpenRouter (Conversational Vision)
                                reply = await getOpenRouterResponse(sender, caption, buffer);
                                if (reply) console.log(chalk.green("✅ OpenRouter responded to question."));

                                // Priority 2: Gemini Direct (Conversational Vision)
                                if (!reply) {
                                    reply = await getGeminiResponse(sender, caption, buffer, mime);
                                    if (reply) console.log(chalk.green("✅ Gemini responded to question."));
                                }

                                // Priority 3: Obito (Fast Identification Fallback)
                                if (!reply) {
                                    reply = await getObitoAnalyze(buffer, caption, mime);
                                    if (reply) {
                                        console.log(chalk.green("✅ Obito responded (Fallback)."));
                                        reply = `*⎔ ⋅ ───━ •﹝🤖 التحليل ﹞• ━─── ⋅ ⎔*\n\n${reply}\n\n*${config.botName} - ${config.botOwner}*`;
                                    }
                                }
                            } else {
                                // Default/Empty caption: Just identify what it is using Obito (Fast)
                                const prompt = "ما الموجود في هذه الصورة؟";
                                reply = await getObitoAnalyze(buffer, prompt, mime);
                                if (reply) {
                                    console.log(chalk.green("✅ Obito identified image."));
                                    reply = `*⎔ ⋅ ───━ •﹝🤖 التحليل الذكي ﹞• ━─── ⋅ ⎔*\n\n${reply}\n\n*${config.botName} - ${config.botOwner}*\n*⎔ ⋅ ───━ •﹝✅﹞• ━─── ⋅ ⎔*`;
                                }

                                if (!reply) {
                                    reply = await getOpenRouterResponse(sender, prompt, buffer);
                                }
                            }
                        }

                        if (!reply && !isVideo) {
                            reply = "⚠️ عافاك دير API Key (OpenRouter or Gemini) ف config.js باش نقدر نشوف التصاور.";
                        } else if (!reply && isVideo) {
                            reply = await getPollinationsResponse(sender, caption);
                        }

                        if (reply) {
                            addToHistory(sender, 'user', caption, buffer ? { buffer, mime } : null);
                            addToHistory(sender, 'assistant', reply);
                        }

                    } catch (err) {
                        console.error("Media Processing Error:", err);
                        reply = "❌ فشل معالجة الوسائط.";
                    }
                } else if (body && /^(حلل|حلل-صور|تحليل|.hl)$/i.test(body)) {
                    // Dedicated Analyze Command Logic
                    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
                    const quotedType = Object.keys(q || {})[0];

                    if (quotedType === 'imageMessage' || quotedType === 'documentWithCaptionMessage') {
                        await sock.sendPresenceUpdate('composing', sender);
                        try {
                            const quotedMsg = { message: q };
                            const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                            const caption = body.split(' ').slice(1).join(' ') || "ما الموجود في هذه الصورة؟ وذكر اسم الشخصية إن وجدت";
                            const mime = (q.imageMessage || q.documentWithCaptionMessage?.message?.imageMessage)?.mimetype || 'image/jpeg';

                            const result = await getObitoAnalyze(buffer, caption, mime);
                            if (result) {
                                reply = `*⎔ ⋅ ───━ •﹝🤖 التحليل الذكي ﹞• ━─── ⋅ ⎔*\n\n${result}\n\n*${config.botName} - ${config.botOwner}*\n*⎔ ⋅ ───━ •﹝✅﹞• ━─── ⋅ ⎔*`;
                                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                                reply = null; // Prevent double send
                            } else {
                                await sock.sendMessage(sender, { text: "❌ فشل تحليل الصورة." }, { quoted: msg });
                            }
                        } catch (e) {
                            await sock.sendMessage(sender, { text: "❌ خطأ في تحميل الصورة." }, { quoted: msg });
                        }
                    } else {
                        await sock.sendMessage(sender, { text: `*⎔ ⋅ ───━ •﹝🧠﹞• ━─── ⋅ ⎔*\n\n📝 *طريقة الاستخدام:* \nأرسل صورة مع سؤال أو رد على صورة مكتوباً:\n.hl من هذه الشخصية؟\n\n*${config.botName}*\n*⎔ ⋅ ───━ •﹝🧠﹞• ━─── ⋅ ⎔*` }, { quoted: msg });
                    }
                    continue;
                } else {
                    // 2. Text Message

                    // Priority 1: Pollinations (Unlimited & Free)
                    reply = await getPollinationsResponse(sender, body);

                    // Priority 2: HuggingFace (Free, no key needed)
                    if (!reply) {
                        reply = await getHuggingFaceResponse(sender, body);
                    }

                    // Priority 3: OpenRouter (if key exists and not rate limited)
                    if (!reply && config.openRouterKey) {
                        reply = await getOpenRouterResponse(sender, body);
                    }

                    // Priority 4: Gemini Direct (if key exists and not quota exceeded)
                    if (!reply && config.geminiApiKey) {
                        reply = await getGeminiResponse(sender, body);
                    }

                    if (reply) {
                        addToHistory(sender, 'user', body);
                        addToHistory(sender, 'assistant', reply);
                    } else {
                        reply = "⚠️ جميع خدمات الذكاء الاصطناعي مشغولة حالياً. حاول مرة أخرى بعد قليل.";
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
