const config = require('../../config');
const { sendWithChannelButton } = require('../lib/utils');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const { readAntiCallState, writeAntiCallState } = helpers;
    const senderNum = chatId.split("@")[0];

    if (!config.ownerNumber.includes(senderNum)) {
        return await sock.sendMessage(chatId, { text: "❌ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
    }

    const sub = (args[0] || "").toLowerCase();
    const state = readAntiCallState();

    if (!sub || (sub !== "on" && sub !== "off" && sub !== "status")) {
        return await sendWithChannelButton(
            sock,
            chatId,
            `📵 *نظام منع المكالمات - ANTICALL*
        
الحالة الافتراضية: *مفعّل دائماً* ✅

الأوامر:
• .anticall on  - تفعيل حظر المكالمات
• .anticall off - إيقاف الحظر مؤقتاً
• .anticall status - عرض الحالة الحالية

ملاحظة: النظام مفعل تلقائياً لحماية البوت

⚔️ bot hamza amirni`,
            msg,
        );
    }

    if (sub === "status") {
        const statusMsg = `📵 *حالة نظام منع المكالمات*

الحالة الحالية: ${state.enabled ? "✅ *مفعّل*" : "⚠️ *معطّل*"}

${state.enabled ? "🛡️ البوت محمي من المكالمات المزعجة" : "⚠️ تحذير: البوت غير محمي من المكالمات"}

⚔️ bot hamza amirni`;
        return await sendWithChannelButton(sock, chatId, statusMsg, msg);
    }

    const enable = sub === "on";
    writeAntiCallState(enable);
    const responseMsg = `📵 *نظام منع المكالمات*

${enable ? "✅ تم التفعيل بنجاح!" : "⚠️ تم الإيقاف مؤقتاً"}

الحالة: ${enable ? "*مفعّل* 🛡️" : "*معطّل* ⚠️"}

⚔️ bot hamza amirni`;
    await sendWithChannelButton(sock, chatId, responseMsg, msg);
};
