const axios = require('axios');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse, detectLanguage } = require('./ai');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const { ALL_COMMANDS, NLC_KEYWORDS, isQuestionOrInquiry } = require('./commandMap');
const { checkSubscriptionGate, getSubscriptionMessage, getWelcomeMessage } = require('./subscription');
const { uploadToCatbox, uploadToBestProvider } = require('./media');
const { db } = require('./supabase');

async function fetchFbProfileName(senderId, pageToken) {
    try {
        const res = await axios.get(`https://graph.facebook.com/v19.0/${senderId}?fields=first_name,last_name&access_token=${pageToken}`);
        if (res.data && res.data.first_name) {
            return `${res.data.first_name} ${res.data.last_name || ''}`.trim();
        }
    } catch (e) {
        // Silent fail
    }
    return null;
}

// Deduplication: prevent processing the same Facebook message twice
// (FB webhooks can redeliver the same event multiple times)
const processedFbMids = new Set();
setInterval(() => processedFbMids.clear(), 5 * 60 * 1000); // Clean every 5 min

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
        // Also persist to Supabase ai_memory with fb: prefix
        try { db.upsertPlatformUser(`fb:${id}`); } catch (e) {}
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

function logFacebookError(prefix, error, recipientId = null) {
    const fbError = error.response?.data?.error;
    if (fbError) {
        if (fbError.code === 10 && fbError.error_subcode === 2018278) {
            console.warn(chalk.yellow(`[Facebook Warning] Messaging window closed for recipient ${recipientId || 'unknown'} (Outside 24-hour window).`));
        } else {
            console.error(chalk.red(`${prefix} API Error:`), fbError.message, `(Code: ${fbError.code}, Subcode: ${fbError.error_subcode})`);
        }
    } else {
        console.error(chalk.red(`${prefix} Network Error:`), error.message);
    }
}

