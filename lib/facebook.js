const axios = require('axios');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse, detectLanguage } = require('./ai');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const { ALL_COMMANDS, NLC_KEYWORDS, isQuestionOrInquiry, handleAutoDownload } = require('./commandMap');
const { checkSubscriptionGate, getSubscriptionMessage, getWelcomeMessage } = require('./subscription');
const { uploadToCatbox, uploadToBestProvider } = require('./media');
const { db } = require('./supabase');

async function fetchFbProfileName(senderId, pageToken) {
    try {
        // Method 1: Direct profile lookup (works for some accounts)
        const res = await axios.get(`https://graph.facebook.com/v19.0/${senderId}?fields=first_name,last_name&access_token=${pageToken}`);
        if (res.data && res.data.first_name) {
            return `${res.data.first_name} ${res.data.last_name || ''}`.trim();
        }
    } catch (e) {
        // Fall through to method 2
    }
    try {
        // Method 2: Use conversations API to get participant name (works with page-scoped IDs)
        const res = await axios.get(
            `https://graph.facebook.com/v19.0/me/conversations?user_id=${senderId}&fields=participants&access_token=${pageToken}`,
            { timeout: 8000 }
        );
        const conversation = res.data && res.data.data && res.data.data[0];
        if (conversation && conversation.participants && conversation.participants.data) {
            const participant = conversation.participants.data.find(p => p.id === senderId.toString());
            if (participant && participant.name) {
                return participant.name;
            }
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
        users = users.map(u => {
            if (typeof u === 'string') return { id: u, pageId: config.fbPageId || 'me' };
            return u;
        });

        const id = senderId.toString();
        const pId = pageId ? pageId.toString() : (config.fbPageId || 'me');
        const now = new Date().toISOString();
        
        const existingUser = users.find(u => u.id === id);
        if (!existingUser) {
            users.push({ id, pageId: pId, lastActiveAt: now });
            fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
            // Also persist to Supabase
            try { db.upsertPlatformUser(`fb:${id}`); } catch (e) {}
            return true; // New user
        } else {
            // Always update lastActiveAt when user sends a message
            existingUser.lastActiveAt = now;
            if (pId && pId !== 'me') existingUser.pageId = pId;
            fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
            // Also persist to Supabase
            try { db.upsertPlatformUser(`fb:${id}`); } catch (e) {}
            return false; // Existing user
        }
    } catch (e) { return false; }
}

/**
 * Returns FB users who were active within the last `hoursWindow` hours.
 * Users without lastActiveAt are treated as unknown → included (benefit of the doubt).
 */
function getFbActiveUsers(hoursWindow = 23) {
    try {
        const dbPath = path.join(__dirname, '..', 'data', 'fb_users.json');
        if (!fs.existsSync(dbPath)) return [];
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const users = Array.isArray(data) ? data : [];
        const cutoff = Date.now() - hoursWindow * 60 * 60 * 1000;
        return users.map(u => {
            if (typeof u === 'string') return { id: u, pageId: config.fbPageId || 'me', withinWindow: true };
            const lastActive = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0;
            return { ...u, withinWindow: lastActive === 0 || lastActive >= cutoff };
        });
    } catch (e) { return []; }
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

/**
 * Send a Facebook sender_action (mark_seen | typing_on | typing_off)
 * Silently ignores errors (non-critical).
 */
async function sendSenderAction(recipientId, action, token = config.fbPageAccessToken) {
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
            { recipient: { id: recipientId.toString() }, sender_action: action }
        );
    } catch (_) {} // Silent - never break the main flow
}

async function sendFacebookMessage(recipientId, text, pageTokenOrId = config.fbPageAccessToken, tag = null) {
    recipientId = recipientId.toString().replace('fb:', '').replace('tg:', '');
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

        // Smart line-by-line chunking to respect FB's 2000 char limit without breaking lines/words
        const lines = text.split('\n');
        const chunks = [];
        let currentChunk = '';
        
        for (const line of lines) {
            if ((currentChunk + '\n' + line).length > 1900) {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk = currentChunk ? currentChunk + '\n' + line : line;
            }
        }
        if (currentChunk) chunks.push(currentChunk);
        if (chunks.length === 0) chunks.push("");

        for (const chunk of chunks) {
            console.log(chalk.green(`[Facebook Response] To ${recipientId}: ${chunk.substring(0, 50)}...`));
            const payload = {
                recipient: { id: recipientId },
                message: { text: chunk }
            };
            if (tag) {
                payload.messaging_type = 'MESSAGE_TAG';
                payload.tag = tag;
            }
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, payload);
            if (chunks.length > 1) await new Promise(r => setTimeout(r, 600)); // Delay between chunks
        }
    } catch (error) {
        logFacebookError('[Facebook Send]', error, recipientId);
        throw error;
    }
}

