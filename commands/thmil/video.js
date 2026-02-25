const axios = require('axios');
const yts = require('yt-search');
const config = require('../../config');
const { downloadYouTube } = require('../../lib/ytdl');

module.exports = async (sock, chatId, msg, args, helpers, userLang, match) => {
    try {
        const searchQuery = match || args.join(' ') || (msg.message?.extendedTextMessage?.text || msg.message?.conversation || '').replace(/^\/?.+?\s/, '').trim();

        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: "🎬 *تحميل فيديو*\n\nالمرجو كتابة اسم الفيديو أو الرابط.\n\n📌 مثال: .video سورة الكهف" }, { quoted: msg });
            return;
        }

        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';

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
            videoThumbnail = videos[0].thumbnail;
        }

        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        if (!ytId) {
            await sock.sendMessage(chatId, { text: "❌ رابط غير صالح." }, { quoted: msg });
            return;
        }

        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

        // Send thumbnail/info
        try {
            const thumb = videoThumbnail || `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`;
            await sock.sendMessage(chatId, {
                image: { url: thumb },
                caption: `🎬 *جاري تحميل الفيديو...*\n\n📝 *العنوان:* ${videoTitle || searchQuery}\n⚔️ ${config.botName}`
            }, { quoted: msg });
        } catch (e) { }

        // Use centralized downloader
        const videoData = await downloadYouTube(videoUrl, 'video');

        if (!videoData) throw new Error("جميع طرق التحميل فشلت حالياً.");

        const finalUrl = videoData.download || videoData.downloadUrl || videoData.url;

        await sock.sendMessage(chatId, {
            video: { url: finalUrl },
            mimetype: 'video/mp4',
            fileName: `${videoData.title || videoTitle || 'video'}.mp4`,
            caption: `✅ *تم التحميل بنجاح*\n\n⚔️ ${config.botName}`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (error) {
        console.error('[VIDEO] Error:', error.message);
        await sock.sendMessage(chatId, { text: `❌ فشل تحميل الفيديو: ${error.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
