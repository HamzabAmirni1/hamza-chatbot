const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const senderNum = chatId.split("@")[0];

    // Check if owner
    if (!config.ownerNumber.includes(senderNum)) {
        return await sock.sendMessage(chatId, { text: "❌ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
    }

    const sub = (args[0] || "").toLowerCase();

    if (!sub || (sub !== "on" && sub !== "off" && sub !== "status")) {
        return await sock.sendMessage(chatId, {
            text: `📰 *النشر التلقائي للأخبار - Autonews*

الأوامر:
• .autonews on  - تفعيل نشر الأخبار التلقائي
• .autonews off - إيقاف نشر الأخبار التلقائي
• .autonews status - عرض الحالة الحالية`
        }, { quoted: msg });
    }

    const configPath = path.join(__dirname, '../../config.js');
    let src = fs.readFileSync(configPath, 'utf-8');

    if (sub === "status") {
        const isEnabled = config.enableNewsAutoPoster === 'true';
        return await sock.sendMessage(chatId, {
            text: `📰 *حالة نشر الأخبار التلقائي*

الحالة الحالية: ${isEnabled ? "✅ *مفعّل*" : "⚠️ *معطّل*"}
${isEnabled ? "📢 البوت ينشر الأخبار و GitHub Trending تلقائياً كل 3/12 ساعة." : "⚠️ البوت لن ينشر الأخبار تلقائياً."}`
        }, { quoted: msg });
    }

    const enable = sub === "on";
    const val = enable ? 'true' : 'false';

    // Replace in config.js
    src = src.replace(/(enableNewsAutoPoster\s*:\s*)(['"])(.*?)(['"])/, `$1$2${val}$4`);
    fs.writeFileSync(configPath, src, 'utf-8');

    // Update loaded config object
    config.enableNewsAutoPoster = val;

    await sock.sendMessage(chatId, {
        text: `📰 *نظام نشر الأخبار التلقائي*

${enable ? "✅ تم التفعيل بنجاح! سيبدأ البوت بنشر الأخبار تلقائياً." : "⚠️ تم إيقاف النشر التلقائي للأخبار بنجاح."}

الحالة الحالية: ${enable ? "*مفعّل* ✅" : "*معطّل* ⚠️"}`
    }, { quoted: msg });
};