// Detect the actual mime-type and file extension from a buffer's magic bytes
function detectMimeAndExt(buffer, defaultType) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
        if (defaultType === 'audio') return { mime: 'audio/mpeg', ext: 'mp3' };
        if (defaultType === 'video') return { mime: 'video/mp4', ext: 'mp4' };
        if (defaultType === 'image') return { mime: 'image/jpeg', ext: 'jpg' };
        return { mime: 'application/octet-stream', ext: 'bin' };
    }

    const hex = buffer.toString('hex', 0, 12).toUpperCase();

    // PNG
    if (hex.startsWith('89504E47')) {
        return { mime: 'image/png', ext: 'png' };
    }
    // JPEG
    if (hex.startsWith('FFD8FF')) {
        return { mime: 'image/jpeg', ext: 'jpg' };
    }
    // GIF
    if (hex.startsWith('47494638')) {
        return { mime: 'image/gif', ext: 'gif' };
    }
    // WebP
    if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') {
        return { mime: 'image/webp', ext: 'webp' };
    }
    // Ogg
    if (hex.startsWith('4F676753')) {
        return { mime: 'audio/ogg', ext: 'ogg' };
    }
    // WebM
    if (hex.startsWith('1A45DFA3')) {
        return { mime: 'audio/webm', ext: 'webm' };
    }
    // WAV
    if (hex.startsWith('52494646') && hex.slice(16, 24) === '57415645') {
        return { mime: 'audio/wav', ext: 'wav' };
    }
    // MP3
    if (hex.startsWith('494433') || hex.startsWith('FFF3') || hex.startsWith('FFFB') || hex.startsWith('FFF2')) {
        return { mime: 'audio/mpeg', ext: 'mp3' };
    }
    // MP4 / M4A
    if (hex.slice(8, 16) === '66747970') {
        const ftyp = buffer.toString('ascii', 8, 12);
        if (ftyp === 'M4A ' || ftyp === 'm4a ') {
            return { mime: 'audio/mp4', ext: 'm4a' };
        }
        return { mime: 'video/mp4', ext: 'mp4' };
    }

    if (defaultType === 'audio') return { mime: 'audio/mpeg', ext: 'mp3' };
    if (defaultType === 'video') return { mime: 'video/mp4', ext: 'mp4' };
    if (defaultType === 'image') return { mime: 'image/jpeg', ext: 'jpg' };
    return { mime: 'application/octet-stream', ext: 'bin' };
}

// Upload a buffer to Facebook's own attachment API and return the attachment_id
async function uploadToFacebookAttachments(buffer, type, pageToken) {
    try {
        const detected = detectMimeAndExt(buffer, type);
        const ext = detected.ext;
        const mimeType = detected.mime;

        const formData = new FormData();
        formData.append('message', JSON.stringify({
            attachment: { type, payload: { is_reusable: true } }
        }));
        formData.append('filedata', buffer, {
            filename: `upload.${ext}`,
            contentType: mimeType
        });

        const { data } = await axios.post(
            `https://graph.facebook.com/v19.0/me/message_attachments?access_token=${pageToken}`,
            formData,
            { headers: formData.getHeaders(), timeout: 30000 }
        );

        return data?.attachment_id || null;
    } catch (e) {
        const fbErr = e.response?.data?.error;
        if (fbErr) {
            console.error(chalk.red(`[FB Attachment Upload] API Error: ${fbErr.message} (${fbErr.code})`));
        } else {
            console.error(chalk.red(`[FB Attachment Upload] Error: ${e.message}`));
        }
        return null;
    }
}

async function sendFacebookImage(recipientId, imageBuffer, caption, pageToken = config.fbPageAccessToken, tag = null) {
    recipientId = recipientId.toString().replace('fb:', '').replace('tg:', '');
    // Delegate to sendFacebookMedia which has better fallback logic
    await sendFacebookMedia(recipientId, imageBuffer, 'image', caption, pageToken, tag);
}

