const axios = require('axios');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse } = require('./ai');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const { ALL_COMMANDS, NLC_KEYWORDS } = require('./commandMap');

const BaileysMock = {
    generateWAMessageContent: async (content) => ({ imageMessage: content.image }),
    generateWAMessageFromContent: (id, content) => ({ message: content, key: { id: Date.now().toString() } }),
    proto: {
        Message: {
            InteractiveMessage: {
                fromObject: (obj) => obj, Body: { fromObject: (obj) => obj, create: (obj) => obj },
                Footer: { create: (obj) => obj }, Header: { fromObject: (obj) => obj },
                NativeFlowMessage: { fromObject: (obj) => obj }, CarouselMessage: { fromObject: (obj) => obj }
            }
        }
    }
};

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

async function sendFacebookMedia(recipientId, mediaSource, type, caption) {
    try {
        const url = (typeof mediaSource === 'object' && mediaSource.url) ? mediaSource.url : (typeof mediaSource === 'string' ? mediaSource : null);

        if (url) {
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`, {
                recipient: { id: recipientId },
                message: { attachment: { type: type, payload: { url: url, is_reusable: true } } }
            });
        } else {
            const formData = new FormData();
            formData.append('recipient', JSON.stringify({ id: recipientId }));
            formData.append('message', JSON.stringify({ attachment: { type, payload: { is_reusable: true } } }));
            formData.append('filedata', mediaSource, { filename: `media.${type === 'audio' ? 'mp3' : 'mp4'}` });
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`, formData, {
                headers: formData.getHeaders()
            });
        }
        if (caption) await sendFacebookMessage(recipientId, caption);
    } catch (error) {
        console.error(chalk.red(`[Facebook] ${type} Send Error:`), error.response?.data || error.message);
    }
}

// Mock sock for FB commands
function createMockSock(senderId) {
    const sock = {
        sendMessage: async (id, content, opts) => {
            const chatId = id.toString();
            if (content.text) return await sendFacebookMessage(chatId, content.text);
            if (content.image) {
                const buffer = Buffer.isBuffer(content.image) ? content.image : (content.image.url ? await axios.get(content.image.url, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : content.image);
                return await sendFacebookImage(chatId, buffer, content.caption);
            }
            if (content.video) return await sendFacebookMedia(chatId, content.video, 'video', content.caption);
            if (content.audio) return await sendFacebookMedia(chatId, content.audio, 'audio', content.caption);
            if (content.react) return;
        },
        relayMessage: async (id, message, opts) => {
            let text = "";
            try {
                const interactive = message?.viewOnceMessage?.message?.interactiveMessage || message?.interactiveMessage;
                if (interactive) {
                    const bodyText = interactive.body?.text || "";
                    const footerText = interactive.footer?.text || "";
                    text = `${bodyText}\n\n_${footerText}_`.trim();

                    if (interactive.carouselMessage?.cards) {
                        const cards = interactive.carouselMessage.cards;
                        text += "\n\n" + cards.map((c, idx) => `${idx + 1}. *${c.header?.title || ''}*\n${c.body?.text || ''}`).join('\n\n');
                    }
                }
            } catch (e) { }
            return await sendFacebookMessage(id.toString(), text || "Command Result Sent");
        },
        waUploadToServer: async () => ({ url: "mock-url" }),
        downloadMedia: async () => null,
        downloadMediaMessage: async () => null,
        generateWAMessageContent: BaileysMock.generateWAMessageContent,
        generateWAMessageFromContent: BaileysMock.generateWAMessageFromContent,
        proto: BaileysMock.proto
    };
    return sock;
}

async function handleFacebookMessage(event) {
    try {
        const senderId = event.sender.id;
        const message = event.message;

        if (!message) return;

        // RAW LOG for debugging unknown Facebook message formats
        console.log(chalk.gray(`[Facebook Raw Msg]: ${JSON.stringify(message)}`));

        let text = message.text || "";
        let mediaUrl = null;
        let isImage = false;
        let isVideo = false;

        if (message.attachments) {
            for (const attachment of message.attachments) {
                // Facebook puts the URL in different places depending on attachment type
                const url = attachment.payload?.url
                    || attachment.payload?.sticker_url
                    || attachment.payload?.src
                    || "";
                const type = attachment.type;

                if (type === 'image' || type === 'sticker' ||
                    (type === 'file' && url.match(/\.(jpg|jpeg|png|webp|gif)/i))) {
                    mediaUrl = url;
                    isImage = true;
                    // Keep actual user text as question; empty = analyze uses default prompt
                    text = message.text || "";
                    break;
                } else if (type === 'video') {
                    mediaUrl = url;
                    isVideo = true;
                    text = message.text || "";
                    break;
                } else if (type === 'fallback' && url) {
                    if (url.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
                        mediaUrl = url;
                        isImage = true;
                        text = message.text || "";
                    }
                }
            }
        }

        // Nothing to process
        if (!text && !mediaUrl) return;

        const lowerBody = text.toLowerCase().trim();
        console.log(chalk.cyan(`[Facebook] Message from ${senderId}: ${text || '[Media]'}`));

        saveFbUser(senderId);

        // Automatic Media Handling — analyze image/video with AI
        if (isImage || isVideo) {
            try {
                if (!mediaUrl) {
                    await sendFacebookMessage(senderId, "❌ لم أتمكن من الحصول على رابط الصورة. حاول مرة أخرى.");
                    return;
                }
                console.log(chalk.yellow(`[Facebook Media] Downloading: ${mediaUrl}`));
                const analyze = require('../commands/ai/analyze');
                const mockSock = createMockSock(senderId);
                const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };

                const res = await axios.get(mediaUrl, {
                    responseType: 'arraybuffer',
                    timeout: 20000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                const buffer = Buffer.from(res.data);

                if (buffer && buffer.length > 0) {
                    const questionArgs = text ? text.split(" ") : [];
                    await analyze(mockSock, senderId, msg, questionArgs, { isFacebook: true, buffer, isVideo, caption: text }, "ar");
                    return;
                } else {
                    await sendFacebookMessage(senderId, "❌ فشل تحميل الصورة. حاول مرة أخرى.");
                    return;
                }
            } catch (e) {
                console.error('[Facebook Media Error]:', e.message);
                await sendFacebookMessage(senderId, "❌ خطأ في معالجة الصورة.");
                return;
            }
        }
        try {
            const cmdMatch = text.match(/^[\.\/]([a-zA-Z0-9]+)(\s+.*|$)/i);
            let commandHandled = false;

            // Use unified command map (same as WhatsApp & Telegram)
            const allCmds = ALL_COMMANDS;

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
                // Use unified NLC map (same as WhatsApp & Telegram)
                const nlcKeywords = NLC_KEYWORDS;

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

            // Follow-up on recent image
            const context = getContext(senderId);
            const isRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
            if (isRecentImg && text.length > 2 && !text.startsWith(".")) {
                try {
                    const analyze = require('../commands/ai/analyze');
                    const mockSock = createMockSock(senderId);
                    const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };
                    await analyze(mockSock, senderId, msg, text.split(" "), { buffer: context.lastImage.buffer, mime: context.lastImage.mime, caption: text }, "ar");
                    return;
                } catch (e) { }
            }

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
            console.error(chalk.red('[Facebook CMD Error]:'), error.message);
        }
    } catch (globalError) {
        console.error(chalk.red('[Facebook Global Event Error]:'), globalError.message);
    }
}

module.exports = { handleFacebookMessage, sendFacebookMessage };

