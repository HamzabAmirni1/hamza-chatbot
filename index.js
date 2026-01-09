const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, delay, Browsers, downloadMediaMessage, jidDecode } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const path = require('path');
const config = require('./config');
const { Boom } = require('@hapi/boom');
const CryptoJS = require("crypto-js");
const FormData = require('form-data');
const yts = require('yt-search');
const { igdl } = require("ruhend-scraper");
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { getSurahNumber } = require('./lib/quranUtils');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();
const quranSessions = {};

// Helper: Translate to English
async function translateToEn(text) {
    try {
        const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`);
        return res.data?.[0]?.[0]?.[0] || text;
    } catch (e) {
        return text;
    }
}

const AES_KEY = "ai-enhancer-web__aes-key";
const AES_IV = "aienhancer-aesiv";

function encryptSettings(obj) {
    return CryptoJS.AES.encrypt(
        JSON.stringify(obj),
        CryptoJS.enc.Utf8.parse(AES_KEY),
        {
            iv: CryptoJS.enc.Utf8.parse(AES_IV),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }
    ).toString();
}

async function processImageAI(filePath, prompt) {
    try {
        const img = fs.readFileSync(filePath, "base64");
        const settings = encryptSettings({
            prompt,
            size: "2K",
            aspect_ratio: "match_input_image",
            output_format: "jpeg",
            max_images: 1
        });

        const headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
            "Content-Type": "application/json",
            Origin: "https://aienhancer.ai",
            Referer: "https://aienhancer.ai/ai-image-editor"
        };

        const create = await axios.post(
            "https://aienhancer.ai/api/v1/k/image-enhance/create",
            { model: 2, image: `data:image/jpeg;base64,${img}`, settings },
            { headers }
        );

        const id = create?.data?.data?.id;
        if (!id) throw new Error("لم يتم العثور على معرف المهمة");

        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const r = await axios.post(
                "https://aienhancer.ai/api/v1/k/image-enhance/result",
                { task_id: id },
                { headers }
            );

            const data = r?.data?.data;
            if (!data) continue;
            if (data.status === "success") return { id, output: data.output, input: data.input };
            if (data.status === "failed") throw new Error(data.error || "فشلت العملية");
        }
        throw new Error("استغرق الأمر وقتاً طويلاً جداً");
    } catch (e) {
        throw e;
    }
}

/**
 * AI Labs - Image Generation Logic
 */
const aiLabs = {
    api: {
        base: 'https://text2pet.zdex.top',
        endpoints: { images: '/images' }
    },
    headers: {
        'user-agent': 'NB Android/1.0.0',
        'accept-encoding': 'gzip',
        'content-type': 'application/json',
        authorization: ''
    },
    state: { token: null },
    setup: {
        cipher: 'hbMcgZLlzvghRlLbPcTbCpfcQKM0PcU0zhPcTlOFMxBZ1oLmruzlVp9remPgi0QWP0QW',
        shiftValue: 3,
        dec(text, shift) {
            return [...text].map(c =>
                /[a-z]/.test(c) ?
                    String.fromCharCode((c.charCodeAt(0) - 97 - shift + 26) % 26 + 97) :
                    /[A-Z]/.test(c) ?
                        String.fromCharCode((c.charCodeAt(0) - 65 - shift + 26) % 26 + 65) :
                        c
            ).join('');
        },
        decrypt: async () => {
            if (aiLabs.state.token) return aiLabs.state.token;
            const decrypted = aiLabs.setup.dec(aiLabs.setup.cipher, aiLabs.setup.shiftValue);
            aiLabs.state.token = decrypted;
            aiLabs.headers.authorization = decrypted;
            return decrypted;
        }
    },
    generateImage: async (prompt = '') => {
        if (!prompt?.trim()) return { success: false, error: 'Empty prompt' };
        await aiLabs.setup.decrypt();
        try {
            const payload = { prompt };
            const url = aiLabs.api.base + aiLabs.api.endpoints.images;
            const res = await axios.post(url, payload, { headers: aiLabs.headers });
            if (res.data.code !== 0 || !res.data.data) return { success: false, error: 'Server failed to generate image.' };
            return { success: true, url: res.data.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

/**
 * PhotoEnhancer - HD, Remove BG, Upscale
 */
class PhotoEnhancer {
    constructor() {
        this.cfg = {
            base: "https://photoenhancer.pro",
            end: {
                enhance: "/api/enhance",
                status: "/api/status",
                removeBg: "/api/remove-background",
                upscale: "/api/upscale"
            },
            headers: {
                accept: "*/*",
                "content-type": "application/json",
                origin: "https://photoenhancer.pro",
                referer: "https://photoenhancer.pro/",
                "user-agent": "Mozilla/5.0 (Linux; Android 10) Chrome/127.0.0.0 Mobile Safari/537.36"
            }
        };
    }
    async poll(id) {
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const { data } = await axios.get(`${this.cfg.base}${this.cfg.end.status}?id=${id}`, { headers: this.cfg.headers });
            if (data?.status === "succeeded") return data;
            if (data?.status === "failed") throw new Error("Processing failed");
        }
        throw new Error("Processing timeout");
    }
    async generate({ imageBuffer, type }) {
        const imageData = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
        let endpoint = this.cfg.end.enhance;
        let body = { imageData, mode: "ultra", fileName: "image.png" };
        if (type === "remove-bg") { endpoint = this.cfg.end.removeBg; body = { imageData }; }
        if (type === "upscale") { endpoint = this.cfg.end.upscale; body = { imageData, targetResolution: "4K" }; }

        const init = await axios.post(`${this.cfg.base}${endpoint}`, body, { headers: this.cfg.headers });
        if (init.data?.predictionId) return await this.poll(init.data.predictionId).then(r => r.resultUrl);
        return init.data?.resultUrl;
    }
}

/**
 * ImageColorizer - Colorize B&W Photos
 */
class ImageColorizer {
    constructor() {
        this.cfg = {
            upUrl: "https://photoai.imglarger.com/api/PhoAi/Upload",
            ckUrl: "https://photoai.imglarger.com/api/PhoAi/CheckStatus",
            headers: {
                accept: "application/json, text/plain, */*",
                origin: "https://imagecolorizer.com",
                referer: "https://imagecolorizer.com/",
                "user-agent": "Mozilla/5.0 (Linux; Android 10) Chrome/127.0.0.0 Mobile Safari/537.36"
            }
        };
    }
    async upload(buffer, prompt = "") {
        const form = new FormData();
        form.append("file", buffer, { filename: "image.jpg", contentType: "image/jpeg" });
        form.append("type", 17);
        form.append("restore_face", "false");
        form.append("upscale", "false");
        form.append("positive_prompts", Buffer.from(prompt + ", masterpiece, high quality").toString("base64"));
        form.append("negative_prompts", Buffer.from("low quality, blur").toString("base64"));
        form.append("scratches", "false");
        form.append("portrait", "false");
        form.append("color_mode", "2");

        const res = await axios.post(this.cfg.upUrl, form, { headers: { ...this.cfg.headers, ...form.getHeaders() } });
        return res?.data?.data;
    }
    async check(code, type) {
        const res = await axios.post(this.cfg.ckUrl, { code, type }, { headers: { ...this.cfg.headers, "content-type": "application/json" } });
        return res?.data;
    }
    async generate(buffer, prompt) {
        const task = await this.upload(buffer, prompt);
        if (!task?.code) throw new Error("Failed to get task code");
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const status = await this.check(task.code, task.type || 17);
            if (status?.data?.status === "success") return status.data.downloadUrls[0];
        }
        throw new Error("Processing timeout");
    }
}

const ANTICALL_PATH = path.join(__dirname, 'data', 'anticall.json');

function readAntiCallState() {
    try {
        if (!fs.existsSync(ANTICALL_PATH)) {
            if (!fs.existsSync(path.dirname(ANTICALL_PATH))) fs.mkdirSync(path.dirname(ANTICALL_PATH), { recursive: true });
            fs.writeFileSync(ANTICALL_PATH, JSON.stringify({ enabled: true }, null, 2));
            return { enabled: true };
        }
        const data = JSON.parse(fs.readFileSync(ANTICALL_PATH, 'utf8') || '{}');
        return { enabled: !!data.enabled };
    } catch {
        return { enabled: true };
    }
}

function writeAntiCallState(enabled) {
    try {
        if (!fs.existsSync(path.dirname(ANTICALL_PATH))) fs.mkdirSync(path.dirname(ANTICALL_PATH), { recursive: true });
        fs.writeFileSync(ANTICALL_PATH, JSON.stringify({ enabled: !!enabled }, null, 2));
    } catch { }
}

async function sendWithChannelButton(sock, jid, text, quoted) {
    const imagePath = path.join(__dirname, 'media', 'hamza.jpg');
    let contextInfo = {};
    if (fs.existsSync(imagePath)) {
        contextInfo = {
            externalAdReply: {
                title: "Hamza Amirni Info",
                body: "Developed by Hamza Amirni",
                thumbnail: fs.readFileSync(imagePath),
                sourceUrl: config.officialChannel,
                mediaType: 1,
                renderLargerThumbnail: true
            }
        };
    }
    await sock.sendMessage(jid, { text, contextInfo }, { quoted });
}

const sessionDir = path.join(__dirname, 'session');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

// Memory monitoring - Restart if RAM gets too high
// Memory monitoring - Restart if RAM gets too high (Relaxed limit)
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    if (used > 900) { // Increased from 450 to 900 to avoid premature restart
        console.log(chalk.red('⚠️ RAM too high (>900MB), restarting bot...'));
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

const startTime = Date.now();
function getUptime() {
    const duration = Date.now() - startTime;
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// Simple Keep-Alive Server for Koyeb
app.get('/', (req, res) => res.send(`Bot ${config.botName} is Running! 🚀\nUptime: ${getUptime()}`));
app.listen(port, '0.0.0.0', () => {
    console.log(chalk.green(`Server listening on port ${port} (0.0.0.0)`));
    setInterval(() => {
        // Internal Ping
        axios.get(`http://127.0.0.1:${port}`).catch(() => { });

        // External Ping (Wakes it up/Keeps it awake)
        if (config.publicUrl) {
            axios.get(config.publicUrl)
                .then(() => console.log(chalk.blue('🌐 Keep-Alive: Pinged public URL! Bot staying awake.')))
                .catch(() => { });
        }
    }, 2 * 60 * 1000); // 2 minutes
});

