const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const senderNum = chatId.split("@")[0];
    if (!config.ownerNumber.includes(senderNum)) {
        return await sock.sendMessage(chatId, { text: "❌ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
    }

    const broadcastMsg = args.join(" ").trim();
    if (!broadcastMsg) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة:* .devmsg [الرسالة]\n\n*مثال:* .devmsg السلام عليكم، تم تحديث البوت!`,
        }, { quoted: msg });
    }

    const dataPath = path.join(__dirname, "..", "..", "data", "users.json");
    if (!fs.existsSync(dataPath)) {
        return await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على مستخدمين لمراسلتهم." }, { quoted: msg });
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

    await sock.sendMessage(chatId, { text: `⏳ جاري البدء ببث الرسالة لـ *${users.length}* مستخدم...` }, { quoted: msg });

    let success = 0;
    let fail = 0;

    for (const userId of users) {
        try {
            if (userId.includes(senderNum)) continue; // Skip owner
            await sock.sendMessage(userId, {
                text: `╔═══════════════════════════════════╗\n║    📢 رسالة من مطور البوت\n╚═══════════════════════════════════╝\n\n${broadcastMsg}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚔️ ${config.botName}\n📢 ${config.officialChannel}`,
            });
            success++;
            await new Promise((res) => setTimeout(res, 2000));
        } catch (err) {
            console.error(`Failed to send to ${userId}:`, err.message);
            fail++;
        }
    }

    await sock.sendMessage(chatId, {
        text: `✅ *اكتمل البث الجماعي!*\n\n🚀 نجح: ${success}\n❌ فشل: ${fail}\n👥 الإجمالي: ${users.length}`,
    }, { quoted: msg });
};
