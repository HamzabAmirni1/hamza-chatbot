const axios = require('axios');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse, detectLanguage } = require('./ai');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const { ALL_COMMANDS, NLC_KEYWORDS } = require('./commandMap');
const { checkSubscriptionGate, getSubscriptionMessage, getWelcomeMessage } = require('./subscription');

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

// Save Facebook user to DB with page mapping
function saveFbUser(senderId, pageId) {
    try {
        const dbPath = path.join(__dirname, '..', 'data', 'fb_users.json');
        fs.ensureDirSync(path.dirname(dbPath));
        let users = [];
        if (fs.existsSync(dbPath)) {
            try { 
                const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                users = Array.isArray(data) ? data : [];
            } catch (e) { users = []; }
        }

        // Migration for old string-only IDs
        let migrated = false;
        users = users.map(u => {
            if (typeof u === 'string') {
                migrated = true;
                return { id: u, pageId: config.fbPageId || 'me' };
            }
            return u;
        });

        const id = senderId.toString();
        const pId = pageId ? pageId.toString() : (config.fbPageId || 'me');
        
        const existingUser = users.find(u => u.id === id);
        if (!existingUser) {
            users.push({ id, pageId: pId });
            fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
            return true; // New user
        } else if (migrated) {
            fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
        }
        return false; // Existing user
    } catch (e) { return false; }
}

function getFbUsers() {
    try {
        const dbPath = path.join(__dirname, '..', 'data', 'fb_users.json');
        if (!fs.existsSync(dbPath)) return [];
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8') || '[]');
        return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
}

async function sendFacebookMessage(recipientId, text, pageTokenOrId = config.fbPageAccessToken) {
    try {
        let token = pageTokenOrId;
        
        // If it's a pageId instead of a token, find the token
        if (pageTokenOrId && !pageTokenOrId.startsWith('EAA')) {
            const page = config.fbPages && config.fbPages.find(p => p.id === pageTokenOrId);
            if (page) token = page.token;
        }

        // Split text into 1900 character chunks to respect FB's 2000 char limit
        const chunks = text.match(/[\s\S]{1,1900}/g) || [""];
        for (const chunk of chunks) {
            console.log(chalk.green(`[Facebook Response] To ${recipientId}: ${chunk.substring(0, 50)}...`));
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
                recipient: { id: recipientId },
                message: { text: chunk }
            });
            if (chunks.length > 1) await new Promise(r => setTimeout(r, 600)); // Delay between chunks
        }
    } catch (error) {
        console.error(chalk.red('[Facebook] Send Error:'), error.response?.data || error.message);
    }
}

async function sendFacebookImage(recipientId, imageBuffer, caption, pageToken = config.fbPageAccessToken) {
    try {
        const formData = new FormData();
        formData.append('recipient', JSON.stringify({ id: recipientId }));
        formData.append('message', JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: true } } }));
        formData.append('filedata', imageBuffer, { filename: 'image.jpg' });

        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, formData, {
            headers: formData.getHeaders()
        });
        if (caption) await sendFacebookMessage(recipientId, caption, pageToken);
    } catch (error) {
        console.error(chalk.red('[Facebook] Image Send Error:'), error.response?.data || error.message);
    }
}

async function sendFacebookMedia(recipientId, mediaSource, type, caption, pageToken = config.fbPageAccessToken) {
    // Extract URL if mediaSource is an object or string
    const url = (typeof mediaSource === 'object' && !Buffer.isBuffer(mediaSource) && mediaSource.url)
        ? mediaSource.url
        : (typeof mediaSource === 'string' ? mediaSource : null);

    // Strategy 1: Send via direct URL (preferred — avoids upload errors like #2018047)
    if (url) {
        try {
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, {
                recipient: { id: recipientId },
                message: { attachment: { type: type, payload: { url: url, is_reusable: true } } }
            });
            if (caption) await sendFacebookMessage(recipientId, caption, pageToken);
            return;
        } catch (urlErr) {
            console.warn(chalk.yellow(`[Facebook] URL-based ${type} upload failed, trying fallback...`), urlErr.response?.data?.error?.message || urlErr.message);
        }
    }

    // Strategy 2: Upload buffer via FormData (only for non-audio or if URL unavailable)
    if (Buffer.isBuffer(mediaSource) && type !== 'audio') {
        try {
            const formData = new FormData();
            formData.append('recipient', JSON.stringify({ id: recipientId }));
            formData.append('message', JSON.stringify({ attachment: { type, payload: { is_reusable: true } } }));
            formData.append('filedata', mediaSource, { filename: `media.${type === 'audio' ? 'mp3' : 'mp4'}` });
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, formData, {
                headers: formData.getHeaders()
            });
            if (caption) await sendFacebookMessage(recipientId, caption, pageToken);
            return;
        } catch (bufErr) {
            console.error(chalk.red(`[Facebook] ${type} buffer upload also failed:`), bufErr.response?.data || bufErr.message);
        }
    }

    // Strategy 3: For audio, if both fail, send the link as text so user can at least access it
    if (type === 'audio' && url) {
        try {
            await sendFacebookMessage(recipientId, `🎵 ${caption || 'استمع للأغنية عبر الرابط'}:\n${url}`, pageToken);
            return;
        } catch (e) { /* ignore */ }
    }

    console.error(chalk.red(`[Facebook] ${type} Send Error: all strategies exhausted`));
}

