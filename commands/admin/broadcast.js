const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;

    // ═══ Permission Check ═══
    if (isTelegram) {
        const senderUsername = (msg.from && msg.from.username) ? msg.from.username.toLowerCase() : '';
        const senderId = chatId.toString();
        const isOwner = senderUsername === 'hamzaamirni' ||
            config.ownerNumber.some(n => senderId.includes(n));
        if (!isOwner) {
            return await sock.sendMessage(chatId, {
                text: "❌ هذا الأمر خاص بالمطور فقط."
            });
        }
    } else {
        const senderNum = chatId.split("@")[0];
        if (!config.ownerNumber.includes(senderNum)) {
            return await sock.sendMessage(chatId, {
                text: "❌ هذا الأمر خاص بالمطور فقط."
            }, { quoted: msg });
        }
    }

    const broadcastMsg = args.join(" ").trim();
    if (!broadcastMsg) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة:* \`.devmsg [الرسالة]\`\n\n*مثال:* \`.devmsg السلام عليكم، تم تحديث البوت!\``,
        }, { quoted: msg });
    }

    // ═══ Load User Database ═══
    const dbName = isTelegram ? "tg_users.json" : "users.json";
    const dataPath = path.join(__dirname, "..", "..", "data", dbName);

    // Create the file if it doesn't exist yet
    if (!fs.existsSync(dataPath)) {
        fs.ensureDirSync(path.dirname(dataPath));
        // For Telegram, add current user as first entry
        const initialData = isTelegram ? [chatId.toString()] : [];
        fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2));
    }

    let users = [];
    try {
        const raw = fs.readFileSync(dataPath, 'utf8');
        users = JSON.parse(raw);
        if (!Array.isArray(users)) users = [];
    } catch (e) {
        users = isTelegram ? [chatId.toString()] : [];
    }

    if (users.length === 0) {
        return await sock.sendMessage(chatId, {
            text: `❌ قائمة المستخدمين فارغة حالياً.\n\n💡 سيتم حفظ المستخدمين تلقائياً عند استخدامهم للبوت.`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, {
        text: `📢 *جاري البث لـ ${users.length} مستخدم على ${isTelegram ? "تلكرام" : "واتساب"}...*`
    }, { quoted: msg });

    const messageContent = `╔═══════════════════════╗
║   📢 رسالة من مطور البوت
╚═══════════════════════╝

${broadcastMsg}

━━━━━━━━━━━━━━━━━━━━━━
⚔️ *${config.botName}*`;

    let success = 0;
    let fail = 0;

    for (const userId of users) {
        try {
            await sock.sendMessage(userId, { text: messageContent });
            success++;
            await new Promise(res => setTimeout(res, isTelegram ? 800 : 2000));
        } catch (err) {
            console.error(`[devmsg] Failed to send to ${userId}:`, err.message);
            fail++;
        }
    }

    await sock.sendMessage(chatId, {
        text: `✅ *اكتمل البث!*\n\n🚀 نجح: *${success}*\n❌ فشل: *${fail}*\n👥 الإجمالي: *${users.length}*`
    }, { quoted: msg });
};
