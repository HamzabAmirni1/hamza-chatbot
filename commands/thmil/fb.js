const axios = require('axios');
const settings = require('../settings');
const { t } = require('../lib/language');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const fbUrl = args[0];

    if (!fbUrl || !fbUrl.match(/(https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch|fb\.com)\/[^\s]+)/i)) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.fb [رابط الفيديو]\n\n*مثال:* .fb https://www.facebook.com/watch/?v=xxx`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🔄", key: msg.key } });

    try {
        // Try Primary API
        const apiUrl = `https://api.hanggts.xyz/download/facebook?url=${encodeURIComponent(fbUrl)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });
        let fbvid = null;
        if (response.data && (response.data.status === true || response.data.result)) {
            fbvid = response.data.result.media?.video_hd ||
                response.data.result.media?.video_sd ||
                response.data.result.url ||
                response.data.result.download;
        }

        if (!fbvid) {
            // Try Fallback (Ryzendesu)
            const vUrl = `https://api.ryzendesu.vip/api/downloader/fb?url=${encodeURIComponent(fbUrl)}`;
            const vRes = await axios.get(vUrl, { timeout: 15000 });
            if (vRes.data && vRes.data.url) {
                fbvid = Array.isArray(vRes.data.url)
                    ? vRes.data.url.find((v) => v.quality === "hd")?.url || vRes.data.url[0]?.url
                    : vRes.data.url;
            }
        }

        if (fbvid) {
            await sock.sendMessage(chatId, {
                video: { url: fbvid },
                caption: `✅ *تم تحميل فيديو Facebook بنجاح!*\n\n⚔️ ${settings.botName}`,
                mimetype: "video/mp4"
            }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
        } else {
            throw new Error("Could not find download link");
        }

    } catch (e) {
        console.error('Error in fb downloader:', e);
        await sock.sendMessage(chatId, { text: `❌ *خطأ:* ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
