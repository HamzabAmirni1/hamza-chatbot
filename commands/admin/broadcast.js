/**
 * .devmsg / .broadcast
 * يبعث رسالة لجميع المستخدمين على WhatsApp + Telegram + Facebook
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('../../config');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// ═══ Read users from platform DB ═══
function readUsers(filename) {
    const dbPath = path.join(DATA_DIR, filename);
    try {
        if (!fs.existsSync(dbPath)) return [];
        const raw = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

// ═══ Send to Facebook via Graph API ═══
async function sendToFacebook(userId, text) {
    if (!config.fbPageAccessToken) return false;
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`,
            { recipient: { id: userId }, message: { text } },
            { timeout: 10000 }
        );
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;

    // ═══ Permission Check ═══
    if (isTelegram) {
        const senderUsername = (msg.from && msg.from.username) ? msg.from.username.toLowerCase() : '';
        const senderId = chatId.toString();
        const isOwner = senderUsername === 'hamzaamirni' ||
            config.ownerNumber.some(n => senderId.includes(n));
        if (!isOwner) {
            return await sock.sendMessage(chatId, { text: "❌ هذا الأمر خاص بالمطور فقط." });
        }
    } else {
        const senderNum = chatId.split("@")[0];
        if (!config.ownerNumber.includes(senderNum)) {
            return await sock.sendMessage(chatId, { text: "❌ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
        }
    }

    // ═══ Usage Check ═══
    const broadcastMsg = args.join(" ").trim();
    if (!broadcastMsg) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة:* \`.devmsg [الرسالة]\`\n\n*مثال:* \`.devmsg تم تحديث البوت! جرب الميزات الجديدة 🚀\``
        }, { quoted: msg });
    }

    // ═══ Load All Users ═══
    fs.ensureDirSync(DATA_DIR);
    const waUsers = readUsers('users.json');
    const tgUsers = readUsers('tg_users.json');
    const fbUsers = readUsers('fb_users.json');
    const total = waUsers.length + tgUsers.length + fbUsers.length;

    if (total === 0) {
        return await sock.sendMessage(chatId, {
            text: `❌ *قائمة المستخدمين فارغة*\n\n💡 سيتم حفظ المستخدمين تلقائياً عند استخدامهم البوت.`
        }, { quoted: msg });
    }

    // ═══ Start Broadcast ═══
    await sock.sendMessage(chatId, {
        text: `📢 *بدأ البث الجماعي...*\n\n` +
            `📱 واتساب: *${waUsers.length}* مستخدم\n` +
            `✈️ تلكرام: *${tgUsers.length}* مستخدم\n` +
            `📘 فيسبوك: *${fbUsers.length}* مستخدم\n` +
            `👥 الإجمالي: *${total}* مستخدم`
    }, { quoted: msg });

    const messageText =
        `╔═══════════════════════╗\n` +
        `║   📢 رسالة من مطور البوت\n` +
        `╚═══════════════════════╝\n\n` +
        `${broadcastMsg}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚔️ *${config.botName}*`;

    let waSuccess = 0, waFail = 0;
    let tgSuccess = 0, tgFail = 0;
    let fbSuccess = 0, fbFail = 0;

    // ─── WhatsApp ───
    for (const userId of waUsers) {
        try {
            await sock.sendMessage(userId, { text: messageText });
            waSuccess++;
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            waFail++;
        }
    }

    // ─── Telegram ───
    // If called from Telegram, sock already has sendMessage for Telegram
    // If called from WhatsApp, we need a Telegram bot instance
    // We'll use a shared Telegram sender from config
    if (tgUsers.length > 0 && config.telegramToken) {
        try {
            const TelegramBot = require('node-telegram-bot-api');
            const tgBot = new TelegramBot(config.telegramToken);
            for (const userId of tgUsers) {
                try {
                    await tgBot.sendMessage(userId, messageText, { parse_mode: 'Markdown' });
                    tgSuccess++;
                    await new Promise(r => setTimeout(r, 800));
                } catch (e) {
                    tgFail++;
                }
            }
        } catch (e) {
            console.error('[devmsg] Telegram error:', e.message);
            tgFail = tgUsers.length;
        }
    }

    // ─── Facebook ───
    for (const userId of fbUsers) {
        const ok = await sendToFacebook(userId, broadcastMsg);
        if (ok) fbSuccess++; else fbFail++;
        await new Promise(r => setTimeout(r, 500));
    }

    // ═══ Send Summary ═══
    await sock.sendMessage(chatId, {
        text: `✅ *اكتمل البث الجماعي!*\n\n` +
            `📱 *واتساب:* ✅ ${waSuccess} | ❌ ${waFail}\n` +
            `✈️ *تلكرام:* ✅ ${tgSuccess} | ❌ ${tgFail}\n` +
            `📘 *فيسبوك:* ✅ ${fbSuccess} | ❌ ${fbFail}\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `👥 *الإجمالي:* ${waSuccess + tgSuccess + fbSuccess} نجح، ${waFail + tgFail + fbFail} فشل`
    }, { quoted: msg });
};
