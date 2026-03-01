const axios = require('axios');
const yts = require('yt-search');
const config = require('../../config');
const { getBuffer } = require('../../lib/ytdl');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function poll(statusUrl) {
    const headers = { "user-agent": "Mozilla/5.0", referer: "https://ytmp3.gg/" };
    const { data } = await axios.get(statusUrl, { headers });
    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(data.message || "Conversion failed");
    await sleep(2000);
    return poll(statusUrl);
}

async function convertYouTube(url, quality = "720p") {
    let title = "Video";
    try {
        const { data: meta } = await axios.get("https://www.youtube.com/oembed", { params: { url, format: "json" } });
        if (meta && meta.title) title = meta.title;
    } catch (e) { }

    const payload = { url, os: "android", output: { type: "video", format: "mp4", quality } };
    const headers = { accept: "application/json", "content-type": "application/json", referer: "https://ytmp3.gg/" };

    let downloadInit;
    try {
        downloadInit = await axios.post("https://hub.ytconvert.org/api/download", payload, { headers });
    } catch {
        downloadInit = await axios.post("https://api.ytconvert.org/api/download", payload, { headers });
    }

    if (!downloadInit?.data?.statusUrl) throw new Error("Converter failed to respond");

    const result = await poll(downloadInit.data.statusUrl);

    return {
        title,
        downloadUrl: result.downloadUrl
    };
}

module.exports = async (sock, chatId, msg, args, helpers, userLang, match) => {
    try {
        const searchQuery = match || args.join(' ') || (msg.message?.extendedTextMessage?.text || msg.message?.conversation || '').replace(/^\/?.+?\s/, '').trim();

        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: "🎬 *تحميل فيديو*\n\nالمرجو كتابة اسم الفيديو أو الرابط.\n\n📌 مثال: .video سورة الكهف" }, { quoted: msg });
            return;
        }

        let videoUrl = '';
        let videoTitle = '';

        if (searchQuery.startsWith('http')) {
            videoUrl = searchQuery;
        } else {
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على نتائج." }, { quoted: msg });
                return;
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
        }

        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        if (!ytId) {
            await sock.sendMessage(chatId, { text: "❌ رابط غير صالح." }, { quoted: msg });
            return;
        }

        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

        // Use centralized downloader
        const videoData = await convertYouTube(videoUrl, '720p');
        if (!videoData || !videoData.downloadUrl) throw new Error("جميع طرق التحميل فشلت حالياً.");

        const finalUrl = videoData.downloadUrl;
        const finalTitle = videoData.title || videoTitle;

        try {
            await sock.sendMessage(chatId, {
                video: { url: finalUrl },
                mimetype: 'video/mp4',
                fileName: `${finalTitle || 'video'}.mp4`,
                caption: `✅ *تم التحميل بنجاح*\n\n🎬 *${finalTitle}*\n⚔️ ${config.botName}`
            }, { quoted: msg });
        } catch (sendErr) {
            console.log("[Video] Direct send failed, trying buffer...");
            const buffer = await getBuffer(finalUrl);
            if (!buffer) throw new Error("فشل تحميل الفيديو كبفر أيضاً.");

            await sock.sendMessage(chatId, {
                video: buffer,
                mimetype: 'video/mp4',
                fileName: `${finalTitle || 'video'}.mp4`,
                caption: `✅ *تم التحميل بنجاح (بفر)*\n\n🎬 *${finalTitle}*\n⚔️ ${config.botName}`
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (error) {
        console.error('[VIDEO] Error:', error.message);
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل الفيديو: ${error.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
