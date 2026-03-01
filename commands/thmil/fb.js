const axios = require('axios');
const { t } = require('../../lib/language');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const url = args[0];
        if (!url) return sock.sendMessage(chatId, { text: t('fb.usage', {}, userLang) }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '⌛', key: msg.key } });

        const apis = [
            `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`,
            `https://api.vreden.web.id/api/facebook?url=${encodeURIComponent(url)}`,
            `https://api.yupra.my.id/api/downloader/facebook?url=${encodeURIComponent(url)}`
        ];

        let downloadUrl = null;
        for (const api of apis) {
            try {
                const res = await axios.get(api);
                if (res.data?.status && (res.data.data?.url || res.data.result?.url)) {
                    downloadUrl = res.data.data?.url || res.data.result?.url;
                    break;
                }
            } catch (e) { }
        }

        if (!downloadUrl) throw new Error("Failed to download Facebook video.");

        await sock.sendMessage(chatId, {
            video: { url: downloadUrl },
            caption: `✅ *Facebook Download*\n\n⚔️ ${settings.botName}`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