async function sendFacebookMedia(recipientId, mediaSource, type, caption, pageToken = config.fbPageAccessToken, tag = null) {
    recipientId = recipientId.toString().replace('fb:', '').replace('tg:', '');
    // Extract URL if mediaSource is an object or string
    let url = (typeof mediaSource === 'object' && !Buffer.isBuffer(mediaSource) && mediaSource.url)
        ? mediaSource.url
        : (typeof mediaSource === 'string' ? mediaSource : null);

    const isBuffer = Buffer.isBuffer(mediaSource);

    // Helper to send messages with optional tag
    const sendMsg = async (messagePayload) => {
        const payload = {
            recipient: { id: recipientId },
            message: messagePayload
        };
        if (tag) {
            payload.messaging_type = 'MESSAGE_TAG';
            payload.tag = tag;
        }
        return await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, payload);
    };

    // ── Strategy 1: Facebook Attachment Upload API (most reliable for buffers) ──
    // Uploads directly to FB servers → get attachment_id → send with that ID
    if (isBuffer) {
        try {
            console.log(chalk.yellow(`[Facebook] Uploading ${type} to FB Attachment API for ${recipientId}...`));
            let attachmentId = await uploadToFacebookAttachments(mediaSource, type, pageToken);
            
            // Fallback: if audio upload fails/unsupported, retry as general 'file'
            if (!attachmentId && type === 'audio') {
                console.log(chalk.yellow(`[Facebook] Audio attachment upload failed/unsupported. Retrying as 'file' type...`));
                attachmentId = await uploadToFacebookAttachments(mediaSource, 'file', pageToken);
                if (attachmentId) {
                    await sendMsg({ attachment: { type: 'file', payload: { attachment_id: attachmentId } } });
                    if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
                    return;
                }
            }

            if (attachmentId) {
                console.log(chalk.green(`[Facebook] FB Attachment upload success (id: ${attachmentId})`));
                await sendMsg({ attachment: { type, payload: { attachment_id: attachmentId } } });
                if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
                return;
            }
        } catch (e) {
            console.warn(chalk.yellow(`[Facebook] FB Attachment API failed: ${e.message}`));
        }
    }

    // ── Strategy 2: Self-hosted temp URL (Bot's own server = always public) ──
    // Store buffer in memory → Facebook fetches from our Koyeb URL
    if (isBuffer && global.storeTempMedia) {
        try {
            const detected = detectMimeAndExt(mediaSource, type);
            const mime = detected.mime;

            const selfUrl = global.storeTempMedia(mediaSource, mime);
            console.log(chalk.yellow(`[Facebook] Self-hosted URL: ${selfUrl} (${mime})`));
            
            try {
                await sendMsg({ attachment: { type, payload: { url: selfUrl, is_reusable: false } } });
                if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
                return;
            } catch (fbErr) {
                // If it is audio and failed, retry as 'file' type
                if (type === 'audio') {
                    console.warn(chalk.yellow(`[Facebook] Self-hosted audio URL failed. Retrying as 'file' type...`));
                    try {
                        await sendMsg({ attachment: { type: 'file', payload: { url: selfUrl, is_reusable: false } } });
                        if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
                        return;
                    } catch (innerErr) {
                        logFacebookError('[Facebook Self-hosted Audio URL Send File Fallback]', innerErr, recipientId);
                    }
                }
                throw fbErr;
            }
        } catch (selfErr) {
            logFacebookError('[Facebook Self-hosted URL Send]', selfErr, recipientId);
        }
    }

    // ── Strategy 3: Send via direct URL (if we have one) ──
    if (url) {
        try {
            await sendMsg({ attachment: { type, payload: { url, is_reusable: true } } });
            if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
            return;
        } catch (urlErr) {
            const fbErr = urlErr.response?.data?.error;
            if (fbErr && (fbErr.error_subcode === 2018109 || (fbErr.message && (fbErr.message.includes('taille') || fbErr.message.toLowerCase().includes('size') || fbErr.message.toLowerCase().includes('limit'))))) {
                global._lastFbMediaSizeError = true;
            }
            logFacebookError('[Facebook Media URL Send]', urlErr, recipientId);
        }
    }

    // ── Strategy 4: Upload buffer to public CDN, then send via URL ──
    if (isBuffer) {
        try {
            const detected = detectMimeAndExt(mediaSource, type);
            const ext = detected.ext;
            const mime = detected.mime;

            console.log(chalk.yellow(`[Facebook] Trying CDN upload for ${type}...`));
            const cdnUrl = await uploadToBestProvider(mediaSource, `media.${ext}`, mime);
            if (cdnUrl) {
                console.log(chalk.green(`[Facebook] CDN upload success: ${cdnUrl}`));
                try {
                    await sendMsg({ attachment: { type, payload: { url: cdnUrl, is_reusable: true } } });
                    if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
                    return;
                } catch (fbErr) {
                    if (type === 'audio') {
                        console.warn(chalk.yellow(`[Facebook] CDN audio URL failed. Retrying as 'file' type...`));
                        await sendMsg({ attachment: { type: 'file', payload: { url: cdnUrl, is_reusable: true } } });
                        if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
                        return;
                    }
                    throw fbErr;
                }
            }
        } catch (cdnErr) {
            console.warn(chalk.yellow(`[Facebook] CDN upload failed: ${cdnErr.message}`));
        }
    }

    // ── Strategy 5: Raw FormData upload (last resort) ──
    if (isBuffer) {
        try {
            const detected = detectMimeAndExt(mediaSource, type);
            const ext = detected.ext;
            const mimeType = detected.mime;

            const formData = new FormData();
            formData.append('recipient', JSON.stringify({ id: recipientId }));
            formData.append('message', JSON.stringify({ attachment: { type, payload: { is_reusable: true } } }));
            formData.append('filedata', mediaSource, { filename: `media.${ext}`, contentType: mimeType });
            if (tag) {
                formData.append('messaging_type', 'MESSAGE_TAG');
                formData.append('tag', tag);
            }
            await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, formData, {
                headers: formData.getHeaders(), timeout: 30000
            });
            if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
            return;
        } catch (bufErr) {
            const fbErr = bufErr.response?.data?.error;
            if (fbErr && (fbErr.error_subcode === 2018109 || (fbErr.message && (fbErr.message.includes('taille') || fbErr.message.toLowerCase().includes('size') || fbErr.message.toLowerCase().includes('limit'))))) {
                global._lastFbMediaSizeError = true;
            }
            if (type === 'audio') {
                try {
                    console.log(chalk.yellow(`[Facebook] Raw audio buffer send failed. Retrying as 'file' type...`));
                    const detected = detectMimeAndExt(mediaSource, 'file');
                    const ext = detected.ext;
                    const mimeType = detected.mime;
                    
                    const formData = new FormData();
                    formData.append('recipient', JSON.stringify({ id: recipientId }));
                    formData.append('message', JSON.stringify({ attachment: { type: 'file', payload: { is_reusable: true } } }));
                    formData.append('filedata', mediaSource, { filename: `media.${ext}`, contentType: mimeType });
                    if (tag) {
                        formData.append('messaging_type', 'MESSAGE_TAG');
                        formData.append('tag', tag);
                    }
                    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageToken}`, formData, {
                        headers: formData.getHeaders(), timeout: 30000
                    });
                    if (caption) await sendFacebookMessage(recipientId, caption, pageToken, tag);
                    return;
                } catch (innerErr) {
                    logFacebookError('[Facebook Media Buffer Send File Fallback]', innerErr, recipientId);
                }
            }
            logFacebookError('[Facebook Media Buffer Send]', bufErr, recipientId);
        }
    }

    // ── Strategy 6: For audio/video with URL, send as text link ──
    if ((type === 'audio' || type === 'video') && url) {
        try {
            const prefix = type === 'audio' ? '🎵' : '🎥';
            const defaultCap = type === 'audio' ? 'استمع للأغنية عبر الرابط' : 'شاهد أو حمّل الفيديو عبر الرابط';
            
            let sizeWarning = "";
            if (type === 'video' && global._lastFbMediaSizeError) {
                sizeWarning = "\n\n⚠️ *تنبيه:* حجم الفيديو يتجاوز 25 ميغابايت (الحد الأقصى لرفع الملفات على Messenger). تفضل برابط التحميل المباشر:";
                delete global._lastFbMediaSizeError; // reset
            }

            await sendFacebookMessage(recipientId, `${prefix} ${caption || defaultCap}${sizeWarning}\n${url}`, pageToken, tag);
            return;
        } catch (e) { /* ignore */ }
    }

    console.error(chalk.red(`[Facebook] ${type} Send Error: all strategies exhausted`));
    throw new Error(`[Facebook] ${type} Send Error: all strategies exhausted`);
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

                    const cards = interactive.carouselMessage?.cards || [];
                    if (cards.length > 0) {
                        const lines = [bodyText, ""].filter(Boolean);
                        cards.forEach((c, idx) => {
                            const title = c.header?.title || "";
                            const body = c.body?.text || "";
                            const btns = (c.nativeFlowMessage?.buttons || []).map(b => {
                                try { const p = JSON.parse(b.buttonParamsJson || '{}'); return p.display_text || ""; } catch { return ""; }
                            }).filter(Boolean).join(" | ");
                            lines.push(`${idx + 1}. ${title ? `【${title}】` : ""}${body ? `\n${body}` : ""}${btns ? `\n╰ ${btns}` : ""}`);
                        });
                        if (footerText) lines.push(`\n${footerText}`);
                        text = lines.join("\n");
                    } else {
                        const btns = (interactive.nativeFlowMessage?.buttons || []).map(b => {
                            try { const p = JSON.parse(b.buttonParamsJson || '{}'); return p.display_text || ""; } catch { return ""; }
                        }).filter(Boolean).join(" | ");
                        text = [bodyText, btns ? `[ ${btns} ]` : "", footerText].filter(Boolean).join("\n\n");
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
            if (global.bannedUsersCache && (global.bannedUsersCache.includes(`fb:${senderId}`) || global.bannedUsersCache.includes(senderId.toString()))) {
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

        // ── Mark as seen + show typing indicator immediately ──
        // This removes the "جديد" badge from the Facebook Page inbox
        sendSenderAction(senderId, 'mark_seen', pageToken).catch(() => {});
        sendSenderAction(senderId, 'typing_on', pageToken).catch(() => {});

        let displayName = "FB User";
        if (senderId && pageToken) {
            const cleanSenderId = senderId.toString();
            global.fbNames = global.fbNames || {};
            if (!global.fbNames[cleanSenderId]) {
                try {
                    const name = await fetchFbProfileName(cleanSenderId, pageToken);
                    global.fbNames[cleanSenderId] = name || `مستخدم فيسبوك (${cleanSenderId})`;
                    await db.saveUserNames('facebook', global.fbNames).catch(() => {});
                    console.log(chalk.green(`[Facebook] Resolved profile name for ${cleanSenderId}: ${global.fbNames[cleanSenderId]}`));
                } catch (_) {
                    global.fbNames[cleanSenderId] = `مستخدم فيسبوك (${cleanSenderId})`;
                    await db.saveUserNames('facebook', global.fbNames).catch(() => {});
                }
            }
            displayName = global.fbNames[cleanSenderId];
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

        const isCommand = text.match(/^[\.\/]\s*([a-zA-Z0-9\u0600-\u06FF\-_]+)(\s+.*|$)/i);

        // Check for profanity / bad language (skip owner)
        const isOwner = config.ownerNumber.some(n => n.replace(/[^0-9]/g, '') === senderId.replace(/[^0-9]/g, ''));
        if (text && !isCommand && !isOwner) {
            const { scanMessage, handleProfanity } = require('./profanity');
            const matchedBadWord = scanMessage(text);
            if (matchedBadWord) {
                const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                await handleProfanity('FB', 'fb:' + senderId, displayName, text, matchedBadWord, mockSock, null);
                return;
            }
            const { scanMessage: scanIbhaya, handleIbhaya } = require('./ibhaya');
            const matchedIbhaya = scanIbhaya(text);
            if (matchedIbhaya) {
                const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                await handleIbhaya('FB', 'fb:' + senderId, displayName, text, matchedIbhaya, mockSock, null);
                return;
            }
        }

        // Increment message count for leaderboard
        if (text) {
            const { incrementUser } = require('./leaderboard');
            incrementUser('facebook', 'fb:' + senderId, displayName);
        }


        // Media received → silently download and save to context history; auto-analyze/reply to photos if enabled
        if (isImage || isVideo) {
            let buffer = null;
            try {
                if (mediaUrl) {
                    const res = await axios.get(mediaUrl, {
                        responseType: 'arraybuffer',
                        timeout: 20000,
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                    });
                    buffer = Buffer.from(res.data);
                    if (buffer && buffer.length > 0) {
                        const { addToHistory } = require('./ai');
                        if (isImage) {
                            try { await addToHistory('fb:' + senderId, "user", text || "[Image]", { buffer, mime: 'image/jpeg' }); } catch (e) {}
                        }
                    }
                }
            } catch (e) {
                console.error('[Facebook Media Save Error]:', e.message);
            }

            if (!isCommand) {
                // If it is an image and chatbot is enabled, auto-reply to the image
                const chatbotEnabled = require('../config').enableChatbot !== 'false';
                if (isImage && buffer && chatbotEnabled) {
                    try {
                        const { analyzeImage } = require('./ai');
                        const finalPrompt = text || "ماذا يوجد في هذه الصورة؟ اشرح بالتفصيل باللغة العربية أو الدارجة المغربية.";
                        const replyText = await analyzeImage(buffer, 'image/jpeg', finalPrompt, mediaUrl);
                        if (replyText) {
                            await sendFacebookMessage(senderId, replyText, pageToken);
                            try {
                                const { addToHistory } = require('./ai');
                                await addToHistory('fb:' + senderId, "assistant", replyText);
                            } catch (_) {}
                        }
                    } catch (err) {
                        console.error('[Facebook Media Auto-Reply Error]:', err.message);
                    }
                }
                return; // Stop here, no default fall-through
            }
            // Has command → fall through to execute it with image in context
        }

        try {
            const cmdMatch = isCommand;
            let commandHandled = false;

            // Image Edit / Enhance Auto Routing (matching WhatsApp)
            const nanoKeywords = "nano|edit|adel|3adil|sawb|qad|badel|ghayir|ghayar|tahwil|convert|photoshop|ps|tadil|modify|change|عدل|تعديل|غير|تغيير|بدل|تبديل|صاوب|قاد|تحويل|حول|رد|دير|اضف|أضف|زيد";
            const enhanceKeywords = "hd|enhance|upscale|removebg|bg|background|وضح|تصفية|جودة|وضوح|خلفية|حيد-الخلفية";
            const colorizeKeywords = "colorize|color|لون|تلوين";
            const ghibliKeywords = "ghibli|anime-art|جيبلي|أنمي-فني";
            const allAIPrefixRegex = new RegExp(`^([\\.!])?\\s*(${nanoKeywords}|${enhanceKeywords}|${colorizeKeywords}|${ghibliKeywords})(\\s+.*|$)`, "i");
            const aiMatch = text ? text.match(allAIPrefixRegex) : null;

            if (aiMatch) {
                const prefix = aiMatch[1];
                const keyword = aiMatch[2].toLowerCase();
                const rest = (aiMatch[3] || "").trim();
                
                const context = await getContext('fb:' + senderId);
                const hasRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
                
                if (prefix || isImage || hasRecentImg) {
                    let aiType = "nano";
                    if (new RegExp(`^(${enhanceKeywords})$`, "i").test(keyword)) {
                        aiType = "enhance";
                        if (keyword.includes("bg") || keyword.includes("background") || keyword.includes("خلفية")) aiType = "remove-bg";
                        if (keyword.includes("upscale") || keyword.includes("جودة")) aiType = "upscale";
                    } else if (new RegExp(`^(${colorizeKeywords})$`, "i").test(keyword)) aiType = "colorize";
                    else if (new RegExp(`^(${ghibliKeywords})$`, "i").test(keyword)) aiType = "ghibli";

                    let cmdBuffer = null;
                    if (isImage && mediaUrl) {
                        try {
                            const res = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 20000 });
                            cmdBuffer = Buffer.from(res.data);
                            const { addToHistory } = require('./ai');
                            await addToHistory('fb:' + senderId, "user", text || "[Image]", { buffer: cmdBuffer, mime: 'image/jpeg' });
                        } catch (e) {}
                    } else if (hasRecentImg) {
                        cmdBuffer = context.lastImage.buffer;
                    }

                    try {
                        const editCmd = require('../commands/image/edit');
                        const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                        const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: displayName, body: text };
                        await editCmd(mockSock, senderId, msg, [], { aiType, aiPrompt: rest, buffer: cmdBuffer }, detectLanguage(text));
                        commandHandled = true;
                    } catch (err) {
                        console.error("[Facebook AI Edit Auto-Route Error]:", err.message);
                    }
                }
            }

            if (commandHandled) return;

            // Use unified command map (same as WhatsApp & Telegram)
            const allCmds = ALL_COMMANDS;

            if (cmdMatch) {
                const command = cmdMatch[1].toLowerCase();
                const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);

                if (allCmds[command]) {
                    const jid = 'fb:' + senderId;
                    const rateLimiter = require('./rateLimiter');
                    const limitCheck = await rateLimiter.checkLimit(jid, command);
                    if (!limitCheck.allowed) {
                        const { sendFacebookMessage } = require('./facebook');
                        await sendFacebookMessage(senderId, limitCheck.message, pageToken);
                        commandHandled = true;
                        return;
                    }

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
                    
                    try {
                        await cmdFile(mockSock, senderId, msg, args, { isFacebook: true, command: command, buffer: cmdBuffer }, detectLanguage(text));
                    } catch (cmdErr) {
                        console.error(`[Facebook] Command ${command} Error:`, cmdErr);
                        await db.logError(command, cmdErr.message, 'FB').catch(() => {});
                    }
                    commandHandled = true;
                    await rateLimiter.incrementUsage('fb:' + senderId, command);
                    if (global.trackCommand) global.trackCommand(command, 'facebook');
                }
            }

            // NLC Support — download paths always run, other NLC paths only if not a question
            if (!commandHandled) {
                const nlcKeywords = NLC_KEYWORDS;
                const context = await getContext('fb:' + senderId);
                const hasRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
                const downloadPaths = ['thmil/ig', 'thmil/fb', 'thmil/tiktok', 'thmil/ytdl', 'thmil/twitter', 'thmil/spotify', 'thmil/capcut', 'thmil/apk', 'thmil/gdrive', 'thmil/github'];
                const isQuestion = isQuestionOrInquiry(text);

                for (const [key, path] of Object.entries(nlcKeywords)) {
                    const isDownloadPath = downloadPaths.some(dp => path.startsWith(dp));
                    if (isQuestion && !isDownloadPath) continue;

                    if (hasRecentImg && key.includes("صورة") && (lowerBody.includes("في") || lowerBody.includes("شنو") || lowerBody.includes("اش") || lowerBody.includes("معنى") || lowerBody.includes("وصف") || lowerBody.includes("معايا"))) {
                        continue;
                    }

                    if (new RegExp(`(^|\\s)(${key})(\\s|$)`, "i").test(lowerBody)) {
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
                        } catch (e) {
                            console.error(`[Facebook] NLC ${key.split("|")[0]} Error:`, e);
                            await db.logError(key.split("|")[0], e.message, 'FB').catch(() => {});
                        }
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

            // Auto-download social media links before falling through to AI chat
            if (text && !commandHandled) {
                const mockSockDL = createMockSock(senderId, mediaUrl, pageToken);
                const msgForDL = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: displayName, body: text };
                const downloaded = await handleAutoDownload(text, mockSockDL, senderId, msgForDL, { isFacebook: true });
                if (downloaded) return;
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
                    await db.logError('ai_facebook', `All AI models failed for: ${text.substring(0, 100)}`, 'FB').catch(() => {});
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
                                const jidAI = 'fb:' + senderId;
                                const rateLimiterAI = require('./rateLimiter');
                                const limitCheckAI = await rateLimiterAI.checkLimit(jidAI, command);
                                if (!limitCheckAI.allowed) {
                                    await sendFacebookMessage(senderId, limitCheckAI.message, pageToken);
                                    return;
                                }
                                const cmdFile = require(`../commands/${allCmds[command]}`);
                                const mockSock = createMockSock(senderId, mediaUrl, pageToken);
                                const msg = { key: { remoteJid: senderId, fromMe: false, id: Date.now().toString() }, pushName: displayName, body: text };
                                await cmdFile(mockSock, senderId, msg, args, { isFacebook: true, command: command, buffer: null }, detectLanguage(text));
                                await rateLimiterAI.incrementUsage(jidAI, command);
                                if (global.trackCommand) global.trackCommand(command, 'facebook');
                            } catch (err) {
                                console.error("[Facebook] AI Command Execution Error:", err);
                                await db.logError(command, err.message, 'FB').catch(() => {});
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(chalk.red('[Facebook CMD Error]:'), error.message);
            await db.logError('facebook_handler', error.message, 'FB').catch(() => {});
        }
    } catch (globalError) {
        console.error(chalk.red('[Facebook Global Event Error]:'), globalError.message);
    }
}

module.exports = { handleFacebookMessage, sendFacebookMessage, sendFacebookMedia, saveFbUser, getFbUsers, getFbActiveUsers, fetchFbProfileName };

