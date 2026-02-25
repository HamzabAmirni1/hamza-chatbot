/**
 * .devmsg / .devmsgwa / .devmsgtg / .devmsgfb / .devmsgtous
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
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
}

// ═══ إرسال لفيسبوك ═══
async function sendToFacebook(userId, text) {
    if (!config.fbPageAccessToken) return false;
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`,
            { recipient: { id: userId }, message: { text } },
            { timeout: 10000 }
        );
        return true;
    } catch (e) { return false; }
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
    // WhatsApp
    return config.ownerNumber.includes(id.split("@")[0]);
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;
    const isFacebook = helpers && helpers.isFacebook;

    // ── فحص الصلاحية ──
    if (!isOwner(chatId, msg, isTelegram, isFacebook)) {
        return await sock.sendMessage(chatId, {
            text: "❌ هذا الأمر خاص بالمطور فقط."
        }, { quoted: msg });
    }

    // ── تحديد الأمر المستخدم ──
    const cmd = (helpers && helpers.command) || '';
    let usedCommand = 'all';
    if (cmd === 'devmsgwa') usedCommand = 'wa';
    else if (cmd === 'devmsgtg') usedCommand = 'tg';
    else if (cmd === 'devmsgfb') usedCommand = 'fb';
    else if (cmd === 'devmsgtous' || cmd === 'devmsgall' || cmd === 'devmsg') usedCommand = 'all';
    else {
        // Fallback for cases where command helper is missing
        const rawBody = (msg.body || msg.text || '').trim().toLowerCase();
        if (rawBody.startsWith('.devmsgwa') || rawBody.startsWith('/devmsgwa')) usedCommand = 'wa';
        else if (rawBody.startsWith('.devmsgtg') || rawBody.startsWith('/devmsgtg')) usedCommand = 'tg';
        else if (rawBody.startsWith('.devmsgfb') || rawBody.startsWith('/devmsgfb')) usedCommand = 'fb';
        else usedCommand = 'all';
    }

    // ── الرسالة ──
    const broadcastMsg = args.join(' ').trim();
    if (!broadcastMsg) {
        return await sock.sendMessage(chatId, {
            text: `📢 *أوامر البث المتاحة:*\n\n` +
                `• \`.devmsgwa [رسالة]\` — � واتساب فقط\n` +
                `• \`.devmsgtg [رسالة]\` — ✈️ تلغرام فقط\n` +
                `• \`.devmsgfb [رسالة]\` — 📘 فيسبوك فقط\n` +
                `• \`.devmsgtous [رسالة]\` — 🌍 جميع المنصات\n\n` +
                `� *إحصائيات المستخدمين الحالية:*\n` +
                `📱 واتساب: *${readUsers('users.json').length}* مستخدم\n` +
                `✈️ تلغرام: *${readUsers('tg_users.json').length}* مستخدم\n` +
                `📘 فيسبوك: *${readUsers('fb_users.json').length}* مستخدم`
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

    // ────────────────────────────────────────────
    // WHATSAPP ONLY
    // ────────────────────────────────────────────
    if (usedCommand === 'wa') {
        const users = readUsers('users.json');
        if (users.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '❌ لا يوجد مستخدمون مسجلون على واتساب بعد.'
            }, { quoted: msg });
        }
        await sock.sendMessage(chatId, {
            text: `📱 *بث واتساب...*\n👥 ${users.length} مستخدم`
        }, { quoted: msg });
        const r = await broadcastToWhatsApp(sock, users, messageText);
        return await sock.sendMessage(chatId, {
            text: `✅ *انتهى بث واتساب!*\n\n📱 ✅ ${r.success} | ❌ ${r.fail}`
        }, { quoted: msg });
    }

    // ────────────────────────────────────────────
    // TELEGRAM ONLY
    // ────────────────────────────────────────────
    if (usedCommand === 'tg') {
        const users = readUsers('tg_users.json');
        if (users.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '❌ لا يوجد مستخدمون مسجلون على تلغرام بعد.'
            }, { quoted: msg });
        }
        await sock.sendMessage(chatId, {
            text: `✈️ *بث تلغرام...*\n👥 ${users.length} مستخدم`
        }, { quoted: msg });
        const r = await broadcastToTelegram(users, messageText);
        return await sock.sendMessage(chatId, {
            text: `✅ *انتهى بث تلغرام!*\n\n✈️ ✅ ${r.success} | ❌ ${r.fail}`
        }, { quoted: msg });
    }

    // ────────────────────────────────────────────
    // FACEBOOK ONLY
    // ────────────────────────────────────────────
    if (usedCommand === 'fb') {
        const users = readUsers('fb_users.json');
        if (users.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '❌ لا يوجد مستخدمون مسجلون على فيسبوك بعد.'
            }, { quoted: msg });
        }
        await sock.sendMessage(chatId, {
            text: `📘 *بث فيسبوك...*\n👥 ${users.length} مستخدم`
        }, { quoted: msg });
        let success = 0, fail = 0;
        for (const userId of users) {
            const ok = await sendToFacebook(userId, broadcastMsg);
            if (ok) success++; else fail++;
            await new Promise(r => setTimeout(r, 500));
        }
        return await sock.sendMessage(chatId, {
            text: `✅ *انتهى بث فيسبوك!*\n\n📘 ✅ ${success} | ❌ ${fail}`
        }, { quoted: msg });
    }

    // ────────────────────────────────────────────
    // ALL PLATFORMS
    // ────────────────────────────────────────────
    const waUsers = readUsers('users.json');
    const tgUsers = readUsers('tg_users.json');
    const fbUsers = readUsers('fb_users.json');
    const total = waUsers.length + tgUsers.length + fbUsers.length;

    if (total === 0) {
        return await sock.sendMessage(chatId, {
            text: `❌ *لا يوجد مستخدمون مسجلون على أي منصة بعد.*\n\n💡 سيتم حفظهم تلقائياً عند استخدامهم البوت.`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, {
        text: `🌍 *بدأ البث الجماعي لجميع المنصات...*\n\n` +
            `📱 واتساب: *${waUsers.length}*\n` +
            `✈️ تلغرام: *${tgUsers.length}*\n` +
            `📘 فيسبوك: *${fbUsers.length}*\n` +
            `👥 الإجمالي: *${total}*`
    }, { quoted: msg });

    // Broadcast in parallel per platform
    const [waR, tgR] = await Promise.all([
        broadcastToWhatsApp(sock, waUsers, messageText),
        broadcastToTelegram(tgUsers, messageText)
    ]);

    let fbSuccess = 0, fbFail = 0;
    for (const userId of fbUsers) {
        const ok = await sendToFacebook(userId, broadcastMsg);
        if (ok) fbSuccess++; else fbFail++;
        await new Promise(r => setTimeout(r, 500));
    }

    const grandSuccess = waR.success + tgR.success + fbSuccess;
    const grandFail = waR.fail + tgR.fail + fbFail;

    await sock.sendMessage(chatId, {
        text: `✅ *اكتمل البث الجماعي!*\n\n` +
            `📱 *واتساب:* ✅ ${waR.success} | ❌ ${waR.fail}\n` +
            `✈️ *تلغرام:* ✅ ${tgR.success} | ❌ ${tgR.fail}\n` +
            `📘 *فيسبوك:* ✅ ${fbSuccess} | ❌ ${fbFail}\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `🏆 *الإجمالي:* ✅ ${grandSuccess} | ❌ ${grandFail}`
    }, { quoted: msg });
};
