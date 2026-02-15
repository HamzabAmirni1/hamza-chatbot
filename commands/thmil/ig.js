const { igdl } = require('ruhend-scraper');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers) => {
    const igUrl = args[0];

    if (!igUrl || !igUrl.match(/(https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/[^\s]+)/i)) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.ig [رابط المنشور]\n\n*مثال:* .ig https://www.instagram.com/reel/xxx`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    try {
        const downloadData = await igdl(igUrl);
        if (downloadData?.data?.length) {
            const mediaList = downloadData.data;
            // Limit to 5 media to avoid spam/ban
            for (let i = 0; i < Math.min(5, mediaList.length); i++) {
                const media = mediaList[i];
                const mediaUrl = media.url;
                const isVideo = media.type === "video" || /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || igUrl.includes("/reel/") || igUrl.includes("/tv/");

                const caption = `✅ *تم التحميل بنجاح!*\n\n🚀 ${settings.botName}`;

                const contextInfo = {
                    externalAdReply: {
                        title: "Instagram Downloader",
                        body: settings.botName,
                        thumbnailUrl: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg",
                        mediaType: isVideo ? 2 : 1,
                        sourceUrl: igUrl
                    }
                };

                if (isVideo) {
                    await sock.sendMessage(chatId, {
                        video: { url: mediaUrl },
                        caption,
                        mimetype: "video/mp4",
                        contextInfo
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(chatId, {
                        image: { url: mediaUrl },
                        caption,
                        contextInfo
                    }, { quoted: msg });
                }
            }
            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
        } else {
            throw new Error("No media found");
        }
    } catch (e) {
        console.error('Error in ig downloader:', e);
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل المنشور. الرابط قد يكون خاصاً أو لم يتم العثور عليه.` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
