const axios = require('axios');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers) => {
    const fbUrl = args[0];

    if (!fbUrl || !fbUrl.match(/(https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch|fb\.com|web\.facebook\.com)\/[^\s]+)/i)) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.fb [رابط الفيديو]\n\n*مثال:* .fb https://www.facebook.com/watch/?v=xxx`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    try {
        // Try Vreden API (New and stable)
        const apiUrl = `https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(fbUrl)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });

        let fbvid = null;
        let title = "Facebook Video";

        if (response.data && response.data.status) {
            fbvid = response.data.result.video || response.data.result.video_hd || response.data.result.video_sd;
            title = response.data.result.title || title;
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
                caption: `✅ *تم التحميل بنجاح!*\n\n🎬 *${title}*\n\n🚀 ${settings.botName}`,
                mimetype: "video/mp4",
                contextInfo: {
                    externalAdReply: {
                        title: "Facebook Downloader",
                        body: settings.botName,
                        thumbnailUrl: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg",
                        mediaType: 2,
                        sourceUrl: fbUrl
                    }
                }
            }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
        } else {
            throw new Error("Could not find download link");
        }

    } catch (e) {
        console.error('Error in fb downloader:', e);
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل الفيديو. الرابط قد يكون خاصاً أو غير متاح.` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
