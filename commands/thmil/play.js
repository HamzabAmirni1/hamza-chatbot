const yts = require('yt-search');
const config = require('../../config');
const { downloadYouTube } = require('../../lib/ytdl');
const axios = require('axios');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const text = args.join(" ").trim();

        if (!text) {
            return await sock.sendMessage(chatId, {
                text: "� *تحميل الأغاني والمقاطع الصوتية*\n\n" +
                    "المرجو كتابة اسم الأغنية أو رابط اليوتيوب.\n\n" +
                    "📌 مثال:\n" +
                    ".play سورة الملك\n" +
                    ".play https://youtube.com/watch?v=..."
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '⌛', key: msg.key } });
        const waitMsg = await sock.sendMessage(chatId, { text: "🔍 جاري البحث والتحميل... المرجو الانتظار." }, { quoted: msg });

        let videoUrl = text;
        let videoTitle = "";
        let videoThumb = "";
        let duration = "";

        if (!text.startsWith("http")) {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
                return await sock.sendMessage(chatId, { text: `❌ لم يتم العثور على نتائج لـ: *${text}*` }, { quoted: msg });
            }
            const video = videos[0];
            videoUrl = video.url;
            videoTitle = video.title;
            videoThumb = video.thumbnail;
            duration = video.timestamp;
        } else {
            // If it's a URL, try to get info
            try {
                const videoId = (text.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
                if (videoId) {
                    videoThumb = `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
                }
            } catch (e) { }
        }

        const audioData = await downloadYouTube(videoUrl, 'mp3');
        if (!audioData) {
            throw new Error("جميع محركات التحميل فشلت في استخراج الصوت.");
        }

        const finalUrl = audioData.download || audioData.downloadUrl;
        const finalTitle = audioData.title || videoTitle || "Audio";

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        // Send audio (playable)
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
                        thumbnailUrl: videoThumb || "",
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        sourceUrl: videoUrl
                    }
                }
            },
            { quoted: msg }
        );

        // Also send as document (optional, but requested often for high quality/non-voice format)
        await sock.sendMessage(
            chatId,
            {
                document: { url: finalUrl },
                mimetype: "audio/mpeg",
                fileName: `${finalTitle.replace(/[<>:"/\\|?*]/g, "_")}.mp3`,
                caption: `🎵 *${finalTitle}*\n⏱️ *Duration:* ${duration || 'N/A'}\n\n*🚀 Downloaded via ${config.botName}*`
            },
            { quoted: msg }
        );

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error("Play Command Error:", e);
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل الملف الصوتي.\n\n⚠️ السبب: ${e.message}` }, { quoted: msg });
    }
};
