const axios = require('axios');
const fs = require('fs-extra');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const text = args.join(" ");

        if (!text) {
            return await sock.sendMessage(chatId, {
                text: "🎵 *Spotify Play Command*\n\n" +
                    "المرجو كتابة اسم الأغنية.\n\n" +
                    "📌 مثال:\n" +
                    ".play Blinding Lights\n\n" +
                    "هذا الأمر يبحث في Spotify ويحمل الأغنية بجودة عالية."
            }, { quoted: msg });
        }

        if (text.length > 100) {
            return await sock.sendMessage(chatId, { text: "❌ عنوان الأغنية طويل جداً. يرجى اختصاره." }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '⌛', key: msg.key } });

        const res = await axios.get(
            `https://api.vreden.my.id/api/spotify?query=${encodeURIComponent(text)}`
        );
        const json = res.data;

        if (!json.status || !json.result) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return await sock.sendMessage(chatId, { text: `❌ لم يتم العثور على نتائج لـ: *${text}*` }, { quoted: msg });
        }

        const song = json.result;
        const title = song.title || "Unknown Song";
        const artist = song.artists || "Unknown Artist";
        const audioUrl = song.download;

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

        // Send audio (playable)
        await sock.sendMessage(
            chatId,
            {
                audio: { url: audioUrl },
                mimetype: "audio/mpeg",
                fileName: `${title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: title.substring(0, 30),
                        body: artist.substring(0, 30),
                        thumbnailUrl: song.image || "",
                        sourceUrl: song.external_url || "",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            },
            { quoted: msg }
        );

        // Send as document (downloadable)
        await sock.sendMessage(
            chatId,
            {
                document: { url: audioUrl },
                mimetype: "audio/mpeg",
                fileName: `${title.replace(/[<>:"/\\|?*]/g, "_")}.mp3`,
                caption: `🎵 *${title}*\n👤 ${artist}\n\n*🚀 Downloaded via Hamza Bot*`
            },
            { quoted: msg }
        );

    } catch (e) {
        console.error("Spotify Play Error:", e);
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل الأغنية.\n\nError: ${e.message}` }, { quoted: msg });
    }
};
