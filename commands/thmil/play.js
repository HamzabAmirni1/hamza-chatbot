const yts = require('yt-search');
const config = require('../../config');
const axios = require('axios');
const crypto = require('crypto');
const { getBuffer } = require('../../lib/ytdl');

class SaveTube {
    constructor() {
        this.ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
        this.is = axios.create({
            headers: {
                'content-type': 'application/json',
                'origin': 'https://yt.savetube.me',
                'user-agent': 'Mozilla/5.0 (Android 15; Mobile)'
            }
        });
    }

    async decrypt(enc) {
        const buf = Buffer.from(enc, 'base64');
        const key = Buffer.from(this.ky, 'hex');
        const iv = buf.slice(0, 16);
        const data = buf.slice(16);
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return JSON.parse(decrypted.toString());
    }

    async getCdn() {
        try {
            const res = await this.is.get("https://media.savetube.vip/api/random-cdn");
            return { status: true, data: res.data.cdn };
        } catch (e) {
            return { status: true, data: "cdn403.savetube.vip" };
        }
    }

    async download(id) {
        const cdn = await this.getCdn();
        const info = await this.is.post(`https://${cdn.data}/v2/info`, {
            url: `https://www.youtube.com/watch?v=${id}`
        });
        const dec = await this.decrypt(info.data.data);
        const dl = await this.is.post(`https://${cdn.data}/download`, {
            id, downloadType: 'audio', quality: '128', key: dec.key
        });
        return {
            title: dec.title,
            duration: dec.duration,
            thumb: dec.thumbnail,
            download: dl.data.data.downloadUrl
        };
    }
}

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
        const waitMsg = await sock.sendMessage(chatId, { text: "🔍 جاري البحث والتحميل... المرجو الانتظار." }, { quoted: msg });

        let videoId = "";
        let videoUrl = text;
        let originalText = text;

        if (!text.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/)) {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
                return await sock.sendMessage(chatId, { text: `❌ لم يتم العثور على نتائج لـ: *${text}*` }, { quoted: msg });
            }
            videoId = videos[0].videoId;
            videoUrl = videos[0].url;
        } else {
            videoId = (text.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        }

        if (!videoId) throw new Error("لم يتم العثور على فيديو.");

        const st = new SaveTube();
        const res = await st.download(videoId);

        const finalUrl = res.download;
        const finalTitle = res.title || "Audio";

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        // Attempt to send audio directly
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
                            thumbnailUrl: res.thumb || `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
                            mediaType: 1,
                            renderLargerThumbnail: true,
                            sourceUrl: videoUrl
                        }
                    }
                },
                { quoted: msg }
            );
        } catch (sendErr) {
            console.error("[Play] Direct URL send failed, trying buffer...", sendErr.message);
            const buffer = await getBuffer(finalUrl);
            if (!buffer) throw new Error("فشل تحميل الملف الصوتي كبفر أيضاً.");

            await sock.sendMessage(
                chatId,
                {
                    audio: buffer,
                    mimetype: "audio/mpeg",
                    fileName: `${finalTitle}.mp3`
                },
                { quoted: msg }
            );
        }

        // Send as document
        try {
            await sock.sendMessage(
                chatId,
                {
                    document: { url: finalUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${finalTitle.replace(/[<>:"/\\|?*]/g, "_")}.mp3`,
                    caption: `🎵 *${finalTitle}*\n⏱️ *Duration:* ${res.duration || 'N/A'}\n\n*🚀 Downloaded via ${config.botName}*`
                },
                { quoted: msg }
            );
        } catch (e) {
            const buffer = await getBuffer(finalUrl);
            if (buffer) {
                await sock.sendMessage(
                    chatId,
                    {
                        document: buffer,
                        mimetype: "audio/mpeg",
                        fileName: `${finalTitle.replace(/[<>:"/\\|?*]/g, "_")}.mp3`,
                        caption: `🎵 *${finalTitle}*\n⏱️ *Duration:* ${res.duration || 'N/A'}\n\n*🚀 Downloaded via ${config.botName}*`
                    },
                    { quoted: msg }
                );
            }
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error("Play Command Error:", e);
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل الملف الصوتي.\n\n⚠️ السبب: ${e.message}` }, { quoted: msg });
    }
};
