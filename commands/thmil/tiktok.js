const axios = require('axios');
const { t } = require('../../lib/language');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const url = args[0];
        if (!url) return sock.sendMessage(chatId, { text: "المرجو وضع رابط تيك توك." }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '⌛', key: msg.key } });

        const apis = [
            `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`,
            `https://api.vreden.web.id/api/tiktok?url=${encodeURIComponent(url)}`,
            `https://api.yupra.my.id/api/downloader/tiktok?url=${encodeURIComponent(url)}`
        ];

        let downloadUrl = null;
        for (const api of apis) {
            try {
                const res = await axios.get(api);
                const data = res.data;
                if (data.status && (data.data?.video || data.result?.video || data.data?.no_watermark || data.result?.no_watermark)) {
                    downloadUrl = data.data?.video || data.result?.video || data.data?.no_watermark || data.result?.no_watermark;
                    break;
                }
            } catch (e) { }
        }

        if (!downloadUrl) throw new Error("Failed to download TikTok video.");

        await sock.sendMessage(chatId, {
            video: { url: downloadUrl },
            caption: `✅ *TikTok Download*\n\n⚔️ ${settings.botName}`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
