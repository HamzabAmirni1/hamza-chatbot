const yts = require('yt-search');
const config = require('../../config');
const { downloadYouTube, getBuffer } = require('../../lib/ytdl');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const text = args.join(" ").trim();

        if (!text) {
            return await sock.sendMessage(chatId, {
                text: "🎵 *تحميل الأغاني والمقاطع الصوتية*\n\n" +
                    "المرجو كتابة اسم الأغنية أو رابط اليوتيوب.\n\n" +
                    "📌 مثال:\n" +
                    ".play سورة الملك\n" +
                    ".play https://youtube.com/watch?v=..."
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '⌛', key: msg.key } });
        const waitMsg = await sock.sendMessage(chatId, { text: "🔍 جاري البحث والتحميل من أقوى المصادر... المرجو الانتظار." }, { quoted: msg });

        let videoUrl = text;
        let videoTitle = "";
        let videoThumb = "";
        let videoDuration = "";

        if (!text.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/)) {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
                return await sock.sendMessage(chatId, { text: `❌ لم يتم العثور على نتائج لـ: *${text}*` }, { quoted: msg });
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumb = videos[0].thumbnail;
            videoDuration = videos[0].timestamp;
        }

        // Use centralized downloader for MP3
        const res = await downloadYouTube(videoUrl, 'mp3');
        if (!res || !res.download) throw new Error("فشلت جميع طرق التحميل حالياً. المرجو المحاولة لاحقاً.");

        const finalUrl = res.download;
        const finalTitle = res.title || videoTitle || "Audio";

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        // Attempt 1: Send as Voice/Audio message
        try {
            await sock.sendMessage(
                chatId,
                {
                    audio: { url: finalUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${finalTitle}.mp3`,
                    contextInfo: {
                        externalAdReply: {
                            title: finalTitle.substring(0, 50),
                            body: config.botName,
                            thumbnailUrl: res.thumb || videoThumb || `https://i.ytimg.com/vi/${res.id || 'abc'}/sddefault.jpg`,
                            mediaType: 1,
                            renderLargerThumbnail: true,
                            sourceUrl: videoUrl
                        }
                    }
                },
                { quoted: msg }
            );
        } catch (sendErr) {
            const buffer = await getBuffer(finalUrl, res.referer);
            if (buffer) {
                await sock.sendMessage(chatId, { audio: buffer, mimetype: "audio/mpeg" }, { quoted: msg });
            }
        }

        // Attempt 2: Send as Document (for permanent storage)
        try {
            const docName = `${finalTitle.replace(/[<>:"/\\|?*]/g, "_")}.mp3`;
            await sock.sendMessage(
                chatId,
                {
                    document: { url: finalUrl },
                    mimetype: "audio/mpeg",
                    fileName: docName,
                    caption: `🎵 *${finalTitle}*\n⏱️ *المدة:* ${res.duration || videoDuration || 'N/A'}\n\n*🚀 تم التحميل بواسطة ${config.botName}*`
                },
                { quoted: msg }
            );
        } catch (e) {
            const buffer = await getBuffer(finalUrl, res.referer);
            if (buffer) {
                await sock.sendMessage(
                    chatId,
                    {
                        document: buffer,
                        mimetype: "audio/mpeg",
                        fileName: `${finalTitle.replace(/[<>:"/\\|?*]/g, "_")}.mp3`,
                        caption: `🎵 *${finalTitle}* (بفر)\n\n*🚀 ${config.botName}*`
                    },
                    { quoted: msg }
                );
            }
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error("Play Command Error:", e.message);
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل الملف الصوتي.\n\n⚠️ السبب: ${e.message}` }, { quoted: msg });
    }
};
