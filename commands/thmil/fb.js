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
        let fbvid = null;
        let title = "Facebook Video";

        const methods = [
            // Method 1: Siputzx
            async () => {
                const res = await axios.get(`https://api.siputzx.my.id/api/facebook?url=${encodeURIComponent(fbUrl)}`, { timeout: 15000 });
                if (res.data?.status && res.data.data?.url) {
                    return { url: res.data.data.url, title: "Facebook Video" };
                }
                throw new Error("Siputzx failed");
            },
            // Method 2: Ryzendesu
            async () => {
                const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/fb?url=${encodeURIComponent(fbUrl)}`, { timeout: 15000 });
                if (res.data?.status && res.data.result?.url) {
                    const vid = Array.isArray(res.data.result.url)
                        ? res.data.result.url.find(v => v.quality === "hd")?.url || res.data.result.url[0]?.url
                        : res.data.result.url;
                    return { url: vid, title: res.data.result.title || "Facebook Video" };
                }
                throw new Error("Ryzendesu failed");
            },
            // Method 3: Vreden (Updated endpoint if it changed, otherwise fallback)
            async () => {
                const res = await axios.get(`https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(fbUrl)}`, { timeout: 15000 });
                if (res.data && res.data.status) {
                    const vid = res.data.result.video || res.data.result.video_hd || res.data.result.video_sd;
                    return { url: vid, title: res.data.result.title || "Facebook Video" };
                }
                throw new Error("Vreden failed");
            }
        ];

        for (const method of methods) {
            try {
                const result = await method();
                if (result && result.url) {
                    fbvid = result.url;
                    title = result.title;
                    break;
                }
            } catch (err) {
                console.log(`FB Method failed: ${err.message}`);
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
