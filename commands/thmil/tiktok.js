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
        let videoUrl = null;
        let title = "TikTok Video";

        const methods = [
            // Method 1: Siputzx
            async () => {
                const res = await axios.get(`https://api.siputzx.my.id/api/tiktok?url=${encodeURIComponent(tiktokUrl)}`, { timeout: 15000 });
                if (res.data?.status && res.data.data?.video) {
                    return { url: res.data.data.video, title: res.data.data.title || "TikTok Video" };
                }
                throw new Error("Siputzx failed");
            },
            // Method 2: Ryzendesu
            async () => {
                const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/tiktok?url=${encodeURIComponent(tiktokUrl)}`, { timeout: 15000 });
                if (res.data?.status && res.data.result?.video) {
                    return { url: res.data.result.video, title: res.data.result.title || "TikTok Video" };
                }
                throw new Error("Ryzendesu failed");
            },
            // Method 3: Vreden
            async () => {
                const res = await axios.get(`https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(tiktokUrl)}`, { timeout: 15000 });
                if (res.data && res.data.status) {
                    return { url: res.data.result.video || res.data.result.video_nowatermark, title: res.data.result.title || "TikTok Video" };
                }
                throw new Error("Vreden failed");
            }
        ];

        for (const method of methods) {
            try {
                const result = await method();
                if (result && result.url) {
                    videoUrl = result.url;
                    title = result.title;
                    break;
                }
            } catch (err) {
                console.log(`TikTok Method failed: ${err.message}`);
            }
        }

        if (videoUrl) {
            await sock.sendMessage(chatId, {
                video: { url: videoUrl },
                caption: `✅ *تم التحميل بنجاح!*\n\n🎬 *${title}*\n\n🚀 ${settings.botName}`,
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
    } catch (e) {
        console.error('Error in tiktok downloader:', e);
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل فيديو TikTok. الرابط قد يكون غير صحيح أو خاص.` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