// Mock sock for FB commands
function createMockSock(senderId, mediaUrl = null, pageToken = config.fbPageAccessToken) {
    const sock = {
        sendMessage: async (id, content, opts) => {
            const chatId = id.toString();
            if (content.text) return await sendFacebookMessage(chatId, content.text, pageToken);
            if (content.image) {
                const photoSource = content.image.url || content.image;
                const buffer = Buffer.isBuffer(photoSource) ? photoSource : (typeof photoSource === 'string' && photoSource.startsWith('http') ? await axios.get(photoSource, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : photoSource);
                return await sendFacebookImage(chatId, buffer, content.caption || "", pageToken);
            }
            if (content.video) return await sendFacebookMedia(chatId, content.video, 'video', content.caption, pageToken);
            if (content.audio) return await sendFacebookMedia(chatId, content.audio, 'audio', content.caption, pageToken);
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
            return await sendFacebookMessage(id.toString(), text || "Command Result Sent", pageToken);
        },
        waUploadToServer: async () => ({ url: "mock-url" }),
        downloadMedia: async () => {
            if (!mediaUrl) return null;
            try {
                const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 20000 });
                return Buffer.from(res.data);
            } catch (e) { return null; }
        },
        downloadMediaMessage: async () => {
            if (!mediaUrl) return null;
            try {
                const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 20000 });
                return Buffer.from(res.data);
            } catch (e) { return null; }
        },
        generateWAMessageContent: BaileysMock.generateWAMessageContent,
        generateWAMessageFromContent: BaileysMock.generateWAMessageFromContent,
        proto: BaileysMock.proto
    };
    return sock;
}