async function sendFacebookMessage(recipientId, text, pageTokenOrId = config.fbPageAccessToken) {
    try {
        let token = pageTokenOrId;
        
        // If it's a pageId instead of a token, find the token
        if (pageTokenOrId && !pageTokenOrId.startsWith('EAA')) {
            if (global.fbPageTokens && global.fbPageTokens[pageTokenOrId]) {
                token = global.fbPageTokens[pageTokenOrId];
            } else {
                const page = config.fbPages && config.fbPages.find(p => p.id === pageTokenOrId);
                if (page) token = page.token;
            }
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
        logFacebookError('[Facebook Send]', error, recipientId);
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
        logFacebookError('[Facebook Image Send]', error, recipientId);
    }
}

async function sendFacebookMedia(recipientId, mediaSource, type, caption, pageToken = config.fbPageAccessToken) {
    // Extract URL if mediaSource is an object or string
    let url = (typeof mediaSource === 'object' && !Buffer.isBuffer(mediaSource) && mediaSource.url)
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
            logFacebookError('[Facebook Media URL Send]', urlErr, recipientId);
        }
    }

    // Strategy 2: If we have a buffer, upload it to a public CDN first then send via URL
    // (Facebook Graph API accepts public URLs more reliably than raw FormData uploads)
    if (Buffer.isBuffer(mediaSource)) {
        try {
            let ext = 'jpg', mime = 'image/jpeg';
            if (type === 'audio') { ext = 'mp3'; mime = 'audio/mpeg'; }
            else if (type === 'video') { ext = 'mp4'; mime = 'video/mp4'; }
            else if (type === 'file') { ext = 'bin'; mime = 'application/octet-stream'; }

            console.log(chalk.yellow(`[Facebook] Uploading ${type} buffer to CDN for ${recipientId}...`));
            const cdnUrl = await uploadToBestProvider(mediaSource, `media.${ext}`, mime);
            if (cdnUrl) {
                console.log(chalk.green(`[Facebook] CDN upload success: ${cdnUrl}`));
                await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, {
                    recipient: { id: recipientId },
                    message: { attachment: { type, payload: { url: cdnUrl, is_reusable: true } } }
                });
                if (caption) await sendFacebookMessage(recipientId, caption, pageToken);
                return;
            }
        } catch (cdnErr) {
            console.warn(chalk.yellow(`[Facebook] CDN upload failed, trying FormData: ${cdnErr.message}`));
        }
    }

    // Strategy 3: Direct FormData buffer upload fallback
    if (Buffer.isBuffer(mediaSource)) {
        try {
            let ext = 'file';
            if (type === 'image') ext = 'jpg';
            else if (type === 'audio') ext = 'mp3';
            else if (type === 'video') ext = 'mp4';
            const formData = new FormData();
            formData.append('recipient', JSON.stringify({ id: recipientId }));
            formData.append('message', JSON.stringify({ attachment: { type, payload: { is_reusable: true } } }));
            formData.append('filedata', mediaSource, { filename: `media.${ext}` });
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, formData, {
                headers: formData.getHeaders()
            });
            if (caption) await sendFacebookMessage(recipientId, caption, pageToken);
            return;
        } catch (bufErr) {
            logFacebookError('[Facebook Media Buffer Send]', bufErr, recipientId);
        }
    }

    // Strategy 4: If all else fails and we have a URL, send the link as text
    if ((type === 'audio' || type === 'video') && url) {
        try {
            const prefix = type === 'audio' ? '🎵' : '🎥';
            const defaultCap = type === 'audio' ? 'استمع للأغنية عبر الرابط' : 'شاهد أو حمّل الفيديو عبر الرابط';
            await sendFacebookMessage(recipientId, `${prefix} ${caption || defaultCap}:\n${url}`, pageToken);
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

        // Check event timestamp. If it's too old (e.g., > 23 hours), ignore it to avoid Facebook 24h window errors.
        if (event.timestamp) {
            const ageMs = Date.now() - event.timestamp;
            if (ageMs > 23 * 60 * 60 * 1000) {
                console.log(chalk.yellow(`[Facebook] Ignoring message from ${senderId} as it is too old (${Math.round(ageMs / 1000 / 60)} minutes old)`));
                return;
            }
        }

        // Check if user is banned
        try {
            const bannedPath = path.join(__dirname, '..', 'data', 'banned.json');
            let bannedUsers = [];
            if (fs.existsSync(bannedPath)) {
                bannedUsers = JSON.parse(fs.readFileSync(bannedPath, 'utf8') || '[]');
            }
            if (bannedUsers.includes(`fb:${senderId}`) || bannedUsers.includes(senderId.toString())) {
                console.log(chalk.red(`[Facebook] Banned user tried to message: ${senderId}`));
                return;
            }
        } catch (_) {}

        const pageId = event.recipient ? event.recipient.id : null;
        if (pageId && global.pausedBots?.facebook?.[pageId]) {
            return;
        }
        const message = event.message;

        if (!message) return;

        // ── Deduplication: skip already-processed messages ──
        if (message.mid && processedFbMids.has(message.mid)) return;
        if (message.mid) processedFbMids.add(message.mid);

        // استخراج التوكن الخاص بالصفحة التي استقبلت الرسالة
        let pageToken = config.fbPageAccessToken;
        if (pageId) {
            if (global.fbPageTokens && global.fbPageTokens[pageId]) {
                pageToken = global.fbPageTokens[pageId];
            } else if (config.fbPages && Array.isArray(config.fbPages)) {
                const foundPage = config.fbPages.find(p => p.id === pageId);
                if (foundPage && foundPage.token) {
                    pageToken = foundPage.token;
                }
            }
        }

        let displayName = "FB User";
        if (senderId && pageToken) {
            const cleanSenderId = senderId.toString();
            global.fbNames = global.fbNames || {};
            if (!global.fbNames[cleanSenderId]) {
                try {
                    const name = await fetchFbProfileName(cleanSenderId, pageToken);
                    if (name) {
                        global.fbNames[cleanSenderId] = name;
                        await db.saveUserNames('facebook', global.fbNames).catch(() => {});
                        console.log(chalk.green(`[Facebook] Resolved profile name for ${cleanSenderId}: ${name}`));
                    }
                } catch (_) {}
            }
            displayName = global.fbNames[cleanSenderId] || "FB User";
        }

        // RAW LOG for debugging unknown Facebook message formats
        console.log(chalk.gray(`[Facebook Raw Msg]: ${JSON.stringify(message)}`));

        let text = message.text || "";
        let mediaUrl = null;
        let isImage = false;
        let isVideo = false;

        if (message.attachments) {
            for (const attachment of message.attachments) {
                const url = attachment.payload?.url
                    || attachment.payload?.sticker_url
                    || attachment.payload?.src
                    || "";
                const type = attachment.type;

                // ── Skip Facebook built-in stickers (sticker_id present) ──
                // They arrive as type=image but are emoji-stickers, not user photos.
                // Processing them creates an infinite vision analysis loop.
                if (attachment.payload?.sticker_id) {
                    console.log(chalk.gray(`[Facebook] Skipping built-in sticker (id: ${attachment.payload.sticker_id})`));
                    return; // Ignore the entire event silently
                }

                if (type === 'image' ||
                    (type === 'file' && url.match(/\.(jpg|jpeg|png|webp|gif)/i))) {
                    mediaUrl = url;
                    isImage = true;
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

        // ===== SUBSCRIPTION GATE REMOVED =====
        // Was blocking all users after Koyeb restarts (ephemeral filesystem wipes subscribed_users.json)
        // ===== END =====

        saveFbUser(senderId, pageId); // save for broadcast purposes

        // Activity log for dashboard
        try {
            global._activityLog = global._activityLog || [];
            const preview = text ? (text.length > 60 ? text.substring(0, 60) + '...' : text) : '[Media]';
            global._activityLog.unshift({
                time: new Date().toISOString(),
                platform: 'facebook',
                user: senderId,
                message: preview
            });
            if (global._activityLog.length > 50) global._activityLog.length = 50;
        } catch (_) {}

        const isCommand = text.match(/^[\.\/]([a-zA-Z0-9\u0600-\u06FF\-_]+)(\s+.*|$)/i);

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
                const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: displayName, body: text };

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
                        try { await addToHistory('fb:' + senderId, "user", text || "[Image]", { buffer, mime: 'image/jpeg' }); } catch (e) {}
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
                    const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: displayName, body: text };
                    
                    let cmdBuffer = null;
                    if (isImage && mediaUrl) {
                        try {
                            const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 20000 });
                            cmdBuffer = Buffer.from(res.data);
                            const { addToHistory } = require('./ai');
                            await addToHistory('fb:' + senderId, "user", text || "[Image]", { buffer: cmdBuffer, mime: 'image/jpeg' });
                        } catch (e) {}
                    }
                    
                    await cmdFile(mockSock, senderId, msg, args, { isFacebook: true, command: command, buffer: cmdBuffer }, detectLanguage(text));
                    commandHandled = true;
                    if (global.trackCommand) global.trackCommand(command, 'facebook');
                }
            }

            // NLC Support
            if (!commandHandled && !isQuestionOrInquiry(text)) {
                const nlcKeywords = NLC_KEYWORDS;
                const context = await getContext('fb:' + senderId);
                const hasRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;

                for (const [key, path] of Object.entries(nlcKeywords)) {
                    // Skip NLC image generation if user is likely asking about the recent photo they just sent
                    if (hasRecentImg && key.includes("صورة") && (lowerBody.includes("في") || lowerBody.includes("شنو") || lowerBody.includes("اش") || lowerBody.includes("معنى") || lowerBody.includes("وصف") || lowerBody.includes("معايا"))) {
                        continue;
                    }

                    if (new RegExp(`(${key})`, "i").test(lowerBody)) {
                        try {
                            const rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                            const cmdFile = require(`../commands/${path}`);
                            const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                            const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: displayName, body: text };
                            
                            let nlcBuffer = null;
                            if (isImage && mediaUrl) {
                                try {
                                    const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 20000 });
                                    nlcBuffer = Buffer.from(res.data);
                                    const { addToHistory } = require('./ai');
                                    await addToHistory('fb:' + senderId, "user", text || "[Image]", { buffer: nlcBuffer, mime: 'image/jpeg' });
                                } catch (e) {}
                            }
                            
                            await cmdFile(mockSock, senderId, msg, rest, { isFacebook: true, command: key.split("|")[0], buffer: nlcBuffer }, detectLanguage(text));
                            commandHandled = true;
                            if (global.trackCommand) global.trackCommand(key.split('|')[0], 'facebook');
                            break;
                        } catch (e) { }
                    }
                }
            }

            if (commandHandled) return;

            // If chatbot is disabled globally, skip AI chat responses (read fresh config every time)
            if (require('../config').enableChatbot === 'false') return;

            // Follow-up on recent image
            const context = await getContext('fb:' + senderId);
            const isRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
            if (isRecentImg && text.length > 2 && !text.startsWith(".")) {
                try {
                    const analyze = require('../commands/ai/analyze');
                    const mockSock = createMockSock(senderId, null, pageToken);
                    const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: displayName, body: text };
                    await analyze(mockSock, senderId, msg, text.split(" "), { buffer: context.lastImage.buffer, mime: context.lastImage.mime, caption: text }, detectLanguage(text));
                    return;
                } catch (e) { }
            }

            // Default AI handling if no command worked
            console.log(chalk.cyan(`[FB AI] Racing for: "${text.substring(0,30)}" from ${senderId}`));
            const aiPromises = [];
            const fbJid = 'fb:' + senderId;
            if (config.geminiApiKey) aiPromises.push(getGeminiResponse(fbJid, text));
            if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(fbJid, text));

            aiPromises.push(getLuminAIResponse(fbJid, text));
            aiPromises.push(getAIDEVResponse(fbJid, text));
            aiPromises.push(getPollinationsResponse(fbJid, text));
            aiPromises.push(getBlackboxResponse(fbJid, text));
            aiPromises.push(getStableAIResponse(fbJid, text));
            aiPromises.push(getAutoGPTResponse(fbJid, text));

            let reply;
            try {
                const racePromise = Promise.any(aiPromises.map(p => p.then(res => {
                    if (!res) throw new Error("No response");
                    return res;
                })));
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000));
                reply = await Promise.race([racePromise, timeoutPromise]);
                console.log(chalk.green(`[FB AI] Reply found (${reply?.length} chars)`));
            } catch (e) {
                console.log(chalk.yellow(`[FB AI] Race failed: ${e.message}. Sequential fallback...`));
                reply = await getStableAIResponse(fbJid, text) || await getBlackboxResponse(fbJid, text);
                if (reply) {
                    console.log(chalk.green(`[FB AI] Sequential fallback succeeded`));
                } else {
                    console.log(chalk.red(`[FB AI] ALL providers failed`));
                    reply = `🤖 بوت حمزة اعمرني\n\nأنا هنا! خدمات الذكاء الاصطناعي بطيئة قليلاً الآن.\n\nجرب:\n• .menu لرؤية الأوامر\n• .ping للتحقق\n• .weather للطقس`;
                }
            }

            if (reply) {
                await addToHistory(fbJid, 'user', text);
                let botReplyText = reply;
                let extractedCommand = null;

                const cmdMatchAI = reply.match(/\[COMMAND:\s*(\.[a-zA-Z0-9\u0600-\u06FF\-_]+.*?)]/i);
                if (cmdMatchAI) {
                    extractedCommand = cmdMatchAI[1].trim();
                    botReplyText = reply.replace(cmdMatchAI[0], '').trim();
                }

                if (botReplyText) {
                    await addToHistory(fbJid, 'assistant', botReplyText);
                    await sendFacebookMessage(senderId, botReplyText, pageToken);
                } else {
                    await addToHistory(fbJid, 'assistant', '[تم تنفيذ الأداة بنجاح]');
                }

                if (extractedCommand) {
                    const cmdMatch = extractedCommand.match(/^[\.]?([a-zA-Z0-9\u0600-\u06FF\-_]+)(\s+.*|$)/i);
                    if (cmdMatch) {
                        const command = cmdMatch[1].toLowerCase();
                        const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);
                        const allCmds = ALL_COMMANDS;
                        if (allCmds[command]) {
                            try {
                                const cmdFile = require(`../commands/${allCmds[command]}`);
                                const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                                const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: displayName, body: text };
                                await cmdFile(mockSock, senderId, msg, args, { isFacebook: true, command: command, buffer: null }, detectLanguage(text));
                                if (global.trackCommand) global.trackCommand(command, 'facebook');
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

module.exports = { handleFacebookMessage, sendFacebookMessage, saveFbUser, getFbUsers, fetchFbProfileName };

