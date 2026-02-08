const yts = require('yt-search');
const axios = require('axios');
const { t } = require('../lib/language');
const settings = require('../settings');
const { downloadYouTube } = require('../lib/ytdl');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

// Inline fallbacks if global ytdl fails
async function getYupraAudioByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return {
            download: res.data.data.download_url,
            title: res.data.data.title,
            thumbnail: res.data.data.thumbnail
        };
    }
    throw new Error('Yupra returned no download');
}

async function getOkatsuAudioByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.mp3) {
        return { download: res.data.result.mp3, title: res.data.result.title };
    }
    throw new Error('Okatsu ytmp3 returned no mp3');
}

async function getKeithAudioByUrl(youtubeUrl) {
    const apiUrl = `https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.status && res?.data?.result?.downloadUrl) {
        return { download: res.data.result.downloadUrl, title: res.data.result.title };
    }
    throw new Error('Keith API returned no download');
}

async function playCommand(sock, chatId, msg, args, commands, userLang) {
    try {
        let searchQuery = "";

        if (args && args.length > 0) {
            searchQuery = args.join(' ');
        } else {
            const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
            searchQuery = body.replace(/^\S+\s+/, '').trim();
        }

        if (searchQuery.startsWith('.play')) {
            searchQuery = searchQuery.replace('.play', '').trim();
        }

        if (!searchQuery) {
            return await sock.sendMessage(chatId, {
                text: t('play.usage', {}, userLang)
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '🎧', key: msg.key } });

        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, { text: t('play.no_results', {}, userLang) }, { quoted: msg });
        }

        const video = videos[0];
        const urlYt = video.url;

        const caption = t('play.downloading_thumb', {
            title: video.title,
            duration: video.timestamp
        }, userLang);

        await sock.sendMessage(chatId, {
            image: { url: video.thumbnail },
            caption: caption
        }, { quoted: msg });

        // Try using robust ytdl first
        let audioData = null;
        try {
            audioData = await downloadYouTube(urlYt, 'mp3');
        } catch (e) {
            console.log("Global YTDL failed, trying backups...");
        }

        if (!audioData) {
            try {
                audioData = await getYupraAudioByUrl(urlYt);
            } catch (e1) {
                try {
                    audioData = await getOkatsuAudioByUrl(urlYt);
                } catch (e2) {
                    try {
                        audioData = await getKeithAudioByUrl(urlYt);
                    } catch (e3) {
                        return await sock.sendMessage(chatId, {
                            text: t('download.yt_error', {}, userLang)
                        }, { quoted: msg });
                    }
                }
            }
        }

        const audioUrl = audioData.downloadUrl || audioData.download;
        const finalTitle = audioData.title || video.title;

        let audioBuffer;
        try {
            const resp = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: 90000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Encoding': 'identity'
                }
            });
            audioBuffer = Buffer.from(resp.data);
        } catch (e) {
            throw new Error("Failed to download audio from provider.");
        }

        if (!audioBuffer || audioBuffer.length === 0) throw new Error("Empty audio buffer.");

        // NOTE: removed strict converter requirement to avoid crash if lib is missing. 
        // We assume most providers return proper MP3. If not, it will be sent as is but with mp3 extension or what it detected.

        await sock.sendMessage(chatId, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${finalTitle}.mp3`,
            ptt: false,
            contextInfo: {
                externalAdReply: {
                    title: finalTitle,
                    body: settings.botName,
                    mediaType: 2,
                    renderLargerThumbnail: true,
                    thumbnailUrl: video.thumbnail
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (error) {
        console.error('Error in play command:', error);
        await sock.sendMessage(chatId, {
            text: t('download.yt_error', {}, userLang) + `: ${error.message}`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
}

module.exports = playCommand;