async function handleFacebookMessage(event) {
    try {
        const senderId = event.sender.id;
        const pageId = event.recipient ? event.recipient.id : null;
        const message = event.message;

        if (!message) return;

        // استخراج التوكن الخاص بالصفحة التي استقبلت الرسالة
        let pageToken = config.fbPageAccessToken;
        if (pageId && config.fbPages && Array.isArray(config.fbPages)) {
            const foundPage = config.fbPages.find(p => p.id === pageId);
            if (foundPage && foundPage.token) {
                pageToken = foundPage.token;
            }
        }

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
        console.log(chalk.cyan(`[Facebook] Message from ${senderId} (Page: ${pageId}): ${text || '[Media]'}`));

        // ===== SUBSCRIPTION GATE (Facebook) =====
        const isOwner = config.ownerNumber.includes(senderId.toString());
        if (!isOwner) {
            const gateResult = checkSubscriptionGate(senderId.toString(), 'fb');
            if (gateResult === 'blocked') {
                await sendFacebookMessage(senderId, getSubscriptionMessage('fb'), pageToken);
                return;
            } else if (gateResult === 'pending') {
                await sendFacebookMessage(senderId, getWelcomeMessage(), pageToken);
                // fall through — let this message be processed normally too
            }
        }
        // ===== END SUBSCRIPTION GATE =====

        saveFbUser(senderId, pageId); // save for broadcast purposes

        const isCommand = text.match(/^[\.\/]([a-zA-Z0-9]+)(\s+.*|$)/i);

        // Automatic Media Handling — analyze image/video with AI
        if ((isImage || isVideo) && !isCommand) {
            try {
                if (!mediaUrl) {
                    await sendFacebookMessage(senderId, "❌ لم أتمكن من الحصول على رابط الصورة. حاول مرة أخرى.", pageToken);
                    return;
                }
                console.log(chalk.yellow(`[Facebook Media] Downloading: ${mediaUrl}`));
                const analyze = require('../commands/ai/analyze');
                const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };

                const res = await axios.get(mediaUrl, {
                    responseType: 'arraybuffer',
                    timeout: 20000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                const buffer = Buffer.from(res.data);

                if (buffer && buffer.length > 0) {
                    // IMMEDIATELY save the image to context so subsequent commands (like .aiedit) can use it!
                    const { addToHistory } = require('./ai');
                    if (isImage) {
                        try { await addToHistory(senderId, "user", text || "[Image]", { buffer, mime: 'image/jpeg' }); } catch (e) {}
                    }

                    const questionArgs = text ? text.split(" ") : [];
                    await analyze(mockSock, senderId, msg, questionArgs, { isFacebook: true, buffer, isVideo, caption: text }, "ar");
                    return;
                } else {
                    await sendFacebookMessage(senderId, "❌ فشل تحميل الصورة. حاول مرة أخرى.", pageToken);
                    return;
                }
            } catch (e) {
                console.error('[Facebook Media Error]:', e.message);
                await sendFacebookMessage(senderId, "❌ خطأ في معالجة الصورة.", pageToken);
                return;
            }
        }
        try {
            const cmdMatch = isCommand;
            let commandHandled = false;

            // Use unified command map (same as WhatsApp & Telegram)
            const allCmds = ALL_COMMANDS;

            if (cmdMatch) {
                const command = cmdMatch[1].toLowerCase();
                const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);

                if (allCmds[command]) {
                    const cmdFile = require(`../commands/${allCmds[command]}`);
                    const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                    const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };
                    
                    let cmdBuffer = null;
                    if (isImage && mediaUrl) {
                        try {
                            const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 20000 });
                            cmdBuffer = Buffer.from(res.data);
                            const { addToHistory } = require('./ai');
                            await addToHistory(senderId, "user", text || "[Image]", { buffer: cmdBuffer, mime: 'image/jpeg' });
                        } catch (e) {}
                    }
                    
                    await cmdFile(mockSock, senderId, msg, args, { isFacebook: true, command: command, buffer: cmdBuffer }, detectLanguage(text));
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
                            const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                            const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };
                            
                            let nlcBuffer = null;
                            if (isImage && mediaUrl) {
                                try {
                                    const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 20000 });
                                    nlcBuffer = Buffer.from(res.data);
                                    const { addToHistory } = require('./ai');
                                    await addToHistory(senderId, "user", text || "[Image]", { buffer: nlcBuffer, mime: 'image/jpeg' });
                                } catch (e) {}
                            }
                            
                            await cmdFile(mockSock, senderId, msg, rest, { isFacebook: true, command: key.split("|")[0], buffer: nlcBuffer }, detectLanguage(text));
                            commandHandled = true;
                            break;
                        } catch (e) { }
                    }
                }
            }

            if (commandHandled) return;

            // Follow-up on recent image
            const context = await getContext(senderId);
            const isRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
            if (isRecentImg && text.length > 2 && !text.startsWith(".")) {
                try {
                    const analyze = require('../commands/ai/analyze');
                    const mockSock = createMockSock(senderId, null, pageToken);
                    const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };
                    await analyze(mockSock, senderId, msg, text.split(" "), { buffer: context.lastImage.buffer, mime: context.lastImage.mime, caption: text }, detectLanguage(text));
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
                console.log(chalk.green(`[Facebook AI] Reply found: ${reply.substring(0, 50)}...`));
            } catch (e) {
                console.error(chalk.yellow(`[Facebook AI] Race failed: ${e.message}. Falling back...`));
                reply = await getStableAIResponse(senderId, text) || await getBlackboxResponse(senderId, text) || "عذراً، حدث خطأ في معالجة طلبك.";
            }

            if (reply) {
                await addToHistory(senderId, 'user', text);
                let botReplyText = reply;
                let extractedCommand = null;

                const cmdMatchAI = reply.match(/\[COMMAND:\s*(\.[a-zA-Z0-9\u0600-\u06FF\-]+.*?)]/i);
                if (cmdMatchAI) {
                    extractedCommand = cmdMatchAI[1].trim();
                    botReplyText = reply.replace(cmdMatchAI[0], '').trim();
                }

                if (botReplyText) {
                    await addToHistory(senderId, 'assistant', botReplyText);
                    await sendFacebookMessage(senderId, botReplyText, pageToken);
                } else {
                    await addToHistory(senderId, 'assistant', '[تم تنفيذ الأداة بنجاح]');
                }

                if (extractedCommand) {
                    const cmdMatch = extractedCommand.match(/^[\.]?([a-zA-Z0-9\u0600-\u06FF\-]+)(\s+.*|$)/i);
                    if (cmdMatch) {
                        const command = cmdMatch[1].toLowerCase();
                        const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);
                        const allCmds = ALL_COMMANDS;
                        if (allCmds[command]) {
                            try {
                                const cmdFile = require(`../commands/${allCmds[command]}`);
                                const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                                const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: "FB User", body: text };
                                await cmdFile(mockSock, senderId, msg, args, { isFacebook: true, command: command, buffer: null }, detectLanguage(text));
                            } catch (err) { console.error("[Facebook] AI Command Execution Error:", err); }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(chalk.red('[Facebook CMD Error]:'), error.message);
        }
    } catch (globalError) {
        console.error(chalk.red('[Facebook Global Event Error]:'), globalError.message);
    }
}

module.exports = { handleFacebookMessage, sendFacebookMessage, saveFbUser, getFbUsers };

