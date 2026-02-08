const axios = require('axios');
const yts = require('yt-search');
const settings = require('../settings');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const query = args.join(' ').trim();

    if (!query) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.play [اسم الأغنية أو الرابط]\n\n*مثال:* .play despacito`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, { text: "⏳ *جاري البحث والتحميل...*" }, { quoted: msg });

    try {
        let videoUrl = query;
        let title = "audio";
        let thumbnail = "";

        if (!query.match(/^https?:\/\//)) {
            const searchRes = await yts(query);
            if (!searchRes.videos || searchRes.videos.length === 0) {
                return await sock.sendMessage(chatId, { text: "❌ *ما لقيت حتى نتيجة.*" }, { quoted: msg });
            }
            videoUrl = searchRes.videos[0].url;
            title = searchRes.videos[0].title;
            thumbnail = searchRes.videos[0].thumbnail;
        }

        // Try high quality MP3 API
        // Try high quality MP3 API
        let audioUrl = null;
        try {
            const apiUrl = `https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`;
            const response = await axios.get(apiUrl, { timeout: 10000 });
            if (response.data && response.data.status) {
                audioUrl = response.data.result.download;
                title = response.data.result.title || title;
            }
        } catch (e) {
            console.log("Primary MP3 API failed, trying fallback...");
        }

        if (!audioUrl) {
            // Fallback API
            try {
                const fallbackUrl = `https://yt-dl.officialhectormanuel.workers.dev/?url=${encodeURIComponent(videoUrl)}`;
                const fRes = await axios.get(fallbackUrl, { timeout: 10000 });
                if (fRes.data && fRes.data.status) {
                    audioUrl = fRes.data.mp3 || Object.values(fRes.data.videos)[0]; // Fallback to video as audio if needed
                }
            } catch (err) {
                console.log("Fallback MP3 API failed");
            }
        }

        if (audioUrl) {
            await sock.sendMessage(chatId, { delete: waitMsg.key });
            await sock.sendMessage(chatId, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: title,
                        body: settings.botName,
                        thumbnailUrl: thumbnail,
                        mediaType: 2,
                        sourceUrl: videoUrl
                    }
                }
            }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
        } else {
            throw new Error("Could not get audio download link");
        }

    } catch (e) {
        console.error('Error in play command:', e);
        await sock.sendMessage(chatId, { text: `❌ *خطأ:* ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
