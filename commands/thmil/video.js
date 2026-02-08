const axios = require('axios');
const yts = require('yt-search');
const settings = require('../settings');
const { t } = require('../lib/language');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const videoQuery = args.join(' ').trim();

    if (!videoQuery) {
        return await sock.sendMessage(
            chatId,
            {
                text: `⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة الصحيحة:*\n.video [رابط أو اسم]\n\n*مثال:* .video https://youtu.be/xxx`,
            },
            { quoted: msg }
        );
    }

    await sock.sendMessage(chatId, {
        react: { text: "⏳", key: msg.key },
    });
    const dlMsg = await sock.sendMessage(
        chatId,
        {
            text: "⏳ *جاري التحميل... صبر شوية*",
        },
        { quoted: msg }
    );

    try {
        let videoUrl = videoQuery;
        let videoTitle = "video";
        let thumbnail = "";

        // If not a URL, search first
        if (!videoQuery.match(/^https?:\/\//)) {
            const searchRes = await yts(videoQuery);
            if (!searchRes.videos || searchRes.videos.length === 0) {
                return await sock.sendMessage(
                    chatId,
                    { text: "❌ *ما لقيت الفيديو*" },
                    { quoted: msg }
                );
            }
            videoUrl = searchRes.videos[0].url;
            videoTitle = searchRes.videos[0].title;
            thumbnail = searchRes.videos[0].thumbnail;
        }
        videoUrl = videoUrl.trim();

        // Send preview immediately
        if (thumbnail || videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/)) {
            const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
            const thumb = thumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
            if (thumb) {
                await sock.sendMessage(
                    chatId,
                    {
                        image: { url: thumb },
                        caption: `🎬 *جاري التنزيل...*\n\n📌 *${videoTitle}*`,
                    },
                    { quoted: msg }
                );
            }
        }

        // Download logic (simplified/adapted from index)
        let downloadUrl = null;

        // Try Primary API
        try {
            const apiUrl = `https://yt-dl.officialhectormanuel.workers.dev/?url=${encodeURIComponent(videoUrl)}`;
            const response = await axios.get(apiUrl, { timeout: 30000 });
            if (response.data && response.data.status) {
                downloadUrl = response.data.videos["360"] || response.data.videos["480"] || Object.values(response.data.videos)[0];
            }
        } catch (e) { }

        // Fallbacks would go here... for now let's keep it simple or copy ffrom index
        if (!downloadUrl) {
            // Fallback 1: Vreden
            try {
                const vredenUrl = `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(videoUrl)}`;
                const vRes = await axios.get(vredenUrl, { timeout: 30000 });
                if (vRes.data && vRes.data.status) downloadUrl = vRes.data.result.download;
            } catch (e) { }
        }

        if (!downloadUrl) {
            throw new Error("Failed to get download URL");
        }

        await sock.sendMessage(chatId, { delete: dlMsg.key });

        await sock.sendMessage(
            chatId,
            {
                video: { url: downloadUrl },
                mimetype: "video/mp4",
                fileName: `${videoTitle.replace(/[^a-zA-Z0-9-_\.]/g, "_")}.mp4`,
                caption: `✅ *تم التحميل بنجاح!*\n\n🎬 *${videoTitle}*\n\n⚔️ *${settings.botName}*`,
            },
            { quoted: msg }
        );

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (error) {
        console.error("Video Download Error:", error);
        await sock.sendMessage(chatId, { text: `❌ *خطأ:* ${error.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
