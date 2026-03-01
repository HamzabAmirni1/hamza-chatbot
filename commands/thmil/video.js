const yts = require('yt-search');
const config = require('../../config');
const { downloadYouTube, getBuffer } = require('../../lib/ytdl');

module.exports = async (sock, chatId, msg, args, helpers, userLang, match) => {
    try {
        const searchQuery = match || args.join(' ').trim();

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

        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
        const waitMsg = await sock.sendMessage(chatId, { text: "🔍 جاري معالجة الفيديو من أقوى السيرفرات..." }, { quoted: msg });

        // Use centralized downloader
        const res = await downloadYouTube(videoUrl, 'video');
        if (!res || !res.download) throw new Error("جميع طرق التحميل فشلت حالياً. المرجو المحاولة لاحقاً.");

        const finalUrl = res.download;
        const finalTitle = res.title || videoTitle || "Video";

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        try {
            await sock.sendMessage(chatId, {
                video: { url: finalUrl },
                mimetype: 'video/mp4',
                fileName: `${finalTitle || 'video'}.mp4`,
                caption: `✅ *تم التحميل بنجاح*\n\n🎬 *${finalTitle}*\n⚔️ ${config.botName}`
            }, { quoted: msg });
        } catch (sendErr) {
            console.log("[Video] Direct send failed, trying buffer...");
            const buffer = await getBuffer(finalUrl, res.referer);
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
