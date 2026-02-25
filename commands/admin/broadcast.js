const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;

    // Check permission
    if (isTelegram) {
        // Simple check for Telegram: if it's from the known developer username 'hamzaamirni' or a specific ID
        const senderUsername = msg.from.username;
        if (senderUsername !== 'hamzaamirni' && !config.ownerNumber.includes(chatId)) {
            return await sock.sendMessage(chatId, { text: "❌ هذا الأمر خاص بالمطور فقط على تلكرام." });
        }
    } else {
        const senderNum = chatId.split("@")[0];
        if (!config.ownerNumber.includes(senderNum)) {
            return await sock.sendMessage(chatId, { text: "❌ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
        }
    }

    const broadcastMsg = args.join(" ").trim();
    if (!broadcastMsg) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة:* .devmsg [الرسالة]\n\n*مثال:* .devmsg السلام عليكم، تم تحديث البوت!`,
        }, { quoted: msg });
    }

    // Determine target database based on platform
    const dbName = isTelegram ? "tg_users.json" : "users.json";
    const dataPath = path.join(__dirname, "..", "..", "data", dbName);

    if (!fs.existsSync(dataPath)) {
        return await sock.sendMessage(chatId, { text: `❌ لم يتم العثور على قاعدة بيانات ${isTelegram ? "تلكرام" : "واتساب"}.` }, { quoted: msg });
    }

    let users = [];
    try {
        users = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch (e) {
        return await sock.sendMessage(chatId, { text: "❌ فشل قراءة قائمة المستخدمين." }, { quoted: msg });
    }

    if (users.length === 0) {
        return await sock.sendMessage(chatId, { text: "❌ قائمة المستخدمين فارغة." }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { text: `⏳ جاري البدء ببث الرسالة لـ *${users.length}* مستخدم على ${isTelegram ? "تلكرام" : "واتساب"}...` }, { quoted: msg });

    let success = 0;
    let fail = 0;

    for (const userId of users) {
        try {
            await sock.sendMessage(userId, {
                text: `╔═══════════════════════════════════╗\n║    📢 رسالة من مطور البوت\n╚═══════════════════════════════════╝\n\n${broadcastMsg}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚔️ ${config.botName}\n📢 ${config.officialChannel}`,
            });
            success++;
            // Longer delay for Telegram to avoid flood wait
            await new Promise((res) => setTimeout(res, isTelegram ? 1000 : 2000));
        } catch (err) {
            console.error(`Failed to send to ${userId}:`, err.message);
            fail++;
        }
    }

    await sock.sendMessage(chatId, {
        text: `✅ *اكتمل البث الجماعي!*\n\n🚀 نجح: ${success}\n❌ فشل: ${fail}\n👥 الإجمالي: ${users.length}`,
    }, { quoted: msg });
};
