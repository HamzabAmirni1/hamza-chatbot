const axios = require('axios');
const { t } = require('../../lib/language');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const url = args[0];
        if (!url) return sock.sendMessage(chatId, { text: "المرجو وضع رابط إنستغرام." }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '⌛', key: msg.key } });

        const apis = [
            `https://api.siputzx.my.id/api/d/instagram?url=${encodeURIComponent(url)}`,
            `https://api.vreden.web.id/api/instagram?url=${encodeURIComponent(url)}`,
            `https://api.yupra.my.id/api/downloader/instagram?url=${encodeURIComponent(url)}`
        ];

        let downloadUrl = null;
        for (const api of apis) {
            try {
                const res = await axios.get(api);
                const data = res.data;
                if (data.status && (data.data?.[0]?.url || data.result?.[0]?.url || data.data?.url || data.result?.url)) {
                    const result = data.data || data.result;
                    downloadUrl = Array.isArray(result) ? result[0].url : (result.url || result);
                    break;
                }
            } catch (e) { }
        }

        if (!downloadUrl) throw new Error("Failed to download Instagram content.");

        await sock.sendMessage(chatId, {
            video: { url: downloadUrl },
            caption: `✅ *Instagram Download*\n\n⚔️ ${settings.botName}`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
