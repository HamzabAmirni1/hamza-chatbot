const yts = require('yt-search');
const axios = require('axios');
const { t } = require('../../lib/language');
const settings = require('../../config');

// ─── Helper: safe send – never re-throws if the socket is already closed ──────
async function safeSend(sock, chatId, content, opts = {}) {
    try {
        return await sock.sendMessage(chatId, content, opts);
    } catch (e) {
        // 428 / "Connection Closed" — socket dropped between download and send.
        // Log it but don't crash the whole handler.
        if (e?.output?.statusCode === 428 || /connection closed/i.test(e?.message || '')) {
            console.warn('[play] Socket closed before message could be sent — skipping.');
        } else {
            console.error('[play] sendMessage error:', e?.message || e);
        }
        return null;
    }
}

// ─── Audio downloader fallbacks (used ONLY when lib/ytdl fails) ──────────────
async function getYtconvertAudio(url) {
    const headers = {
        accept: 'application/json',
        'content-type': 'application/json',
        referer: 'https://ytmp3.gg/'
    };
    const payload = { url, os: 'android', output: { type: 'audio', format: 'mp3', quality: '320kbps' } };
    let init;
    try {
        init = await axios.post('https://hub.ytconvert.org/api/download', payload, { headers, timeout: 15000 });
    } catch {
        init = await axios.post('https://api.ytconvert.org/api/download', payload, { headers, timeout: 15000 });
    }
    if (!init?.data?.statusUrl) throw new Error('YTConvert empty');
    for (let i = 0; i < 30; i++) {
        const { data } = await axios.get(init.data.statusUrl, { headers, timeout: 10000 });
        if (data.status === 'completed') return { download: data.downloadUrl, title: 'Audio' };
        if (data.status === 'failed') throw new Error('Failed');
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Timeout');
}

async function getYupraAudioByUrl(youtubeUrl) {
    const res = await axios.get(
        `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
        { timeout: 25000 }
    );
    if (res?.data?.success && res?.data?.data?.download_url) {
        return { download: res.data.data.download_url, title: res.data.data.title };
    }
    throw new Error('Yupra returned no download');
}

// ─── Main command ──────────────────────────────────────────────────────────────
async function playCommand(sock, chatId, msg, args, commands, userLang) {
    // 1. Resolve search query
    let searchQuery = args && args.length > 0 ? args.join(' ') : '';
    if (!searchQuery) {
        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        searchQuery = body.replace(/^\S+\s+/, '').trim();
    }
    if (searchQuery.startsWith('.play')) searchQuery = searchQuery.replace('.play', '').trim();

    if (!searchQuery) {
        return safeSend(sock, chatId, { text: t('play.usage', {}, userLang) }, { quoted: msg });
    }

    // 2. React: searching
    await safeSend(sock, chatId, { react: { text: '🎧', key: msg.key } });

    // 3. YouTube search
    let video;
    try {
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            await safeSend(sock, chatId, { react: { text: '❌', key: msg.key } });
            return safeSend(sock, chatId, { text: t('play.no_results', {}, userLang) }, { quoted: msg });
        }
        video = videos[0];
    } catch (e) {
        console.error('[play] yt-search error:', e.message);
        await safeSend(sock, chatId, { react: { text: '❌', key: msg.key } });
        return safeSend(sock, chatId, { text: t('play.no_results', {}, userLang) }, { quoted: msg });
    }

    const urlYt = video.url;

    // 4. Send thumbnail + info while downloading
    const caption = t('play.downloading_thumb', { title: video.title, duration: video.timestamp }, userLang);
    await safeSend(sock, chatId, {
        image: { url: video.thumbnail },
        caption
    }, { quoted: msg });

    // 5. Download audio – try primary library first, then inline fallbacks
    const { downloadYouTube } = require('../../lib/ytdl');
    let audioData = null;

    try {
        audioData = await downloadYouTube(urlYt, 'mp3');
    } catch (_) { /* ignore, try fallbacks */ }

    if (!audioData) {
        for (const fallback of [getYtconvertAudio, getYupraAudioByUrl]) {
            try {
                audioData = await fallback(urlYt);
                if (audioData?.download) break;
            } catch (_) { /* try next */ }
        }
    }

    if (!audioData || !audioData.download) {
        await safeSend(sock, chatId, { react: { text: '❌', key: msg.key } });
        return safeSend(sock, chatId, {
            text: t('download.yt_error', {}, userLang)
        }, { quoted: msg });
    }

    // 6. Fetch audio buffer
    let audioBuffer;
    try {
        const resp = await axios.get(audioData.download, {
            responseType: 'arraybuffer',
            timeout: 120000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
                ...(audioData.referer ? { 'Referer': audioData.referer } : {})
            }
        });
        audioBuffer = Buffer.from(resp.data);
    } catch (e) {
        console.error('[play] buffer fetch error:', e.message);
        await safeSend(sock, chatId, { react: { text: '❌', key: msg.key } });
        return safeSend(sock, chatId, {
            text: t('download.yt_error', {}, userLang)
        }, { quoted: msg });
    }

    if (!audioBuffer || audioBuffer.length === 0) {
        await safeSend(sock, chatId, { react: { text: '❌', key: msg.key } });
        return safeSend(sock, chatId, {
            text: t('download.yt_error', {}, userLang)
        }, { quoted: msg });
    }

    // 7. Convert if not already MP3
    let finalBuffer = audioBuffer;
    const isMp3 = audioBuffer.slice(0, 3).toString() === 'ID3' || audioBuffer[0] === 0xFF;
    if (!isMp3) {
        try {
            const { toAudio } = require('../../lib/converter');
            let ext = 'mp4';
            if (audioBuffer.slice(0, 4).toString() === 'OggS') ext = 'ogg';
            else if (audioBuffer.slice(0, 4).toString() === 'RIFF') ext = 'wav';
            finalBuffer = await toAudio(audioBuffer, ext);
        } catch (convErr) {
            console.error('[play] conversion failed:', convErr.message);
            // send unconverted — WhatsApp may still play it
        }
    }

    const finalTitle = audioData.title || video.title;

    // 8. Send audio (using safeSend — connection may have dropped during the long download)
    const sent = await safeSend(sock, chatId, {
        audio: finalBuffer,
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

    if (sent) {
        await safeSend(sock, chatId, { react: { text: '✅', key: msg.key } });
    }
}

module.exports = playCommand;
