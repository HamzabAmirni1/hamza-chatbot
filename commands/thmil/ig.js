const { igdl } = require('ruhend-scraper');
const settings = require('../settings');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const igUrl = args[0];

    if (!igUrl || !igUrl.match(/(https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/[^\s]+)/i)) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.ig [رابط المنشور]\n\n*مثال:* .ig https://www.instagram.com/reel/xxx`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🔄", key: msg.key } });

    try {
        const downloadData = await igdl(igUrl);
        if (downloadData?.data?.length) {
            const mediaList = downloadData.data;
            for (let i = 0; i < Math.min(2, mediaList.length); i++) {
                const media = mediaList[i];
                const mediaUrl = media.url;
                const isVideo = media.type === "video" || /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || igUrl.includes("/reel/") || igUrl.includes("/tv/");

                const caption = `✅ *Hamza Amirni Instagram Downloader*\n\n⚔️ ${settings.botName}`;

                if (isVideo) {
                    await sock.sendMessage(chatId, {
                        video: { url: mediaUrl },
                        caption,
                        mimetype: "video/mp4"
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(chatId, {
                        image: { url: mediaUrl },
                        caption
                    }, { quoted: msg });
                }
            }
            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
        } else {
            throw new Error("No media found");
        }
    } catch (e) {
        console.error('Error in ig downloader:', e);
        await sock.sendMessage(chatId, { text: `❌ *خطأ:* ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
