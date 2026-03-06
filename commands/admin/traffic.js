const { getStats, stopTraffic, startTraffic, isRunning } = require('../../lib/trafficBooster');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const sender = msg.key.remoteJid || chatId;
    const isOwner = config.ownerNumber.some(owner => sender.includes(owner.replace(/[^0-9]/g, '')));

    if (!isOwner) {
        return await sock.sendMessage(chatId, { text: '❌ هذا الأمر مخصص للمالك فقط.' }, { quoted: msg });
    }

    const action = (args[0] || '').toLowerCase();

    try {
        if (action === 'off') {
            stopTraffic();
            return await sock.sendMessage(chatId, {
                text: '🔴 *Traffic Booster — إيقاف*\n\nتم إيقاف الزيارات التلقائية. استخدم *.traffic on* لإعادة التشغيل.'
            }, { quoted: msg });
        }

        if (action === 'on') {
            startTraffic();
            return await sock.sendMessage(chatId, {
                text: '🟢 *Traffic Booster — تشغيل*\n\nتم استئناف الزيارات التلقائية. ✅'
            }, { quoted: msg });
        }

        // Default: show stats
        const stats = getStats();
        const status = isRunning() ? '🟢 شغال' : '🔴 موقوف';

        await sock.sendMessage(chatId, {
            text: `📊 *Traffic Booster v8.0*\n\n` +
                `الحالة: ${status}\n` +
                `🌍 *الزيارات:* ${stats.visits.toLocaleString()}\n` +
                `💰 *Ad Impressions:* ${stats.impressions.toLocaleString()}\n\n` +
                `📌 الأوامر:\n` +
                `• *.traffic on* — تشغيل\n` +
                `• *.traffic off* — إيقاف`
        }, { quoted: msg });

    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ خطأ: ${e.message}` }, { quoted: msg });
    }
};
