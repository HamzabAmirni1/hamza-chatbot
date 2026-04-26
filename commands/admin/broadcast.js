/**
 * .devmsg / .devmsgwa / .devmsgtg / .devmsgfb / .devmsgig / .devmsgtous
 * بث رسالة المطور — كل منصة بوحدها أو جميعهم دفعة واحدة
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('../../config');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// ═══ قراءة المستخدمين ═══
function readUsers(filename) {
    const dbPath = path.join(DATA_DIR, filename);
    try {
        if (!fs.existsSync(dbPath)) return [];
        const raw = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Support both array of strings and array of objects {id, pageId}
        return parsed.map(u => typeof u === 'object' ? u.id : u).filter(Boolean);
    } catch (e) { return []; }
}

// ═══ إرسال لفيسبوك ═══
async function sendToFacebook(userId, text) {
    if (!config.fbPageAccessToken) return false;
    try {
        const chunks = text.match(/[\s\S]{1,1900}/g) || [""];
        for (const chunk of chunks) {
            await axios.post(
                `https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`,
                { recipient: { id: userId }, message: { text: chunk } },
                { timeout: 10000 }
            );
            if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
        }
        return true;
    } catch (e) { return false; }
}

// ═══ إرسال لإنستغرام (Instagram Graph API) ═══
async function sendToInstagram(igUserId, text) {
    // Instagram uses the same Page access token, same /me/messages endpoint
    // Requires: instagram_basic, instagram_manage_messages permissions
    const token = config.fbPageAccessToken;
    if (!token) return false;
    try {
        const chunks = text.match(/[\s\S]{1,900}/g) || [""]; // IG limit is lower
        for (const chunk of chunks) {
            await axios.post(
                `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
                {
                    recipient: { id: igUserId },
                    message: { text: chunk },
                    messaging_type: "MESSAGE_TAG",
                    tag: "ACCOUNT_UPDATE"
                },
                { timeout: 10000 }
            );
            if (chunks.length > 1) await new Promise(r => setTimeout(r, 600));
        }
        return true;
    } catch (e) {
        if (e.response?.data?.error) {
            console.error(`[IG Broadcast] Error for ${igUserId}:`, e.response.data.error.message);
        }
        return false;
    }
}

// ═══ إرسال لتلغرام ═══
async function broadcastToTelegram(users, text) {
    let success = 0, fail = 0;
    if (!config.telegramToken || users.length === 0) return { success, fail };
    try {
        const TelegramBot = require('node-telegram-bot-api');
        const tgBot = new TelegramBot(config.telegramToken);
        for (const userId of users) {
            try {
                await tgBot.sendMessage(userId, text, { parse_mode: 'Markdown' });
                success++;
                await new Promise(r => setTimeout(r, 800));
            } catch (e) { fail++; }
        }
    } catch (e) { fail = users.length; }
    return { success, fail };
}

// ═══ إرسال لواتساب ═══
async function broadcastToWhatsApp(sock, users, text) {
    let success = 0, fail = 0;
    for (const userId of users) {
        try {
            await sock.sendMessage(userId, { text });
            success++;
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) { fail++; }
    }
    return { success, fail };
}

// ═══ فحص صلاحية المطور ═══
function isOwner(chatId, msg, isTelegram, isFacebook) {
    const id = chatId.toString();
    if (isTelegram) {
        const username = (msg.from && msg.from.username) ? msg.from.username.toLowerCase() : '';
        return username === 'hamzaamirni' || config.ownerNumber.some(n => id.includes(n));
    }
    if (isFacebook) {
        return config.ownerNumber.includes(id);
    }
    return config.ownerNumber.includes(id.split("@")[0]);
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;
    const isFacebook = helpers && helpers.isFacebook;

    if (!isOwner(chatId, msg, isTelegram, isFacebook)) {
        return await sock.sendMessage(chatId, { text: "❌ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
    }

    // ── تحديد المنصة المستهدفة ──
    const cmd = (helpers && helpers.command) || '';
    let usedCommand = 'all';
    if (cmd === 'devmsgwa') usedCommand = 'wa';
    else if (cmd === 'devmsgtg') usedCommand = 'tg';
    else if (cmd === 'devmsgfb') usedCommand = 'fb';
    else if (cmd === 'devmsgig') usedCommand = 'ig';
    else if (cmd === 'devmsgtous' || cmd === 'devmsgall' || cmd === 'devmsg') usedCommand = 'all';
    else {
        const rawBody = (msg.body || msg.text || '').trim().toLowerCase();
        if (rawBody.startsWith('.devmsgwa')) usedCommand = 'wa';
        else if (rawBody.startsWith('.devmsgtg')) usedCommand = 'tg';
        else if (rawBody.startsWith('.devmsgfb')) usedCommand = 'fb';
        else if (rawBody.startsWith('.devmsgig')) usedCommand = 'ig';
        else usedCommand = 'all';
    }

    const broadcastMsg = args.join(' ').trim();

    const waCount = readUsers('users.json').length;
    const tgCount = readUsers('tg_users.json').length;
    const fbCount = readUsers('fb_users.json').length;
    const igCount = readUsers('ig_users.json').length;

    if (!broadcastMsg) {
        return await sock.sendMessage(chatId, {
            text: `📢 *أوامر البث المتاحة:*\n\n` +
                `• \`.devmsgwa [رسالة]\` — 📱 واتساب فقط\n` +
                `• \`.devmsgtg [رسالة]\` — ✈️ تلغرام فقط\n` +
                `• \`.devmsgfb [رسالة]\` — 📘 فيسبوك فقط\n` +
                `• \`.devmsgig [رسالة]\` — 📸 إنستغرام فقط\n` +
                `• \`.devmsgtous [رسالة]\` — 🌍 جميع المنصات\n\n` +
                `📊 *إحصائيات المستخدمين:*\n` +
                `📱 واتساب: *${waCount}* مستخدم\n` +
                `✈️ تلغرام: *${tgCount}* مستخدم\n` +
                `📘 فيسبوك: *${fbCount}* مستخدم\n` +
                `📸 إنستغرام: *${igCount}* مستخدم\n` +
                `👥 *الإجمالي: ${waCount + tgCount + fbCount + igCount}*`
        }, { quoted: msg });
    }

    const messageText =
        `╔═══════════════════════╗\n` +
        `║   📢 رسالة من مطور البوت\n` +
        `╚═══════════════════════╝\n\n` +
        `${broadcastMsg}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚔️ *${config.botName}*`;

    fs.ensureDirSync(DATA_DIR);

    if (usedCommand === 'wa') {
        const users = readUsers('users.json');
        if (!users.length) return sock.sendMessage(chatId, { text: '❌ لا يوجد مستخدمون على واتساب.' }, { quoted: msg });
        await sock.sendMessage(chatId, { text: `📱 *بث واتساب...*\n👥 ${users.length} مستخدم` }, { quoted: msg });
        const r = await broadcastToWhatsApp(sock, users, messageText);
        return sock.sendMessage(chatId, { text: `✅ *انتهى بث واتساب!*\n📱 ✅ ${r.success} | ❌ ${r.fail}` }, { quoted: msg });
    }

    if (usedCommand === 'tg') {
        const users = readUsers('tg_users.json');
        if (!users.length) return sock.sendMessage(chatId, { text: '❌ لا يوجد مستخدمون على تلغرام.' }, { quoted: msg });
        await sock.sendMessage(chatId, { text: `✈️ *بث تلغرام...*\n👥 ${users.length} مستخدم` }, { quoted: msg });
        const r = await broadcastToTelegram(users, messageText);
        return sock.sendMessage(chatId, { text: `✅ *انتهى بث تلغرام!*\n✈️ ✅ ${r.success} | ❌ ${r.fail}` }, { quoted: msg });
    }

    if (usedCommand === 'fb') {
        const users = readUsers('fb_users.json');
        if (!users.length) return sock.sendMessage(chatId, { text: '❌ لا يوجد مستخدمون على فيسبوك.' }, { quoted: msg });
        await sock.sendMessage(chatId, { text: `📘 *بث فيسبوك...*\n👥 ${users.length} مستخدم` }, { quoted: msg });
        let success = 0, fail = 0;
        for (const u of users) { if (await sendToFacebook(u, messageText)) success++; else fail++; await new Promise(r => setTimeout(r, 500)); }
        return sock.sendMessage(chatId, { text: `✅ *انتهى بث فيسبوك!*\n📘 ✅ ${success} | ❌ ${fail}` }, { quoted: msg });
    }

    if (usedCommand === 'ig') {
        const users = readUsers('ig_users.json');
        if (!users.length) return sock.sendMessage(chatId, { text: '❌ لا يوجد مستخدمون على إنستغرام.' }, { quoted: msg });
        await sock.sendMessage(chatId, { text: `📸 *بث إنستغرام...*\n👥 ${users.length} مستخدم` }, { quoted: msg });
        let success = 0, fail = 0;
        for (const u of users) { if (await sendToInstagram(u, messageText)) success++; else fail++; await new Promise(r => setTimeout(r, 800)); }
        return sock.sendMessage(chatId, { text: `✅ *انتهى بث إنستغرام!*\n📸 ✅ ${success} | ❌ ${fail}` }, { quoted: msg });
    }

    // ── ALL PLATFORMS ──
    const waUsers = readUsers('users.json');
    const tgUsers = readUsers('tg_users.json');
    const fbUsers = readUsers('fb_users.json');
    const igUsers = readUsers('ig_users.json');
    const total = waUsers.length + tgUsers.length + fbUsers.length + igUsers.length;

    if (!total) return sock.sendMessage(chatId, { text: '❌ لا يوجد مستخدمون مسجلون على أي منصة بعد.' }, { quoted: msg });

    await sock.sendMessage(chatId, {
        text: `🌍 *بدأ البث الجماعي...*\n📱 ${waUsers.length} | ✈️ ${tgUsers.length} | 📘 ${fbUsers.length} | 📸 ${igUsers.length}\n👥 الإجمالي: *${total}*`
    }, { quoted: msg });

    const [waR, tgR] = await Promise.all([
        broadcastToWhatsApp(sock, waUsers, messageText),
        broadcastToTelegram(tgUsers, messageText)
    ]);

    let fbS = 0, fbF = 0;
    for (const u of fbUsers) { if (await sendToFacebook(u, messageText)) fbS++; else fbF++; await new Promise(r => setTimeout(r, 500)); }

    let igS = 0, igF = 0;
    for (const u of igUsers) { if (await sendToInstagram(u, messageText)) igS++; else igF++; await new Promise(r => setTimeout(r, 800)); }

    await sock.sendMessage(chatId, {
        text: `✅ *اكتمل البث الجماعي!*\n\n` +
            `📱 *واتساب:* ✅ ${waR.success} | ❌ ${waR.fail}\n` +
            `✈️ *تلغرام:* ✅ ${tgR.success} | ❌ ${tgR.fail}\n` +
            `📘 *فيسبوك:* ✅ ${fbS} | ❌ ${fbF}\n` +
            `📸 *إنستغرام:* ✅ ${igS} | ❌ ${igF}\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `🏆 *الإجمالي:* ✅ ${waR.success + tgR.success + fbS + igS} | ❌ ${waR.fail + tgR.fail + fbF + igF}`
    }, { quoted: msg });
};