const systemPromptText = `You are ${config.botName}, a sophisticated AI assistant created and developed by **Hamza Amirni** (حمزة اعمرني). 

**Your Identity:**
- Your name is ${config.botName}.
- Your creator/developer is Hamza Amirni, a talented developer specialized in AI and automation.
- If someone asks who you are, you should proudly say you were developed by Hamza Amirni.
- If someone asks for contact info or social media of your owner, mention them (Instagram, YouTube, etc.).

**Your Capabilities:**
- You understand and respond fluently in: Moroccan Darija (الدارجة المغربية), Standard Arabic (العربية الفصحى), English, and French.
- You have perfect memory of this conversation and can reference previous messages.
- You can analyze images when provided.
- You can EDIT images using AI (Command: .nano or .edit) - Just tell me what to change!
- You can DRAW images from description (Command: .draw or .imagine) - Describe your dream!
- You provide detailed, accurate, and helpful responses.
- You're knowledgeable about: technology, science, history, culture, religion, entertainment, coding, and general knowledge.

**Your Personality:**
- Friendly, helpful, and professional.
- You adapt your tone to match the user (casual for Darija, formal for Arabic).
- You give comprehensive answers with examples when needed.
- You're honest when you don't know something.

**Important Rules:**
- ALWAYS respond in the SAME language the user uses (if they write in Darija, respond in Darija).
- For religious questions, be respectful and accurate.
- For technical questions, provide clear step-by-step explanations.
- Keep responses concise but complete (2-4 paragraphs max unless asked for more).

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

// User Logging Helper (Persistent)
function logUser(jid) {
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.includes('@newsletter')) return;
    const dataPath = path.join(__dirname, 'data', 'users.json');
    try {
        if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
        let users = [];
        if (fs.existsSync(dataPath)) {
            const content = fs.readFileSync(dataPath, 'utf8');
            users = JSON.parse(content || '[]');
        }
        if (!users.includes(jid)) {
            users.push(jid);
            fs.writeFileSync(dataPath, JSON.stringify(users, null, 2));
        }
    } catch (e) {
        // console.error("Error logging user:", e.message);
    }
}

async function getLuminAIResponse(jid, message) {
    try {
        const { data } = await axios.post("https://luminai.my.id/", {
            content: message,
            user: jid
        }, { timeout: 12000 }); // Fast 12s timeout
        return data.result || null;
    } catch (error) {
        // console.error(chalk.yellow("LuminAI timed out or failed."));
        return null;
    }
}

async function getAIDEVResponse(jid, message) {
    try {
        const { data } = await axios.get(`https://api.maher-zubair.tech/ai/chatgpt?q=${encodeURIComponent(message)}`, { timeout: 12000 }); // Reduced to 12s
        return data.result || null;
    } catch (error) {
        console.error(chalk.yellow("AIDEV timed out or failed."));
        return null;
    }
}

