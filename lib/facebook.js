const axios = require('axios');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse } = require('./ai');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

const FormData = require('form-data');

// Save Facebook user to DB
function saveFbUser(senderId) {
    try {
        const dbPath = path.join(__dirname, '..', 'data', 'fb_users.json');
        fs.ensureDirSync(path.dirname(dbPath));
        let users = [];
        if (fs.existsSync(dbPath)) {
            try { users = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch (e) { users = []; }
        }
        const id = senderId.toString();
        if (!users.includes(id)) {
            users.push(id);
            fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
        }
    } catch (e) { }
}

async function sendFacebookMessage(recipientId, text) {
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`, {
            recipient: { id: recipientId },
            message: { text: text }
        });
    } catch (error) {
        console.error(chalk.red('[Facebook] Send Error:'), error.response?.data || error.message);
    }
}

async function sendFacebookImage(recipientId, imageBuffer, caption) {
    try {
        const formData = new FormData();
        formData.append('recipient', JSON.stringify({ id: recipientId }));
        formData.append('message', JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: true } } }));
        formData.append('filedata', imageBuffer, { filename: 'image.jpg' });

        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`, formData, {
            headers: formData.getHeaders()
        });
        if (caption) await sendFacebookMessage(recipientId, caption);
    } catch (error) {
        console.error(chalk.red('[Facebook] Image Send Error:'), error.response?.data || error.message);
    }
}

// Mock sock for FB commands
function createMockSock(senderId) {
    const sock = {
        sendMessage: async (id, content, opts) => {
            const chatId = id.toString();
            if (content.text) return await sendFacebookMessage(chatId, content.text);
            if (content.image) {
                const buffer = Buffer.isBuffer(content.image) ? content.image : await axios.get(content.image.url, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data));
                return await sendFacebookImage(chatId, buffer, content.caption);
            }
            if (content.react) return; // FB doesn't support reactions via simple API easily
        },
        waUploadToServer: async () => ({ url: "" }),
        downloadMedia: async () => null // FB media download is different
    };
    return sock;
}

async function handleFacebookMessage(event) {
    const senderId = event.sender.id;
    const message = event.message;

    if (!message || !message.text) return;

    const text = message.text;
    const lowerBody = text.toLowerCase().trim();
    console.log(chalk.cyan(`[Facebook] Message from ${senderId}: ${text}`));

    // Track Facebook user
    saveFbUser(senderId);

    // Command handling
    try {
        const cmdMatch = text.match(/^[\.\/]([a-zA-Z0-9]+)(\s+.*|$)/i);
        let commandHandled = false;

        const allCmds = {
            "yts": "thmil/yts", "video": "thmil/video", "vid": "thmil/video", "فيديو": "thmil/video",
            "play": "thmil/play", "song": "thmil/play", "أغنية": "thmil/play",
            "fb": "thmil/fb", "facebook": "thmil/fb", "فيسبوك": "thmil/fb",
            "ig": "thmil/ig", "instagram": "thmil/ig", "إنستغرام": "thmil/ig",
            "tiktok": "thmil/tiktok", "تيكتوك": "thmil/tiktok",
            "menu": "info/menu", "help": "info/menu", "قائمة": "info/menu",
            "owner": "info/owner", "ping": "tools/ping", "status": "tools/ping",
            "nano": "image/nano", "nanobanana": "image/nano", "imgedit": "image/imgeditai",
            "gen": "image/gen", "generate": "image/gen", "photo": "image/gen", "image": "image/gen", "img": "image/gen", "تخيل": "image/gen", "ارسم": "image/gen", "صورة": "image/gen",
            "wallpaper": "image/wallpaper", "4kwallpaper": "image/wallpaper",
            "googleimg": "image/googleimg", "gimage": "image/googleimg",
            "deepimg": "image/deepimg", "deepimage": "image/deepimg",
            "devmsg": "admin/broadcast", "broadcast": "admin/broadcast",
            "devmsgwa": "admin/broadcast", "devmsgtg": "admin/broadcast", "devmsgfb": "admin/broadcast", "devmsgtous": "admin/broadcast", "devmsgall": "admin/broadcast",
            "weather": "tools/weather", "wether": "tools/weather", "طقس": "tools/weather", "الطقس": "tools/weather"
        };

        if (cmdMatch) {
            const command = cmdMatch[1].toLowerCase();
            const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);

            if (allCmds[command]) {
                const cmdFile = require(`../commands/${allCmds[command]}`);
                const mockSock = createMockSock(senderId);
                const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };
                await cmdFile(mockSock, senderId, msg, args, { isFacebook: true, command: command }, "ar");
                commandHandled = true;
            }
        }

        // NLC Support
        if (!commandHandled) {
            const nlcKeywords = {
                "قرآن|quran|سورة|sura|القرآن": "islamic/quran",
                "تعديل|نانو|edit|nano": "image/nano",
                "gen|generate|توليد|photo|image|img|تخيل|ارسم|صورة": "image/gen",
                "دعاء|dua|اذكار|ad3iya": "islamic/ad3iya",
                "طقس|weather|wether|الطقس": "tools/weather",
                "قائمة|menu|help": "info/menu"
            };

            for (const [key, path] of Object.entries(nlcKeywords)) {
                if (new RegExp(`(${key})`, "i").test(lowerBody)) {
                    try {
                        const rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                        const cmdFile = require(`../commands/${path}`);
                        const mockSock = createMockSock(senderId);
                        const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };
                        await cmdFile(mockSock, senderId, msg, rest, { isFacebook: true, command: key.split("|")[0] }, "ar");
                        commandHandled = true;
                        break;
                    } catch (e) { }
                }
            }
        }

        if (commandHandled) return;

        // Default AI handling if no command worked
        const aiPromises = [];
        if (config.geminiApiKey) aiPromises.push(getGeminiResponse(senderId, text));
        if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(senderId, text));

        aiPromises.push(getLuminAIResponse(senderId, text));
        aiPromises.push(getAIDEVResponse(senderId, text));
        aiPromises.push(getPollinationsResponse(senderId, text));
        aiPromises.push(getBlackboxResponse(senderId, text));
        aiPromises.push(getStableAIResponse(senderId, text));
        aiPromises.push(getAutoGPTResponse(senderId, text));

        let reply;
        try {
            const racePromise = Promise.any(aiPromises.map(p => p.then(res => {
                if (!res) throw new Error("No response");
                return res;
            })));
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000));
            reply = await Promise.race([racePromise, timeoutPromise]);
        } catch (e) {
            reply = await getStableAIResponse(senderId, text) || await getBlackboxResponse(senderId, text) || "عذراً، حدث خطأ في معالجة طلبك.";
        }

        if (reply) {
            addToHistory(senderId, 'user', text);
            addToHistory(senderId, 'assistant', reply);
            await sendFacebookMessage(senderId, reply);
        }
    } catch (error) {
        console.error(chalk.red('[Facebook] Error:'), error.message);
    }
}

module.exports = { handleFacebookMessage, sendFacebookMessage };

