const { getStats } = require('../../lib/trafficBooster');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    // Only bot owner can use this (or you can remove this check if you want anyone to use it)
    const sender = msg.key.worker ? msg.key.remoteJid : chatId;
    const isOwner = config.ownerNumber.some(owner => sender.includes(owner.replace(/[^0-9]/g, '')));

    // Optionally remove this check if you want to allow everyone
    if (!isOwner) {
        return await sock.sendMessage(chatId, { text: "❌ هذا الأمر مخصص للمالك فقط." }, { quoted: msg });
    }

    try {
        const stats = getStats();

        const message = `📊 *إحصائيات Traffic Booster v4.0* 📊\n\n` +
            `🌐 *الزيارات الناجحة للموقع:* ${stats.visits}\n` +
            `💰 *الإعلانات المكتملة (Monetag):* ${stats.impressions}\n\n` +
            `🟢 البوت شغال ومستمر في جلب الزيارات شرعيا!`;

        await sock.sendMessage(chatId, { text: message }, { quoted: msg });
    } catch (e) {
        console.error("Traffic Command Error:", e);
        await sock.sendMessage(chatId, { text: `❌ تعذر الحصول على الإحصائيات: ${e.message}` }, { quoted: msg });
    }
};