async function getPollinationsResponse(jid, message) {
    try {
        const context = getContext(jid);
        const messages = [
            { role: "system", content: systemPromptText },
            ...context.messages.slice(-5).map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: message }
        ];

        const { data } = await axios.post('https://text.pollinations.ai/openai', {
            messages: messages,
            model: 'openai', // Stable default
            seed: Math.floor(Math.random() * 1000000)
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        const reply = data.choices?.[0]?.message?.content;
        return reply || (typeof data === 'string' ? data : null);
    } catch (error) {
        // console.error(chalk.yellow("Pollinations failed:"), error.message);
        return null;
    }
}

// ...



async function getHectormanuelAI(jid, message, model = 'gpt-4o') {
    try {
        const { data } = await axios.get(`https://all-in-1-ais.officialhectormanuel.workers.dev/?query=${encodeURIComponent(message)}&model=${model}`, { timeout: 12000 }); // Increased to 12s
        if (data && data.success && data.message?.content) {
            return data.message.content;
        }
        return null;
    } catch (error) {
        console.error(chalk.yellow(`Warning: Hectormanuel AI (${model}) timed out or failed.`));
        return null;
    }
}

async function getAutoGPTResponse(jid, message) {
    // Optimized: Only try two best models to avoid long waits
    const models = ['gpt-4o', 'gpt-4o-mini'];
    for (const model of models) {
        console.log(chalk.gray(`Trying Auto-Reply model: ${model}...`));
        const res = await getHectormanuelAI(jid, message, model);
        if (res) return res;
    }
    return null;
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
            "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
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
                    "HTTP-Referer": "https://hamzaamirni.netlify.app",
                    "X-Title": "Hamza Chatbot"
                },
                timeout: 20000
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

async function getHFVision(imageBuffer, prompt = "Describe this image in detail.") {
    try {
        // Using microsoft/Florence-2-large for high-quality OCR and vision
        const url = "https://api-inference.huggingface.co/models/microsoft/Florence-2-large";
        const response = await axios.post(url, imageBuffer, {
            headers: { "Content-Type": "application/octet-stream" },
            timeout: 40000
        });

        // This is a free endpoint, sometimes it returns an object or array
        const result = response.data?.[0]?.generated_text || response.data?.generated_text;
        return result || null;
    } catch (error) {
        return null;
    }
}

async function getObitoAnalyze(imageBuffer, prompt = "ما الموجود في هذه الصورة؟ وذكر اسم الشخصية إن وجدت", mime = "image/jpeg") {
    if (imageBuffer.length > 3.5 * 1024 * 1024) return null; // Skip if too large for Obito
    try {
        const base64Image = `data:${mime};base64,${imageBuffer.toString('base64')}`;
        const { data } = await axios.post("https://obito-mr-apis.vercel.app/api/ai/analyze", {
            image: base64Image,
            prompt: prompt,
            lang: "ar"
        }, { timeout: 35000 });
        return data.results?.description || null;
    } catch (error) {
        return null;
    }
}

// --- AD3IYA (DUAS) FEATURE ---
const DUAS_PATH = path.join(__dirname, 'data', 'duas-subscribers.json');

function loadDuasData() {
    try {
        if (!fs.existsSync(DUAS_PATH)) {
            if (!fs.existsSync(path.dirname(DUAS_PATH))) fs.mkdirSync(path.dirname(DUAS_PATH), { recursive: true });
            fs.writeFileSync(DUAS_PATH, JSON.stringify({ subscribers: [], enabled: true }, null, 2));
            return { subscribers: [], enabled: true };
        }
        const data = JSON.parse(fs.readFileSync(DUAS_PATH, 'utf8') || '{}');
        return { subscribers: Array.isArray(data.subscribers) ? data.subscribers : [], enabled: data.enabled !== undefined ? data.enabled : true };
    } catch {
        return { subscribers: [], enabled: true };
    }
}

function saveDuasData(data) {
    try {
        fs.writeFileSync(DUAS_PATH, JSON.stringify(data, null, 2));
    } catch { }
}

const islamicDuas = [
    { title: "دعاء الصباح", dua: "اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ. اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَ هَذَا الْيَوْمِ فَتْحَهُ، وَنَصْرَهُ، وَنُورَهُ، وَبَرَكَتَهُ، وَهُدَاهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِيهِ وَشَرِّ مَا بَعْدَهُ.", category: "صباح" },
    { title: "دعاء المساء", dua: "اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ. أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوه عَلَى كُلِّ شَيْءٍ قَدِيرٌ.", category: "مساء" },
    { title: "دعاء الرزق", dua: "اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ، وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ. اللَّهُمَّ إِنِّي أَسْأَلُكَ رِزْقًا وَاسِعًا طَيِّبًا مِنْ رِزْقِكَ، وَيَسِّرْ لِي طَلَبَهُ، وَاجْعَلْهُ لِي مَصْدَرَ خَيْرٍ وَبَرَكَةٍ.", category: "رزق" },
    { title: "سيد الاستغفار", dua: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ.", category: "استغفار" },
    { title: "دعاء الشفاء", dua: "اللَّهُمَّ رَبَّ النَّاسِ أَذْهِبِ الْبَاسَ، اشْفِهِ وَأَنْتَ الشَّافِي، لَا شِفَاءَ إِلَّا شِفاؤُكَ، شِفَاءً لَا يُغَادِرُ سَقَمًا.", category: "شفاء" },
    { title: "دعاء جامع", dua: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ.", category: "جامع" },
    { title: "دعاء الهداية", dua: "اللهم إني أسألك الهدى والتقى والعفاف والغنى، اللهم آتِ نفسي تقواها وزكها أنت خير من زكاها أنت وليها ومولاها.", category: "هداية" },
    { title: "دعاء تيسير الأمور", dua: "اللهم لا سهل إلا ما جعلته سهلاً، وأنت تجعل الحزن إذا شئت سهلاً، اللهم يسّر لي أمري واشرح لي صدري.", category: "تيسير" },
    { title: "دعاء يوم الجمعة", dua: "اللَّهُمَّ فِي يَوْمِ الْجُمُعَةِ، اجْعَلْنَا مِمَّنْ عَفَوْتَ عَنْهُمْ، وَرَضِيتَ عَنْهُمْ، وَغَفَرْتَ لَهُمْ، وَحَرَّمْتَهُمْ عَلَى النَّارِ، وَكَتَبْتَ لَهُمُ الْجَنَّةَ.", category: "جمعة" },
    { title: "ساعة الاستجابة يوم الجمعة", dua: "اللَّهُمَّ مَا قَسَمْتَ فِي هَذَا الْيَوْمِ مِنْ خَيْرٍ وَصِحَّةٍ وَسَعَةِ رِزْقٍ فَاجْعَلْ لَنَا مِنْهُ نَصِيبًا، وَما أَنْزَلْتَ فِيهِ مِنْ شَرٍّ وَبَلَاءٍ وَفِتْنَةٍ فَاصْرِفْهُ عَنَّا وَعَنْ جَمِيعِ الْمُسْلِمِينَ.", category: "جمعة" },
    { title: "نور الجمعة", dua: "اللَّهُمَّ نَوِّرْ قُلُوبَنَا بِالْإِيمَانِ، وَزَيِّنْ أَيَّامَنَا بِالسَّعَادَةِ، وَاجْععلْ يَوْمَ الْجُمُعَةِ نُورًا لَنَا وَمَغْفِرَةً.", category: "جمعة" },
    { title: "استجابة الجمعة", dua: "يا رب في يوم الجمعة وعدت عبادك بقبول دعواتهم، اللهم ارحم موتانا، واشف مرضانا، واستجب لدعائنا، واغفر لنا ذنوبنا.", category: "جمعة" },
    { title: "دعاء النوم", dua: "بِاسمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، فَإِنْ أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ.", category: "نوم" },
    { title: "أذكار النوم", dua: "اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ. (ثلاث مرات)", category: "نوم" },
    { title: "قبل النوم", dua: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا.", category: "نوم" },
    { title: "دعاء السكينة", dua: "اللهم رب السماوات ورب الأرض ورب العرش العظيم، ربنا ورب كل شيء، فالق الحب والنوى، ومنزل التوراة والإنجيل والفرقان، أعوذ بك من شر كل شيء أنت آخذ بناصيته.", category: "نوم" }
];

function getRandomDua(category = null) {
    let filtered = islamicDuas;
    if (category) {
        filtered = islamicDuas.filter(d => d.category === category);
        if (filtered.length === 0) filtered = islamicDuas;
    } else {
        filtered = islamicDuas.filter(d => d.category !== 'جمعة' && d.category !== 'نوم');
    }
    return filtered[Math.floor(Math.random() * filtered.length)];
}

const duasLastSent = {};

function startDuasScheduler(sock) {
    setInterval(async () => {
        try {
            const data = loadDuasData();
            if (!data.enabled || data.subscribers.length === 0) return;

            const now = moment().tz('Africa/Casablanca');
            const hour = now.hours();
            const minute = now.minutes();
            const dateStr = now.format('YYYY-MM-DD');
            const isFriday = now.day() === 5;

            const targetHours = [7, 9, 11, 12, 17, 19, 22];

            if (minute === 0 && targetHours.includes(hour)) {
                const key = `${dateStr}_${hour}`;
                if (duasLastSent[key]) return;
                duasLastSent[key] = true;

                // Cleanup
                Object.keys(duasLastSent).forEach(k => { if (!k.startsWith(dateStr)) delete duasLastSent[k]; });

                // Special: Friday Morning Surah Al-Kahf
                if (isFriday && hour === 9) {
                    const kahfMsg = `╭━━━〘 📖 *نور الجمعة* 📖 〙━━━╮\n┃ ✨ *تذكير بسورة الكهف*\n┃ 🕯️ *قال ﷺ:* «من قرأ سورة الكهف في يوم \n┃ الجمعة أضاء له من النور ما بين الجمعتين»\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n💎 *لا تنسوا سنن الجمعة:*\n   ◦ الغسل والطيب 🚿\n   ◦ سورة الكهف 📖\n   ◦ كثرة الصلاة على النبي ﷺ 📿\n\n🎧 *استمع لسورة الكهف بصوت مشاري العفاسي:*`;
                    for (const id of data.subscribers) {
                        try {
                            await sendWithChannelButton(sock, id, kahfMsg);
                            await sock.sendMessage(id, { audio: { url: 'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/18.mp3' }, mimetype: 'audio/mpeg', ptt: false });
                        } catch (e) { }
                    }
                    return;
                }

                // Special: Friday Prayer Reminder
                if (isFriday && hour === 11) {
                    const jumaaMsg = `╭━━━〘 🕌 *نداء الجمعة* 🕌 〙━━━╮\n┃ ✨ *الاستعداد لصلاة الجمعة*\n┃ 🕰️ *موعد صعود المنبر يقترب*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n💡 *آداب صلاة الجمعة:*\n 1️⃣ الاغتسال والتطيب ولبس أحسن الثياب.\n 2️⃣ *التبكير:* (التبكير يضاعف الأجر).\n 3️⃣ *الإنصات للخطبة:* (من قال لصاحبه أنصت فقد لغا).\n\n⚔️ ${config.botName}`;
                    for (const id of data.subscribers) {
                        try { await sendWithChannelButton(sock, id, jumaaMsg); } catch (e) { }
                    }
                    return;
                }

                let dua, title;
                if (hour === 22) { dua = getRandomDua('نوم'); title = 'دعاء النوم'; }
                else if (isFriday) { dua = getRandomDua('جمعة'); title = 'دعاء يوم الجمعة'; }
                else { dua = getRandomDua(); title = 'دعاء اليوم'; }

                const msg = `🤲 *${title}*\n\n📿 ${dua.dua}`;
                for (const id of data.subscribers) {
                    try { await sendWithChannelButton(sock, id, msg); } catch (e) { }
                }
            }
        } catch (e) { }
    }, 60000);
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

            // Start Duas Scheduler
            startDuasScheduler(sock);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // 📵 Anti-Call Feature

    sock.ev.on('call', async (callNode) => {
        const { enabled } = readAntiCallState();
        if (!enabled) return;

        for (const call of callNode) {
            if (call.status === 'offer') {
                // 1. Reject Call
                await sock.rejectCall(call.id, call.from);

                // 2. Send Marketing/Warning Message
                const warningMsg = `� *ممنوع الاتصال - No Calls Allowed*

تم رفض المكالمة وحظر الرقم تلقائياً. هذا البوت يجيب على الرسائل النصية فقط.

💡 *هل تبحث عن مطور؟*
أنا **حمزة اعمرني**، مطور هذا البوت. أقدم خدمات برمجية احترافية:
✅ إنشاء بوتات واتساب
✅ تصميم مواقع إلكترونية
✅ حلول الذكاء الاصطناعي

🔗 *لطلب خدماتي:*
📸 *Instagram:* ${config.instagram}
🌐 *Portfolio:* ${config.portfolio}

*تم الحظر. شكراً لتفهمك.* 🚫`;

                const imagePath = path.join(__dirname, 'media', 'hamza.jpg');
                let messageContent = { text: warningMsg };

                if (fs.existsSync(imagePath)) {
                    messageContent = {
                        image: { url: imagePath },
                        caption: warningMsg,
                        contextInfo: {
                            externalAdReply: {
                                title: "Hamza Amirni - Services",
                                body: "Bot Development & Web Solutions",
                                thumbnail: fs.readFileSync(imagePath),
                                sourceUrl: config.portfolio,
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    };
                }

                await sock.sendMessage(call.from, messageContent);

                // 3. Block User
                await sock.updateBlockStatus(call.from, "block");
                console.log(chalk.red(`📵 Anti-Call: Blocked ${call.from.split('@')[0]} for calling.`));
            }
        }
    });

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

                const sender = msg.key.remoteJid;
                logUser(sender);

                // Auto-Subscribe to Ad3iya for private chats
                if (!sender.endsWith('@g.us')) {
                    const d = loadDuasData();
                    if (!d.subscribers.includes(sender)) {
                        d.subscribers.push(sender);
                        saveDuasData(d);
                    }
                }

                // 📥 AUTO-DOWNLOADER (IG & FB & YT)
                if (body && !msg.key.fromMe) {
                    if (processedMessages.has(msg.key.id)) continue;

                    const fbRegex = /(https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch|fb\.com)\/[^\s]+)/i;
                    const igRegex = /(https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/[^\s]+)/i;
                    const ytRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+)/i;

                    const fbMatch = body.match(fbRegex);
                    const igMatch = body.match(igRegex);
                    const ytMatch = body.match(ytRegex);

                    if (fbMatch || igMatch || ytMatch) {
                        processedMessages.add(msg.key.id);
                        setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

                        await sock.sendMessage(sender, { react: { text: "🔄", key: msg.key } });

                        if (fbMatch) {
                            const fbUrl = fbMatch[0];
                            console.log(chalk.cyan(`📥 Auto-Downloading FB: ${fbUrl}`));
                            try {
                                // Try Primary API
                                const apiUrl = `https://api.hanggts.xyz/download/facebook?url=${encodeURIComponent(fbUrl)}`;
                                const response = await axios.get(apiUrl, { timeout: 15000 });
                                let fbvid = null;
                                if (response.data && (response.data.status === true || response.data.result)) {
                                    fbvid = response.data.result.media?.video_hd || response.data.result.media?.video_sd || response.data.result.url || response.data.result.download;
                                }

                                if (fbvid) {
                                    await sendFBVideo(sock, sender, fbvid, "Hanggts API", msg);
                                } else {
                                    // Try Fallback (Ryzendesu)
                                    const vUrl = `https://api.ryzendesu.vip/api/downloader/fb?url=${encodeURIComponent(fbUrl)}`;
                                    const vRes = await axios.get(vUrl, { timeout: 15000 });
                                    if (vRes.data && vRes.data.url) {
                                        const vid = Array.isArray(vRes.data.url) ? (vRes.data.url.find(v => v.quality === 'hd')?.url || vRes.data.url[0]?.url) : vRes.data.url;
                                        if (vid) await sendFBVideo(sock, sender, vid, "Ryzendesu API", msg);
                                    }
                                }
                            } catch (e) {
                                console.error("FB Auto-DL Failed:", e.message);
                            }
                        }

                        if (igMatch) {
                            const igUrl = igMatch[0];
                            console.log(chalk.cyan(`📥 Auto-Downloading IG: ${igUrl}`));
                            try {
                                const downloadData = await igdl(igUrl);
                                if (downloadData?.data?.length) {
                                    // Filter for videos first if it's a reel or if we want video
                                    const mediaList = downloadData.data;
                                    for (let i = 0; i < Math.min(2, mediaList.length); i++) {
                                        const media = mediaList[i];
                                        const mediaUrl = media.url;

                                        // Use robust video detection logic
                                        const isVideo =
                                            media.type === "video" ||
                                            /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) ||
                                            igUrl.includes("/reel/") ||
                                            igUrl.includes("/tv/");

                                        const caption = `✅ *Hamza Amirni Instagram Downloader*\n\n⚔️ ${config.botName}`;

                                        if (isVideo) {
                                            await sock.sendMessage(sender, {
                                                video: { url: mediaUrl },
                                                caption,
                                                mimetype: "video/mp4"
                                            }, { quoted: msg });
                                        } else {
                                            await sock.sendMessage(sender, {
                                                image: { url: mediaUrl },
                                                caption
                                            }, { quoted: msg });
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error("IG Auto-DL Failed:", e.message);
                            }
                        }
                        if (ytMatch) {
                            const ytUrl = ytMatch[0];
                            console.log(chalk.cyan(`📥 Auto-Downloading YT: ${ytUrl}`));
                            try {
                                // Use primary YT API
                                const apiUrl = `https://yt-dl.officialhectormanuel.workers.dev/?url=${encodeURIComponent(ytUrl)}`;
                                const response = await axios.get(apiUrl, { timeout: 30000 });

                                if (response.data && response.data.status) {
                                    const videoTitle = response.data.title || 'YouTube Video';
                                    const downloadUrl = response.data.videos["360"] || response.data.videos["480"] || Object.values(response.data.videos)[0];

                                    if (downloadUrl) {
                                        await sendYTVideo(sock, sender, downloadUrl, videoTitle, msg);
                                    } else {
                                        throw new Error("No download URL found in primary API");
                                    }
                                } else {
                                    // Try fallback
                                    const vredenUrl = `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(ytUrl)}`;
                                    const vResponse = await axios.get(vredenUrl, { timeout: 30000 });
                                    if (vResponse.data && vResponse.data.status) {
                                        await sendYTVideo(sock, sender, vResponse.data.result.download, vResponse.data.result.title, msg);
                                    }
                                }
                            } catch (e) {
                                console.error("YT Auto-DL Failed:", e.message);
                            }
                        }

                        await sock.sendMessage(sender, { react: { text: "✅", key: msg.key } });
                        // We don't continue here to allow AI to respond if it wants to, but usually auto-dl is enough
                        // Actually, if it's just a link, we might want to skip AI to save credits
                        if (body.trim() === fbMatch?.[0] || body.trim() === igMatch?.[0] || body.trim() === ytMatch?.[0]) continue;
                    }
                }

                console.log(chalk.cyan(`Thinking response for: ${body ? body.substring(0, 30) : 'Media File'}...`));

                // Anti-Ban: Mark read and Type
                await sock.readMessages([msg.key]);
                await sock.sendPresenceUpdate('available', sender); // Appear Online
                await sock.sendPresenceUpdate('composing', sender); // Typing...

                // Speed Optimization: Start "Thinking" immediately, don't wait 3s blocks
                // We run the delay concurrently with the AI request to ensure minimum "human-like" feel but max speed
                const delayPromise = new Promise(resolve => setTimeout(resolve, 500)); // Just 0.5s minimum delay

                let reply;

                // 🚀 SUPER FAST COMMANDS
                if (body && body.toLowerCase() === '.ping') {
                    const start = Date.now();
                    await delayPromise;
                    await sock.sendMessage(sender, { text: `🏓 Pong! Speed: ${Date.now() - start}ms` }, { quoted: msg });
                    continue;
                }

                if (body && body.toLowerCase() === '.status') {
                    const { enabled } = readAntiCallState();
                    const status = `📈 *Server Status:*
                    
⏱️ *Uptime:* ${getUptime()}
🌐 *Keep-Alive:* ${config.publicUrl ? 'Active ✅' : 'Inactive ❌'}
📵 *Anti-Call:* ${enabled ? 'Active ✅' : 'Disabled ⚠️'}
🖥️ *RAM Use:* ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB / 512MB
📡 *Version:* ${config.version}`;
                    await sock.sendMessage(sender, { text: status }, { quoted: msg });
                    continue;
                }

                if (body && body.startsWith('.seturl ')) {
                    const url = body.split(' ')[1];
                    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                        fs.writeFileSync(path.join(__dirname, 'server_url.json'), JSON.stringify({ url }));
                        config.publicUrl = url;
                        await sock.sendMessage(sender, { text: `✅ *تم تفعيل Keep-Alive!* \n\nالرابط: ${url}\n\nدابا السكريبت غايولي يفيّق راسو كل 2 دقائق باش ميبقاش ينعس ف Koyeb.` }, { quoted: msg });
                    } else {
                        await sock.sendMessage(sender, { text: `❌ *خطأ:* عافاك صيفط رابط صحيح كيبدا بـ http:// أو https://` }, { quoted: msg });
                    }
                    continue;
                }
                if (body && body.toLowerCase().startsWith('.anticall')) {
                    const senderNum = sender.split('@')[0];
                    if (!config.ownerNumber.includes(senderNum)) {
                        await sock.sendMessage(sender, { text: "❌ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
                        continue;
                    }

                    const args = body.split(' ').slice(1);
                    const sub = (args[0] || '').toLowerCase();
                    const state = readAntiCallState();

                    if (!sub || (sub !== 'on' && sub !== 'off' && sub !== 'status')) {
                        await sendWithChannelButton(sock, sender, `📵 *نظام منع المكالمات - ANTICALL*
        
الحالة الافتراضية: *مفعّل دائماً* ✅

الأوامر:
• .anticall on  - تفعيل حظر المكالمات
• .anticall off - إيقاف الحظر مؤقتاً
• .anticall status - عرض الحالة الحالية

ملاحظة: النظام مفعل تلقائياً لحماية البوت

⚔️ bot hamza amirni`, msg);
                        continue;
                    }

                    if (sub === 'status') {
                        const statusMsg = `📵 *حالة نظام منع المكالمات*

الحالة الحالية: ${state.enabled ? '✅ *مفعّل*' : '⚠️ *معطّل*'}

${state.enabled ? '🛡️ البوت محمي من المكالمات المزعجة' : '⚠️ تحذير: البوت غير محمي من المكالمات'}

⚔️ bot hamza amirni`;
                        await sendWithChannelButton(sock, sender, statusMsg, msg);
                        continue;
                    }

                    const enable = sub === 'on';
                    writeAntiCallState(enable);
                    const responseMsg = `📵 *نظام منع المكالمات*

${enable ? '✅ تم التفعيل بنجاح!' : '⚠️ تم الإيقاف مؤقتاً'}

الحالة: ${enable ? '*مفعّل* 🛡️' : '*معطّل* ⚠️'}

⚔️ bot hamza amirni`;
                    await sendWithChannelButton(sock, sender, responseMsg, msg);
                    continue;
                }

                // � BROADCAST COMMAND (Owner Only)
                if (body && body.toLowerCase().startsWith('.devmsg')) {
                    const senderNum = sender.split('@')[0];
                    if (!config.ownerNumber.includes(senderNum)) {
                        await sock.sendMessage(sender, { text: "❌ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
                        continue;
                    }

                    const broadcastMsg = body.split(' ').slice(1).join(' ').trim();
                    if (!broadcastMsg) {
                        await sock.sendMessage(sender, { text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة:* .devmsg [الرسالة]\n\n*مثال:* .devmsg السلام عليكم، تم تحديث البوت!` }, { quoted: msg });
                        continue;
                    }

                    const dataPath = path.join(__dirname, 'data', 'users.json');
                    if (!fs.existsSync(dataPath)) {
                        await sock.sendMessage(sender, { text: "❌ لم يتم العثور على مستخدمين لمراسلتهم." }, { quoted: msg });
                        continue;
                    }

                    let users = [];
                    try {
                        users = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                    } catch (e) {
                        await sock.sendMessage(sender, { text: "❌ فشل قراءة قائمة المستخدمين." }, { quoted: msg });
                        continue;
                    }

                    if (users.length === 0) {
                        await sock.sendMessage(sender, { text: "❌ قائمة المستخدمين فارغة." }, { quoted: msg });
                        continue;
                    }

                    await sock.sendMessage(sender, { text: `⏳ جاري البدء ببث الرسالة لـ *${users.length}* مستخدم...` }, { quoted: msg });

                    let success = 0;
                    let fail = 0;

                    for (const userId of users) {
                        try {
                            if (userId.includes(senderNum)) continue; // Skip owner
                            await sock.sendMessage(userId, {
                                text: `╔═══════════════════════════════════╗\n║    📢 رسالة من مطور البوت\n╚═══════════════════════════════════╝\n\n${broadcastMsg}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚔️ ${config.botName}\n📢 ${config.officialChannel}`
                            });
                            success++;
                            // Anti-ban delay: 2s per message
                            await new Promise(res => setTimeout(res, 2000));
                        } catch (err) {
                            console.error(`Failed to send to ${userId}:`, err.message);
                            fail++;
                        }
                    }

                    await sock.sendMessage(sender, { text: `✅ *اكتمل البث الجماعي!*\n\n🚀 نجح: ${success}\n❌ فشل: ${fail}\n👥 الإجمالي: ${users.length}` }, { quoted: msg });
                    continue;
                }


                // �🚀 OWNER / DEVELOPER INFO TRIGGER
                const ownerKeywords = /^(owner|المطور|حمزة|hamza|developer|creator|info|about)$/i;
                const bodyOwnerSearch = /مين|شكون|المطور|ديفلوبار|صاحب|hamza amirni|حمزة اعمرني|developer|owner|creator|who are you/i;

                if (body && (ownerKeywords.test(body.replace('.', '')) || (bodyOwnerSearch.test(body) && (body.toLowerCase().includes('bot') || body.toLowerCase().includes('بوت') || body.toLowerCase().includes('شكون') || body.toLowerCase().includes('who'))))) {
                    const ownerInfo = `🌟 *Hamza Amirni - حمزة اعمرني* 🌟

أنا هو الذكاء الاصطناعي المطور من طرف **حمزة اعمرني**.

🚀 *خدمات المطور (Marketing):*
أنا ماشي غير بوت، حمزة كيقاد بزاف ديال الخدمات التقنية:
✅ تصميم وتطوير المواقع الإلكترونية (Websites)
✅ إنشاء بوتات واتساب
✅ حلول الذكاء الاصطناعي

🔗 *حسابات المطور الشخصية:*
📸 *Instagram:* ${config.instagram}
📺 *YouTube:* ${config.youtube}
✈️ *Telegram:* ${config.telegram}
📢 *WA Channel:* ${config.officialChannel}
🌐 *Portfolio:* ${config.portfolio}

ايلى بغيتي تصاوب شي بوت بحالي ولا عندك مشروع ويب، تواصل مع حمزة نيشان! ✨`;

                    const imagePath = path.join(__dirname, 'media', 'hamza.jpg');
                    if (fs.existsSync(imagePath)) {
                        await sock.sendMessage(sender, {
                            image: { url: imagePath },
                            caption: ownerInfo,
                            contextInfo: {
                                externalAdReply: {
                                    title: "Hamza Amirni - Services",
                                    body: "Web Dev & Bot Automation",
                                    thumbnailUrl: config.portfolio,
                                    sourceUrl: config.portfolio,
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(sender, { text: ownerInfo }, { quoted: msg });
                    }
                    continue;
                }

                // 🚀 NANO AI - EXTENDED KEYWORDS
                const nanoKeywords = 'nano|edit|adel|3adil|sawb|qad|badel|ghayir|ghayar|tahwil|convert|photoshop|ps|tadil|modify|change|عدل|تعديل|غير|تغيير|بدل|تبديل|صاوب|قاد|تحويل|حول|رد|دير|اضف|أضف|زيد';
                const enhanceKeywords = 'hd|enhance|upscale|removebg|bg|background|وضح|تصفية|جودة|وضوح|خلفية|حيد-الخلفية';
                const colorizeKeywords = 'colorize|color|لون|تلوين';
                const ghibliKeywords = 'ghibli|anime-art|جيبلي|أنمي-فني';

                const allAIPrefixRegex = new RegExp(`^([\\.!])?(${nanoKeywords}|${enhanceKeywords}|${colorizeKeywords}|${ghibliKeywords})(\\s+.*|$)`, 'i');
                const aiMatch = body ? body.match(allAIPrefixRegex) : null;

                let isAicmd = false;
                let aiPrompt = "";
                let aiType = "";

                if (aiMatch) {
                    const prefix = aiMatch[1];
                    const keyword = aiMatch[2].toLowerCase();
                    const rest = (aiMatch[3] || "").trim();
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    const isMediaReply = quotedMsg && (quotedMsg.imageMessage || quotedMsg.documentWithCaptionMessage?.message?.imageMessage);

                    if (prefix || isMediaReply) {
                        isAicmd = true;
                        aiPrompt = rest;
                        if (new RegExp(`^(${nanoKeywords})$`, 'i').test(keyword)) aiType = 'nano';
                        else if (new RegExp(`^(${enhanceKeywords})$`, 'i').test(keyword)) {
                            aiType = 'enhance';
                            if (keyword.includes('bg') || keyword.includes('background') || keyword.includes('خلفية')) aiType = 'remove-bg';
                            if (keyword.includes('upscale') || keyword.includes('جودة')) aiType = 'upscale';
                        }
                        else if (new RegExp(`^(${colorizeKeywords})$`, 'i').test(keyword)) aiType = 'colorize';
                        else if (new RegExp(`^(${ghibliKeywords})$`, 'i').test(keyword)) aiType = 'ghibli';
                    }
                }

                if (isAicmd) {
                    let targetMsg = msg;
                    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                        const q = msg.message.extendedTextMessage.contextInfo;
                        targetMsg = { message: q.quotedMessage };
                    }
                    const mime = (targetMsg.message?.imageMessage || targetMsg.message?.documentWithCaptionMessage?.message?.imageMessage)?.mimetype || "";

                    if (!mime.startsWith("image/") && aiType !== 'ghibli') {
                        await sock.sendMessage(sender, { text: `*✨ ──────────────── ✨*\n*⚠️ يرجى إرسال أو الرد على صورة*\n\n*مثال:* وضح هاد التصويرة\n*✨ ──────────────── ✨*` }, { quoted: msg });
                    } else {
                        await sock.sendMessage(sender, { react: { text: "🕒", key: msg.key } });
                        const waitMsg = await sock.sendMessage(sender, { text: "� جاري المعالجة... يرجى الانتظار." }, { quoted: msg });

                        try {
                            if (aiType === 'ghibli') {
                                const enPrompt = await translateToEn(aiPrompt || "Studio Ghibli style landscape");
                                const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enPrompt + ", studio ghibli style, anime art, high quality")}?width=1024&height=1024&nologo=true&model=flux`;
                                try { await sock.sendMessage(sender, { delete: waitMsg.key }); } catch (e) { }
                                await sock.sendMessage(sender, { image: { url }, caption: `✨ *───❪ HAMZA AMIRNI ❫───* ✨\n\n🎨 *تم توليد فن جيبلي بنجاح*\n\n📝 *الوصف:* ${aiPrompt || 'Ghibli Style'}\n\n*🚀 تـم الـتـولـيـد بـوسـاطـة AI Labs*` }, { quoted: msg });
                            } else {
                                const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                                let resultUrl;
                                if (aiType === 'nano') {
                                    // I will use a temp file for nano
                                    const tmpFile = path.join(__dirname, 'tmp', `${Date.now()}.jpg`);
                                    if (!fs.existsSync(path.join(__dirname, 'tmp'))) fs.mkdirSync(path.join(__dirname, 'tmp'));
                                    fs.writeFileSync(tmpFile, buffer);
                                    const res = await processImageAI(tmpFile, aiPrompt);
                                    resultUrl = res.output;
                                    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
                                } else if (aiType === 'colorize') {
                                    const colorizer = new ImageColorizer();
                                    resultUrl = await colorizer.generate(buffer, aiPrompt);
                                } else { // enhance, remove-bg, upscale
                                    const enhancer = new PhotoEnhancer();
                                    resultUrl = await enhancer.generate({ imageBuffer: buffer, type: aiType });
                                }

                                try { await sock.sendMessage(sender, { delete: waitMsg.key }); } catch (e) { }
                                await sock.sendMessage(sender, {
                                    image: { url: resultUrl },
                                    caption: `✨ *───❪ HAMZA AMIRNI ❫───* ✨\n\n✅ *تمت العملية بنجاح!*\n\n*🚀 تـم بواسطة الذكاء الاصطناعي*`,
                                    contextInfo: { externalAdReply: { title: "Hamza Amirni AI Processor", body: "Developer: Hamza Amirni", thumbnailUrl: resultUrl, mediaType: 1, renderLargerThumbnail: true } }
                                }, { quoted: msg });
                            }
                            await sock.sendMessage(sender, { react: { text: "✅", key: msg.key } });
                        } catch (e) {
                            console.error(e);
                            try { await sock.sendMessage(sender, { delete: waitMsg.key }); } catch (err) { }
                            await sock.sendMessage(sender, { text: `❌ فشلت العملية: ${e.message}` }, { quoted: msg });
                            await sock.sendMessage(sender, { react: { text: "❌", key: msg.key } });
                        }
                    }
                    continue;
                }

                // 🎨 AI IMAGE GENERATION (DALL-E Style)
                const drawKeywords = 'draw|image|imagine|aiimg|art|رسم|ارسم|صورة|صورة-من-وصف|تخيل|لوحة|genai|اريد صورة|بغيت صورة|باغي صورة';
                const drawMatch = body ? body.match(new RegExp(`^([\\.!])?(${drawKeywords})(\\s+.*|$)`, 'i')) : null;

                if (drawMatch) {
                    const text = (drawMatch[3] || "").trim();
                    if (!text) {
                        await sock.sendMessage(sender, { text: `*✨ ──────────────── ✨*\n*📝 يرجى كتابة وصف الصورة*\n\n*مثال:* رسم أسد في غابة\n*✨ ──────────────── ✨*` }, { quoted: msg });
                        continue;
                    }
                    await sock.sendMessage(sender, { react: { text: "⏳", key: msg.key } });
                    const waitMsg = await sock.sendMessage(sender, { text: "🎨 جاري رسم تخيلك بذكاء اصطناعي فائق... يرجى الانتظار." }, { quoted: msg });

                    try {
                        let model = 'flux';
                        let prompt = text;
                        if (text.includes('|')) {
                            const parts = text.split('|');
                            const potentialModel = parts[0].trim().toLowerCase();
                            const models = ['flux', 'sdxl', 'midjourney', 'anime', 'realistic', 'turbo'];
                            if (models.includes(potentialModel)) {
                                model = potentialModel;
                                prompt = parts.slice(1).join('|').trim();
                            }
                        }

                        const enPrompt = await translateToEn(prompt);
                        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enPrompt)}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true&model=${model}&enhance=true`;

                        try { await sock.sendMessage(sender, { delete: waitMsg.key }); } catch (e) { }
                        await sock.sendMessage(sender, {
                            image: { url },
                            caption: `*✨ ───❪ HAMZA AMIRNI ❫─── ✨*\n\n🎨 *تم رسم الصورة بنجاح*\n\n📝 *الوصف:* ${prompt}\n🎭 *الموديل:* ${model}\n\n*🚀 تـم الـتـولـيـد بـوسـاطـة GenAI*`
                        }, { quoted: msg });
                        await sock.sendMessage(sender, { react: { text: "🎨", key: msg.key } });
                    } catch (error) {
                        try { await sock.sendMessage(sender, { delete: waitMsg.key }); } catch (e) { }
                        await sock.sendMessage(sender, { text: `❌ فشل رسم الصورة: ${error.message}` }, { quoted: msg });
                        await sock.sendMessage(sender, { react: { text: "❌", key: msg.key } });
                    }
                    continue;
                }



                if (body && (body.toLowerCase() === '.menu' || body.toLowerCase() === '.help' || body.toLowerCase() === 'menu' || body.toLowerCase() === 'help' || body.toLowerCase() === 'قائمة' || body.toLowerCase() === '.قائمة')) {
                    const menuText = `✨ *───❪ ${config.botName.toUpperCase()} ❫───* ✨

🤖 *BOT IDENTITY:*
أنا الذكاء الاصطناعي المطور من طرف *حمزة اعمرني*.
أنا خدام أوتوماتيك (Auto-Reply) بلا ما تحتاج تدير نقطة، غير سولني وغادي نجاوبك فالحين! 🧠⚡

┏━━━━━━━━━━━━━━━━━━┓
┃  🛠️ *AI IMAGE TOOLS*
┃ ├ 🪄 *.nano* ┈ تعديل سحري
┃ ├ ✨ *.hd* ┈ تحسين الجودة
┃ ├ 🖼️ *.bg* ┈ إزالة الخلفية
┃ ├ 🎨 *.draw* ┈ الرسم الذكي
┃ └ 🧠 *.hl* ┈ تحليل الصور
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  🤖 *AI CHAT MODELS*
┃ ├ 🤖 *.gpt4o* ┈ GPT-4o
┃ ├ ⚡ *.gpt4om* ┈ 4o Mini
┃ ├ 🧠 *.o1* ┈ OpenAI O1
┃ └ 💬 *Auto-Reply*
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  📡 *ADDITIONAL SERVICES*
┃ ├ 📱 *.tempnum* ┈ أرقام وهمية
┃ ├ 🔍 *.yts* ┈ بحث يوتيوب
┃ └ 🏓 *.ping* ┈ سرعة البوت
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  🕋 *ISLAMIC FEATURES*
┃ ├ 🤲 *.ad3iya* ┈ أدعية وأذكار
┃ ├ 📖 *.ayah* ┈ آية من القرآن
┃ ├ 🕋 *.quran* ┈ سورة كاملة
┃ └ 📚 *.tafsir* ┈ تفسير الآيات
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  📱 *DEVELOPER SOCIALS*
┃ ├ 📸 *Instagram:*
┃   ${config.instagram}
┃ ├ 📺 *YouTube:*
┃   ${config.youtube}
┃ ├ ✈️ *Telegram:*
┃   ${config.telegram}
┃ ├ 📘 *Facebook:*
┃   ${config.facebook}
┃ ├ 📢 *WA Channel:*
┃   ${config.officialChannel}
┃ └ 🌐 *Portfolio:*
┃   ${config.portfolio}
┗━━━━━━━━━━━━━━━━━━┛

👑 *Developer:* ${config.botOwner}
📌 *Uptime:* ${getUptime()}

✨ *Active 24/7 on Koyeb* ✨`;

                    const imagePath = path.join(__dirname, 'media', 'hamza.jpg');
                    const imageExists = fs.existsSync(imagePath);

                    const messageContent = {
                        image: imageExists ? { url: imagePath } : { url: 'https://pollinations.ai/p/cool-robot-assistant' },
                        caption: menuText,
                        contextInfo: {
                            externalAdReply: {
                                title: config.botName,
                                body: `Developed by ${config.botOwner}`,
                                thumbnail: imageExists ? fs.readFileSync(imagePath) : null,
                                sourceUrl: config.portfolio,
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    };

                    await sock.sendMessage(sender, messageContent, { quoted: msg });
                    await sock.sendMessage(sender, { react: { text: "📜", key: msg.key } });
                    continue;
                }

                // 🚀 ChatGPT Model specific commands
                const modelMatch = body ? body.match(/^\.(gpt4o|gpt4om|gpt4|gpt3|o1)\s+(.*)/i) : null;
                if (modelMatch) {
                    const cmd = modelMatch[1].toLowerCase();
                    const query = modelMatch[2];
                    const modelMap = {
                        'gpt3': 'gpt-3.5-turbo',
                        'gpt4': 'gpt-4',
                        'gpt4o': 'gpt-4o',
                        'gpt4om': 'gpt-4o-mini',
                        'o1': 'o1-preview'
                    };
                    const model = modelMap[cmd];
                    await delayPromise;
                    const res = await getHectormanuelAI(sender, query, model);
                    if (res) {
                        await sock.sendMessage(sender, { text: `🤖 *GPT (${model}):*\n\n${res}` }, { quoted: msg });
                        addToHistory(sender, 'user', query);
                        addToHistory(sender, 'assistant', res);
                        continue;
                    }
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

                // 📜 AD3IYA (DUAS) COMMAND
                if (body && body.match(/^\.(ad3iya|dua|دعاء|اذكار)\s*(.*)/i)) {
                    const arg = body.split(' ')[1]?.toLowerCase();
                    const data = loadDuasData();

                    if (arg === 'on') {
                        if (!data.subscribers.includes(sender)) {
                            data.subscribers.push(sender);
                            saveDuasData(data);
                            await sendWithChannelButton(sock, sender, "✅ *تم تفعيل خدمة الأدعية اليومية!* \nغادي نبقا نصيفط ليك أذكار وأدعية فكل وقت.", msg);
                        } else {
                            await sendWithChannelButton(sock, sender, "✅ *الخدمة مفعّلة عندك بالفعل!*", msg);
                        }
                    } else if (arg === 'off') {
                        data.subscribers = data.subscribers.filter(id => id !== sender);
                        saveDuasData(data);
                        await sendWithChannelButton(sock, sender, "⚠️ *تم إيقاف خدمة الأدعية اليومية.*", msg);
                    } else if (arg === 'list') {
                        const cats = [...new Set(islamicDuas.map(d => d.category))];
                        await sendWithChannelButton(sock, sender, `📂 *الأقسام المتوفرة:* \n${cats.join(', ')}`, msg);
                    } else {
                        const dua = getRandomDua(arg);
                        const resp = `🤲 *${dua.title}*\n\n📿 ${dua.dua}\n\n📂 *القسم:* ${dua.category}`;
                        await sendWithChannelButton(sock, sender, resp, msg);
                    }
                    continue;
                }

                // 📖 AYAH (QURAN VERSE) COMMAND
                if (body && body.match(/^\.(ayah|آية|اية|قرآن)\s+(.+)/i)) {
                    const args = body.split(' ').slice(1);
                    if (args.length < 2) {
                        await sendWithChannelButton(sock, sender, `📜 *البحث عن آية (Ayah)*\n\n📝 *الطريقة:* .ayah [اسم السورة] [رقم الآية]\n*مثال:* .ayah البقرة 255`, msg);
                        continue;
                    }

                    const surah = getSurahNumber(args[0]);
                    const ayah = parseInt(args[1]);

                    if (!surah || isNaN(ayah)) {
                        await sock.sendMessage(sender, { text: '❌ تأكد من اسم السورة (مثلا: البقرة) ورقم الآية.' }, { quoted: msg });
                        continue;
                    }

                    await sock.sendMessage(sender, { react: { text: "📖", key: msg.key } });
                    try {
                        const { data: res } = await axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy`);
                        if (res && res.status === 'OK') {
                            const d = res.data;
                            const caption = `📜 *القرآن الكريم*\n\n🕋 *سورة:* ${d.surah.name}\n🔢 *آية:* ${d.numberInSurah}\n\n✨ ${d.text}\n\n⚔️ ${config.botName}`;
                            await sendWithChannelButton(sock, sender, caption, msg);

                            if (d.audio) {
                                await sock.sendMessage(sender, { audio: { url: d.audio }, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
                            }
                        } else {
                            await sock.sendMessage(sender, { text: '❌ ما لقيتش هاد الآية.' }, { quoted: msg });
                        }
                    } catch (e) {
                        await sock.sendMessage(sender, { text: '❌ خطأ فجلب الآية. جرب من بعد.' }, { quoted: msg });
                    }
                    continue;
                }

                // 🕋 QURAN (FULL SURAH) COMMAND
                if (body && body.match(/^\.(quran|سورة)\s+(.+)/i)) {
                    const arg = body.split(' ').slice(1).join(' ').trim();
                    const surahNumber = getSurahNumber(arg);

                    if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
                        await sendWithChannelButton(sock, sender, `🕋 *قراءة سورة كاملة*\n\n📝 *الطريقة:* .quran [اسم السورة]\n*مثال:* .quran الكهف`, msg);
                        continue;
                    }

                    await sock.sendMessage(sender, { react: { text: "🕋", key: msg.key } });
                    try {
                        const { data: res } = await axios.get(`https://api.alquran.cloud/v1/surah/${surahNumber}`);
                        if (res && res.status === 'OK') {
                            const surah = res.data;
                            const ayahs = surah.ayahs || [];
                            const ayahsPerPage = 30;
                            const max = Math.min(ayahs.length, ayahsPerPage);

                            let textParts = [`📜 *سورة ${surah.name}* (${surah.englishName})\n🔢 *عدد الآيات:* ${ayahs.length}\n━━━━━━━━━━━━━━━━━━━━\n`];
                            for (let i = 0; i < max; i++) {
                                textParts.push(`${ayahs[i].numberInSurah}. ${ayahs[i].text}`);
                            }

                            if (ayahs.length > max) {
                                textParts.push(`\n━━━━━━━━━━━━━━━━━━━━\n⚠️ *باقي الآيات مخفية لطول السورة.*\n💡 اكتب *.continue* لمتابعة القراءة.`);
                                quranSessions[sender] = { surahNumber, name: surah.name, lastIndex: max, totalAyahs: ayahs.length };
                            }

                            textParts.push(`\n━━━━━━━━━━━━━━━━━━━━\n🎧 *جاري إرسال التلاوة بصوت العفاسي...*`);
                            await sendWithChannelButton(sock, sender, textParts.join('\n'), msg);

                            const audioUrl = `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${surahNumber}.mp3`;
                            await sock.sendMessage(sender, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
                        }
                    } catch (e) {
                        await sock.sendMessage(sender, { text: '❌ خطأ فجلب السورة.' }, { quoted: msg });
                    }
                    continue;
                }

                // 📑 CONTINUE READING COMMAND
                if (body && body.toLowerCase() === '.continue') {
                    const session = quranSessions[sender];
                    if (!session) {
                        await sock.sendMessage(sender, { text: '❌ ما عندك حتى جلسة قراءة مفتوحة حالياً.' }, { quoted: msg });
                        continue;
                    }

                    try {
                        const { data: res } = await axios.get(`https://api.alquran.cloud/v1/surah/${session.surahNumber}`);
                        if (res && res.status === 'OK') {
                            const ayahs = res.data.ayahs || [];
                            const start = session.lastIndex;
                            const end = Math.min(start + 30, ayahs.length);

                            let textParts = [`📜 *تابع سورة ${session.name}* (الآية ${start + 1} إلى ${end})\n━━━━━━━━━━━━━━━━━━━━\n`];
                            for (let i = start; i < end; i++) {
                                textParts.push(`${ayahs[i].numberInSurah}. ${ayahs[i].text}`);
                            }

                            if (end < ayahs.length) {
                                textParts.push(`\n━━━━━━━━━━━━━━━━━━━━\n💡 اكتب *.continue* لمتابعة القراءة.`);
                                session.lastIndex = end;
                            } else {
                                textParts.push(`\n━━━━━━━━━━━━━━━━━━━━\n✅ *تمت السورة بحمد الله.*`);
                                delete quranSessions[sender];
                            }

                            await sendWithChannelButton(sock, sender, textParts.join('\n'), msg);
                        }
                    } catch (e) {
                        await sock.sendMessage(sender, { text: '❌ خطأ فالمتابعة.' }, { quoted: msg });
                    }
                    continue;
                }

                // 📚 TAFSIR (QURAN EXPLANATION) COMMAND
                if (body && body.match(/^\.(tafsir|تفسير)\s+(.+)/i)) {
                    const args = body.split(' ').slice(1);
                    if (args.length < 2) {
                        await sendWithChannelButton(sock, sender, `📖 *تفسير القرآن (Tafsir)*\n\n📝 *الطريقة:* .tafsir [اسم السورة] [رقم الآية]\n*مثال:* .tafsir الفاتحة 1\n\n⚔️ ${config.botName}`, msg);
                        continue;
                    }

                    const surah = getSurahNumber(args[0]);
                    const ayah = parseInt(args[1]);

                    if (!surah || isNaN(ayah)) {
                        await sock.sendMessage(sender, { text: '❌ يرجى التأكد من اسم السورة (أو الرقم) ورقم الآية.' }, { quoted: msg });
                        continue;
                    }

                    await sock.sendMessage(sender, { react: { text: "📖", key: msg.key } });
                    try {
                        const url = `https://quranenc.com/api/v1/translation/aya/arabic_moyassar/${surah}/${ayah}`;
                        const { data } = await axios.get(url);

                        if (data && data.result) {
                            const info = data.result;
                            const text = `📖 *تفسير الميسر*\n\n🕋 *سورة:* ${info.sura} - آية: ${info.aya}\n📜 *الآية:* ${info.arabic_text}\n\n📝 *التفسير:*\n${info.translation}\n\n⚔️ ${config.botName}`;
                            await sendWithChannelButton(sock, sender, text, msg);
                        } else {
                            await sock.sendMessage(sender, { text: '❌ لم يتم العثور على تفسير لهذه الآية.' }, { quoted: msg });
                        }
                    } catch (e) {
                        await sock.sendMessage(sender, { text: '❌ خطأ في جلب التفسير. جرب لاحقاً.' }, { quoted: msg });
                    }
                    continue;
                }

                // 🎬 YOUTUBE SEARCH COMMAND
                if (body && body.match(/^\.(yts|بحث-يوتيوب|chercher)\s+(.+)/i)) {
                    const searchQuery = body.split(' ').slice(1).join(' ').trim();

                    if (!searchQuery) {
                        await sock.sendMessage(sender, {
                            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.yts [اسم الفيديو]\n\n*مثال:* .yts سورة البقرة`
                        }, { quoted: msg });
                        continue;
                    }

                    await sock.sendMessage(sender, { react: { text: '🔍', key: msg.key } });
                    const waitMsg = await sock.sendMessage(sender, {
                        text: '🔍 *جاري البحث في يوتيوب...*'
                    }, { quoted: msg });

                    try {
                        const results = await yts(searchQuery);
                        const videos = results.videos.slice(0, 10); // Top 10 results

                        if (!videos || videos.length === 0) {
                            await sock.sendMessage(sender, { text: '❌ *ما لقيت حتى نتيجة. جرب كلمات أخرى.*' }, { quoted: msg });
                            continue;
                        }

                        // Format results
                        let resultText = `🎬 *نتائج البحث عن:* "${searchQuery}"\n\n`;
                        const buttons = [];

                        videos.forEach((v, i) => {
                            resultText += `*${i + 1}.* ${v.title}\n`;
                            resultText += `   ⏱️ *المدة:* ${v.timestamp} • 👁️ *مشاهدات:* ${v.views.toLocaleString()}\n`;
                            resultText += `   🔗 ${v.url}\n\n`;

                            // Add top 3 videos as buttons
                            if (i < 3) {
                                buttons.push({
                                    buttonId: `.video ${v.url}`,
                                    buttonText: { displayText: `🎥 تحميل فيديو ${i + 1}` },
                                    type: 1
                                });
                            }
                        });

                        try {
                            if (waitMsg) await sock.sendMessage(sender, { delete: waitMsg.key });
                        } catch (e) { }

                        // Send as Hybrid Message (Text + Buttons)
                        await sock.sendMessage(sender, {
                            text: resultText,
                            footer: `⚔️ ${config.botName} • ${config.botOwner}`,
                            buttons: buttons,
                            headerType: 1,
                            viewOnce: true
                        }, { quoted: msg });

                        await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });

                    } catch (error) {
                        console.error('YTS Error:', error);
                        try {
                            await sock.sendMessage(sender, { delete: waitMsg.key });
                        } catch (e) { }
                        await sock.sendMessage(sender, {
                            text: `❌ *خطأ في البحث:* ${error.message}`
                        }, { quoted: msg });
                    }
                    continue;
                }

                // 📩 GET SMS COMMAND (7sim.net)
                if (body && body.toLowerCase().startsWith('.getsms')) {
                    const smsUrl = body.split(' ')[1];
                    if (!smsUrl || !smsUrl.includes('7sim.net')) {
                        await sock.sendMessage(sender, { text: "⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة:* .getsms [رابط الرقم]\n\n*مثال:* .getsms https://7sim.net/free-phone-number-GYEjv40qY" }, { quoted: msg });
                        continue;
                    }

                    await sock.sendMessage(sender, { react: { text: "📩", key: msg.key } });
                    const waitSms = await sock.sendMessage(sender, { text: "⏳ *جاري جلب الرسائل...*" }, { quoted: msg });

                    try {
                        const response = await axios.get(smsUrl, { timeout: 15000 });
                        const $ = cheerio.load(response.data);
                        const messages = [];

                        $('tbody[data-pagination-content] tr').each((_, row) => {
                            const senderCell = $(row).find('td').eq(0);
                            const messageCell = $(row).find('td.td-message-content');
                            const timeCell = $(row).find('td.t-m-r');

                            const s = senderCell.text().trim();
                            const m = messageCell.text().trim();
                            const t = timeCell.attr('data-time') || timeCell.text().trim();

                            if (s && m) {
                                messages.push({ sender: s, message: m, time: t });
                            }
                        });

                        if (messages.length === 0) {
                            await sock.sendMessage(sender, { text: "❌ ما لقيت حتى شي رسالة لهاد الرقم دابا." }, { quoted: msg });
                            continue;
                        }

                        let text = `📩 *آخر الرسائل المستلمة للرقم:*\n\n`;
                        messages.slice(0, 10).forEach((m, i) => {
                            text += `*${i + 1}.* 📤 *من:* ${m.sender}\n`;
                            text += `   💬 ${m.message}\n`;
                            text += `   🕒 ${m.time}\n\n`;
                        });
                        text += `\n⚔️ *${config.botName}*`;

                        try { await sock.sendMessage(sender, { delete: waitSms.key }); } catch (e) { }
                        await sock.sendMessage(sender, { text }, { quoted: msg });
                        await sock.sendMessage(sender, { react: { text: "✅", key: msg.key } });

                    } catch (error) {
                        console.error('7sim SMS Error:', error.message);
                        try { await sock.sendMessage(sender, { delete: waitSms.key }); } catch (e) { }
                        await sock.sendMessage(sender, { text: `❌ *خطأ أثناء جلب الرسائل:* ${error.message}` }, { quoted: msg });
                    }
                    continue;
                }

                // 🎥 YOUTUBE VIDEO DOWNLOAD COMMAND
                if (body && body.match(/^\.(video|فيديو|vid)\s+(.+)/i)) {
                    const videoQuery = body.split(' ').slice(1).join(' ').trim();

                    if (!videoQuery) {
                        await sock.sendMessage(sender, {
                            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.video [رابط أو اسم]\n\n*مثال:* .video https://youtu.be/xxx`
                        }, { quoted: msg });
                        continue;
                    }

                    await sock.sendMessage(sender, { react: { text: '⏳', key: msg.key } });
                    const dlMsg = await sock.sendMessage(sender, {
                        text: '⏳ *جاري التحميل... صبر شوية*'
                    }, { quoted: msg });

                    try {
                        let videoUrl = videoQuery;
                        let videoTitle = 'video';
                        let thumbnail = '';

                        // If not a URL, search first
                        if (!videoQuery.match(/^https?:\/\//)) {
                            const searchRes = await yts(videoQuery);
                            if (!searchRes.videos || searchRes.videos.length === 0) {
                                await sock.sendMessage(sender, { text: '❌ *ما لقيت الفيديو*' }, { quoted: msg });
                                continue;
                            }
                            videoUrl = searchRes.videos[0].url;
                            videoTitle = searchRes.videos[0].title;
                            thumbnail = searchRes.videos[0].thumbnail;
                        }

                        // Download using API
                        let downloadUrl = null;

                        // Try primary API
                        try {
                            const apiUrl = `https://yt-dl.officialhectormanuel.workers.dev/?url=${encodeURIComponent(videoUrl)}`;
                            const response = await axios.get(apiUrl, { timeout: 30000 });

                            if (response.data && response.data.status) {
                                videoTitle = response.data.title || videoTitle;
                                thumbnail = response.data.thumbnail || thumbnail;
                                downloadUrl = response.data.videos["360"] || response.data.videos["480"] || Object.values(response.data.videos)[0];
                            }
                        } catch (e) {
                            console.log('Primary API failed, trying fallback...');
                        }

                        // Fallback API
                        if (!downloadUrl) {
                            try {
                                const vredenUrl = `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(videoUrl)}`;
                                const vResponse = await axios.get(vredenUrl, { timeout: 30000 });
                                if (vResponse.data && vResponse.data.status) {
                                    downloadUrl = vResponse.data.result.download;
                                    videoTitle = vResponse.data.result.title || videoTitle;
                                }
                            } catch (ve) {
                                console.log('Fallback also failed');
                            }
                        }

                        if (!downloadUrl) {
                            await sock.sendMessage(sender, { text: '❌ *فشل التحميل. جرب مرة أخرى*' }, { quoted: msg });
                            await sock.sendMessage(sender, { react: { text: '❌', key: msg.key } });
                            continue;
                        }

                        try {
                            await sock.sendMessage(sender, { delete: dlMsg.key });
                        } catch (e) { }

                        // Send preview
                        if (thumbnail) {
                            await sock.sendMessage(sender, {
                                image: { url: thumbnail },
                                caption: `🎬 *جاري الإرسال...*\n\n📌 *${videoTitle}*`
                            }, { quoted: msg });
                        }

                        // Send video
                        await sock.sendMessage(sender, {
                            video: { url: downloadUrl },
                            mimetype: 'video/mp4',
                            fileName: `${videoTitle.replace(/[^a-zA-Z0-9-_\.]/g, '_')}.mp4`,
                            caption: `✅ *تم التحميل بنجاح!*\n\n🎬 *${videoTitle}*\n\n⚔️ *${config.botName}*`
                        }, { quoted: msg });

                        await sock.sendMessage(sender, { react: { text: '✅', key: msg.key } });

                    } catch (error) {
                        console.error('Video Download Error:', error);
                        try {
                            await sock.sendMessage(sender, { delete: dlMsg.key });
                        } catch (e) { }
                        await sock.sendMessage(sender, {
                            text: `❌ *خطأ في التحميل:* ${error.message}`
                        }, { quoted: msg });
                        await sock.sendMessage(sender, { react: { text: '❌', key: msg.key } });
                    }
                    continue;
                }

                // 📱 TEMP NUMBER COMMAND (7sim.net)
                if (body && body.toLowerCase() === '.tempnum') {
                    await sock.sendMessage(sender, { react: { text: "📱", key: msg.key } });
                    const waitNum = await sock.sendMessage(sender, { text: "⏳ *جاري جلب أرقام مؤقتة من 7sim.net...*" }, { quoted: msg });

                    try {
                        const url = 'https://7sim.net/';
                        const response = await axios.get(url, { timeout: 15000 });
                        const $ = cheerio.load(response.data);
                        const results = [];

                        $('.js-countries-chunk').each((_, section) => {
                            const country = $(section).find('h2.titlecoutry').text().trim().replace(/\s+/g, ' ');
                            $(section).find('.js-numbers-item').each((_, item) => {
                                const number = $(item).find('a.npn').text().trim();
                                const link = $(item).find('a.npn').attr('href');
                                const source = $(item).find('.c-s-n').text().replace('Received SMS from ', '').trim();
                                if (number && link && source) {
                                    results.push({
                                        country,
                                        number,
                                        source,
                                        link: link.startsWith('http') ? link : `https://7sim.net${link}`,
                                    });
                                }
                            });
                        });

                        if (results.length === 0) {
                            await sock.sendMessage(sender, { text: "❌ ما لقيت حتى شي رقم دابا. جرب من بعد." }, { quoted: msg });
                            continue;
                        }

                        // Format for hybrid response
                        let listText = `🌍 *أرقام وهمية لتفعيل الحسابات (7sim)*\n\n`;
                        const buttons = [];

                        results.slice(0, 20).forEach((res, i) => {
                            listText += `*${i + 1}.* ${res.country}\n`;
                            listText += `   📱 ${res.number}\n`;
                            listText += `   🔗 ${res.link}\n\n`;

                            if (i < 3) {
                                buttons.push({
                                    buttonId: `.getsms ${res.link}`,
                                    buttonText: { displayText: `📩 جلب SMS رقم ${i + 1}` },
                                    type: 1
                                });
                            }
                        });

                        listText += `\n💡 ايلى ما بانوش ليك Buttons، غير كليكي على الرابط ولا كوبي الرابط وصيفطو مع .getsms`;

                        try { await sock.sendMessage(sender, { delete: waitNum.key }); } catch (e) { }

                        // Send as Hybrid Message
                        await sock.sendMessage(sender, {
                            text: listText,
                            footer: `⚔️ ${config.botName} • 7sim.net`,
                            buttons: buttons,
                            headerType: 1,
                            viewOnce: true
                        }, { quoted: msg });

                        await sock.sendMessage(sender, { react: { text: "✅", key: msg.key } });

                    } catch (error) {
                        console.error('7sim Error:', error.message);
                        try { await sock.sendMessage(sender, { delete: waitNum.key }); } catch (e) { }
                        await sock.sendMessage(sender, { text: `❌ *خطأ أثناء جلب البيانات:* ${error.message}` }, { quoted: msg });
                    }
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

                            // 🧠 Smart Context Detection
                            const isQuestion = caption.length > 2;
                            const lowerCaption = caption.toLowerCase();
                            const isExercise = lowerCaption.match(/tmrin|tamrin|tmarin|تمرين|تمارين|exer|devoir|jawb|ajib|أجب|حل|solve|question|sujet|exam/);

                            let prompt;
                            if (isExercise) {
                                prompt = `تصرف كأستاذ ذكي وخبير. المطلوب منك هو حل التمرين أو السؤال الموجود في الصورة حلاً كاملاً ومفصلاً خطوة بخطوة. اشرح الطريقة والنتيجة بوضوح. سؤال المستخدم: "${caption}"`;
                            } else if (caption.length > 2) {
                                prompt = `قم بتحليل الصورة بدقة، ثم أجب على سؤال المستخدم بناءً على ما تراه في الصورة. سؤال المستخدم هو: "${caption}"`;
                            } else {
                                prompt = "صف ما يوجد في هذه الصورة بالتفصيل.";
                            }

                            // 🚀 Priority 1: Obito (Fast Identification)
                            reply = await getObitoAnalyze(buffer, prompt, mime);
                            if (reply) {
                                console.log(chalk.green("✅ Obito responded."));
                            }

                            // 🚀 Priority 2: HuggingFace Vision (Smart OCR/Description - FREE)
                            if (!reply) {
                                reply = await getHFVision(buffer, prompt);
                                if (reply) console.log(chalk.green("✅ HF Vision responded."));
                            }

                            // 🚀 Priority 3: Gemini/OpenRouter (Only if keys exist)
                            if (!reply && config.openRouterKey) {
                                reply = await getOpenRouterResponse(sender, prompt, buffer);
                            }
                            if (!reply && config.geminiApiKey) {
                                reply = await getGeminiResponse(sender, prompt, buffer, mime);
                            }

                            // Format the final reply to be conversational
                            if (reply) {
                                if (isQuestion) {
                                    // Make it feel like Hamza is talkin to him
                                    reply = `${reply}\n\n*${config.botName}*`;
                                } else {
                                    reply = `*⎔ ⋅ ───━ •﹝🤖 التحليل الذكي ﹞• ━─── ⋅ ⎔*\n\n${reply}\n\n*${config.botName} - ${config.botOwner}*\n*⎔ ⋅ ───━ •﹝✅﹞• ━─── ⋅ ⎔*`;
                                }
                            }
                        }

                        if (!reply && !isVideo) {
                            reply = "⚠️ عذراً، ما قدرتش نقرا هاد التصويرة مزيان. عافاك دير ليها لقطة شاشة (Screenshot / la9tat chacha) وعاود صيفطها باش نقدر نجاوبك فالحين! 🙏";
                        } else if (!reply && isVideo) {
                            reply = await getPollinationsResponse(sender, caption);
                        }

                        if (reply) {
                            addToHistory(sender, 'user', caption || "Sent an image", buffer ? { buffer, mime } : null);
                            addToHistory(sender, 'assistant', reply);
                        }
                    } catch (err) {
                        console.error("Media Processing Error:", err);
                        reply = "أعتذر، وقع مشكل فمعالجة هاد الصورة. جرب مرة أخرى.";
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
                            let textInCmd = body.split(' ').slice(1).join(' ');

                            // 🧠 Manual Command Smart Context
                            const lowerText = textInCmd.toLowerCase();
                            const isExercise = lowerText.match(/tmrin|tamrin|tmarin|تمرين|تمارين|exer|devoir|jawb|ajib|أجب|حل|solve|question|sujet|exam/);

                            let caption;
                            if (isExercise) {
                                caption = `تصرف كأستاذ ذكي وخبير. قم بحل هذا التمرين أو السؤال بالتفصيل الممل، خطوة بخطوة. سياق السؤال: ${textInCmd}`;
                            } else {
                                caption = textInCmd ? `قم بتحليل الصورة بدقة، ثم أجب على سؤال المستخدم بناءً على ما تراه في الصورة. سؤال المستخدم هو: "${textInCmd}"` : "صف ما يوجد في هذه الصورة بالتفصيل.";
                            }
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
                    // 2. Text Message (Auto-Reply)
                    console.log(chalk.blue(`Processing text message from ${sender.split('@')[0]}...`));

                    // Priority 1: Hectormanuel AI (GPT-4o, 4o-mini)
                    reply = await getAutoGPTResponse(sender, body);

                    // Priority 2: LuminAI (Stable Fallback)
                    if (!reply) {
                        console.log(chalk.gray("Switching to LuminAI..."));
                        reply = await getLuminAIResponse(sender, body);
                    }

                    // Priority 3: AIDEV (Reliable ChatGPT provider)
                    if (!reply) {
                        console.log(chalk.gray("Switching to AIDEV..."));
                        reply = await getAIDEVResponse(sender, body);
                    }

                    // Priority 4: Pollinations
                    if (!reply) {
                        console.log(chalk.gray("Switching to Pollinations..."));
                        reply = await getPollinationsResponse(sender, body);
                    }

                    // Last Resorts: Keys
                    if (!reply && config.openRouterKey) reply = await getOpenRouterResponse(sender, body);
                    if (!reply && config.geminiApiKey) reply = await getGeminiResponse(sender, body);


                    if (reply) {
                        addToHistory(sender, 'user', body);
                        addToHistory(sender, 'assistant', reply);
                    } else {
                        console.log(chalk.red("❌ All AI providers failed."));
                        reply = "⚠️ جميع خدمات الذكاء الاصطناعي مشغولة حالياً. حاول مرة أخرى بعد قليل.";
                    }
                }

                // Wait for the minimum delay if AI was super fast (unlikely, but good for UX)
                await delayPromise;

                // Reply to user
                if (reply) {
                    await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });

                    // Stay visible in conversation context
                    await sock.sendPresenceUpdate('recording', sender); // Show recording for realism
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1s recording
                    await sock.sendPresenceUpdate('paused', sender); // Paused (still online)

                    // Keep online presence for 2 minutes to maintain conversation flow
                    setTimeout(async () => {
                        try {
                            await sock.sendPresenceUpdate('available', sender);
                        } catch (e) {
                            // Ignore if connection closed
                        }
                    }, 120000); // 2 minutes
                }
            }

        } catch (err) {
            console.error('Error in message handler:', err);
        }
    });
}

// Helper to send YouTube video
async function sendYTVideo(sock, chatId, videoUrl, title, quoted) {
    try {
        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: `✅ *تم تحميل الفيديو من YouTube بنجاح!* \n\n🎬 *${title}*\n⚔️ ${config.botName}`,
            mimetype: 'video/mp4'
        }, { quoted: quoted });
    } catch (e) {
        console.error('Error sending YT video URL, trying buffer:', e.message);
        try {
            const tempDir = path.join(__dirname, 'tmp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            const tempFile = path.join(tempDir, `yt_${Date.now()}.mp4`);

            try {
                // Check size before downloading (Stability)
                const headRes = await axios.head(videoUrl, { timeout: 15000 }).catch(() => null);
                const contentLength = headRes ? headRes.headers['content-length'] : null;
                const maxSize = 250 * 1024 * 1024; // 250MB

                if (contentLength && parseInt(contentLength) > maxSize) {
                    throw new Error(`large_file:${(parseInt(contentLength) / 1024 / 1024).toFixed(2)}MB`);
                }

                const writer = fs.createWriteStream(tempFile);
                const response = await axios({
                    url: videoUrl,
                    method: 'GET',
                    responseType: 'stream',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 600000
                });

                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                await sock.sendMessage(chatId, {
                    video: { url: tempFile },
                    caption: `✅ *تم تحميل الفيديو من YouTube بنجاح!* \n\n🎬 *${title}*\n⚔️ ${config.botName}`,
                    mimetype: 'video/mp4'
                }, { quoted: quoted });

            } finally {
                if (fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch (e) { }
                }
            }
        } catch (bufferError) {
            console.error('YT Buffer send failed:', bufferError.message);
            const isLarge = bufferError.message.includes('large_file');
            const errorText = isLarge
                ? "⚠️ *الفيديو كبير بزاف (أكثر من 250 ميجا).*"
                : "❌ *فشل تحميل فيديو يوتيوب. حاول مرة أخرى.*";

            await sock.sendMessage(chatId, { text: errorText }, { quoted: quoted });
        }
    }
}

// Helper to send Facebook video
async function sendFBVideo(sock, chatId, videoUrl, apiName, quoted) {
    try {
        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: `✅ *تم العثور على الفيديو بنجاح!* \n\n🎬 *المصدر:* ${apiName}\n⚔️ ${config.botName}`,
            mimetype: 'video/mp4'
        }, { quoted: quoted });
    } catch (e) {
        console.error('Error sending video URL, trying buffer:', e.message);
        try {
            const tempDir = path.join(__dirname, 'tmp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
            const tempFile = path.join(tempDir, `fb_${Date.now()}.mp4`);

            try {
                // Check size before downloading (Stability)
                const headRes = await axios.head(videoUrl, { timeout: 15000 }).catch(() => null);
                const contentLength = headRes ? headRes.headers['content-length'] : null;
                const maxSize = 250 * 1024 * 1024; // 250MB

                if (contentLength && parseInt(contentLength) > maxSize) {
                    throw new Error(`large_file:${(parseInt(contentLength) / 1024 / 1024).toFixed(2)}MB`);
                }

                const writer = fs.createWriteStream(tempFile);
                const response = await axios({
                    url: videoUrl,
                    method: 'GET',
                    responseType: 'stream',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 600000
                });

                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                const stats = fs.statSync(tempFile);
                if (stats.size > maxSize) throw new Error("large_file");

                await sock.sendMessage(chatId, {
                    video: { url: tempFile },
                    caption: `✅ *تم العثور على الفيديو بنجاح!* \n\n🎬 *المصدر:* ${apiName}\n⚔️ ${config.botName}`,
                    mimetype: 'video/mp4'
                }, { quoted: quoted });

            } finally {
                if (fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch (e) { }
                }
            }
        } catch (bufferError) {
            console.error('Buffer send failed:', bufferError.message);
            const isLarge = bufferError.message.includes('large_file');
            const errorText = isLarge
                ? "⚠️ *الفيديو كبير بزاف (أكثر من 250 ميجا).*"
                : "❌ *فشل تحميل الفيديو. حاول مرة أخرى.*";

            await sock.sendMessage(chatId, { text: errorText }, { quoted: quoted });
        }
    }
}

// Handle unhandled rejections to prevent crash (Global Scope - Fix Memory Leak)
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

startBot();
