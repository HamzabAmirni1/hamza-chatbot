const axios = require('axios');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers) => {
    const tiktokUrl = args[0];

    if (!tiktokUrl || !tiktokUrl.match(/(https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+)/i)) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.tiktok [رابط الفيديو]\n\n*مثال:* .tiktok https://vm.tiktok.com/xxx`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    try {
        const apiUrl = `https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(tiktokUrl)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });

        if (response.data && response.data.status) {
            const data = response.data.result;
            const videoUrl = data.video || data.video_nowatermark;
            const caption = data.title || "TikTok Video";

            if (videoUrl) {
                await sock.sendMessage(chatId, {
                    video: { url: videoUrl },
                    caption: `✅ *تم التحميل بنجاح!*\n\n🎬 *${caption}*\n\n🚀 ${settings.botName}`,
                    mimetype: "video/mp4",
                    contextInfo: {
                        externalAdReply: {
                            title: "TikTok Downloader",
                            body: settings.botName,
                            thumbnailUrl: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg",
                            mediaType: 2,
                            sourceUrl: tiktokUrl
                        }
                    }
                }, { quoted: msg });
                await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
            } else {
                throw new Error("No video found");
            }
        } else {
            throw new Error("Failed to fetch from API");
        }
    } catch (e) {
        console.error('Error in tiktok downloader:', e);
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل فيديو TikTok. الرابط قد يكون غير صحيح أو خاص.` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
