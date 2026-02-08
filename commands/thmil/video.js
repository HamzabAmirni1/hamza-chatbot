const yts = require('yt-search');
const { t } = require('../lib/language');
const settings = require('../settings');
const { downloadYouTube } = require('../lib/ytdl');

async function videoCommand(sock, chatId, msg, args, commands, userLang, match) {
    try {
        const searchQuery = match || args.join(' ') || (msg.message?.extendedTextMessage?.text || msg.message?.conversation || '').replace(/^\/?.+?\s/, '').trim();

        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: t('video.usage', {}, userLang) }, { quoted: msg });
            return;
        }

        let videoUrl = '';
        let videoTitle = '';

        if (searchQuery.startsWith('http')) {
            videoUrl = searchQuery;
        } else {
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: t('download.yt_no_result', {}, userLang) }, { quoted: msg });
                return;
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            // Send thumbnail
            await sock.sendMessage(chatId, {
                image: { url: videos[0].thumbnail },
                caption: t('video.downloading', { title: videoTitle }, userLang)
            }, { quoted: msg });
        }

        const videoData = await downloadYouTube(videoUrl, 'video');

        if (!videoData) {
            throw new Error("All download methods failed.");
        }

        await sock.sendMessage(chatId, {
            video: { url: videoData.download },
            mimetype: 'video/mp4',
            fileName: `${videoData.title || videoTitle || 'video'}.mp4`,
            caption: t('video.success', { botName: settings.botName }, userLang)
        }, { quoted: msg });

    } catch (error) {
        console.error('[VIDEO] Error:', error.message);
        await sock.sendMessage(chatId, { text: t('download.yt_error', {}, userLang) + `: ${error.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
}

module.exports = videoCommand;
