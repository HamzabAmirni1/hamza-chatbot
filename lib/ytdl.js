const axios = require('axios');
const crypto = require('crypto');
const https = require('https');

const AXIOS_TIMEOUT = 30000;
const agent = new https.Agent({ rejectUnauthorized: false });

const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

const axiosIgnoreSSL = axios.create({
    httpsAgent: agent,
    headers: COMMON_HEADERS,
    timeout: AXIOS_TIMEOUT
});

// ─── PROVIDER 1: ytconvert.org (powers ytmp3.gg — confirmed working) ──────────
async function getYtconvert(url, isAudio) {
    const headers = {
        accept: 'application/json',
        'content-type': 'application/json',
        referer: 'https://ytmp3.gg/'
    };
    const payload = {
        url,
        os: 'android',
        output: {
            type: isAudio ? 'audio' : 'video',
            format: isAudio ? 'mp3' : 'mp4',
            quality: isAudio ? '320kbps' : '720p'
        }
    };

    let initData;
    for (const base of ['https://hub.ytconvert.org', 'https://api.ytconvert.org']) {
        try {
            const r = await axios.post(`${base}/api/download`, payload, { headers, timeout: 15000 });
            if (r.data?.statusUrl) { initData = r.data; break; }
        } catch (_) { /* try next */ }
    }

    if (!initData?.statusUrl) throw new Error('YTConvert: no statusUrl from either endpoint');

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const { data } = await axios.get(initData.statusUrl, { headers, timeout: 10000 });
        if (data.status === 'completed' && data.downloadUrl) {
            return { download: data.downloadUrl, title: data.title || 'YouTube' };
        }
        if (data.status === 'failed') throw new Error('YTConvert: transcoding failed');
    }
    throw new Error('YTConvert: timeout waiting for conversion');
}

// ─── PROVIDER 2: savetube.vip (has AES decrypt, stable CDN) ──────────────────
async function getSaveTube(url, isAudio) {
    const id = (url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
    if (!id) throw new Error('SaveTube: invalid YouTube ID');

    const ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
    const infoRes = await axiosIgnoreSSL.post(
        'https://cdn401.savetube.vip/v2/info',
        { url: `https://www.youtube.com/watch?v=${id}` },
        { timeout: 25000 }
    );

    const decrypt = (enc) => {
        const buf = Buffer.from(enc, 'base64');
        const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(ky, 'hex'), buf.slice(0, 16));
        return JSON.parse(Buffer.concat([decipher.update(buf.slice(16)), decipher.final()]).toString());
    };

    const dec = decrypt(infoRes.data.data);
    const dlRes = await axiosIgnoreSSL.post(
        'https://cdn401.savetube.vip/download',
        { id, downloadType: isAudio ? 'audio' : 'video', quality: isAudio ? '128' : '360', key: dec.key },
        { timeout: 25000 }
    );

    if (dlRes.data?.data?.downloadUrl) {
        return {
            download: dlRes.data.data.downloadUrl,
            title: dec.title || 'YouTube',
            thumb: dec.thumbnail,
            referer: 'https://yt.savetube.me/'
        };
    }
    throw new Error('SaveTube: no downloadUrl in response');
}

// ─── PROVIDER 3: y2down / p.savenow.to (y2down.cc frontend) ──────────────────
async function getSaveNow(url, isAudio) {
    const headers = {
        'User-Agent': COMMON_HEADERS['User-Agent'],
        'Referer': 'https://y2down.cc/',
        'Origin': 'https://y2down.cc'
    };
    const format = isAudio ? 'mp3' : '720';

    const initRes = await axios.get('https://p.savenow.to/ajax/download.php', {
        params: { copyright: '0', format, url, api: 'dfcb6d76f2f6a9894gjkege8a4ab232222' },
        headers,
        timeout: 20000
    });

    if (!initRes.data?.progress_url) throw new Error('SaveNow: no progress_url in response');

    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
            const p = await axios.get(initRes.data.progress_url, { headers, timeout: 10000 });
            if (p.data?.download_url) {
                return { download: p.data.download_url, title: initRes.data.info?.title || 'YouTube' };
            }
            if (p.data?.error) throw new Error(`SaveNow error: ${p.data.error}`);
        } catch (e) {
            if (i > 5) throw e; // Give a few retries for transient errors
        }
    }
    throw new Error('SaveNow: progress polling timed out');
}

// ─── PROVIDER 4: yt1s / loader.to API ────────────────────────────────────────
async function getLoader(url, isAudio) {
    const format = isAudio ? 'mp3' : 'mp4720';
    const analyzeRes = await axios.post('https://loader.to/api/button/', null, {
        params: { url, f: format },
        headers: { ...COMMON_HEADERS, Referer: 'https://loader.to/' },
        timeout: 20000
    });

    if (!analyzeRes.data?.id) throw new Error('Loader.to: no conversion ID');
    const jobId = analyzeRes.data.id;

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const progressRes = await axios.get('https://loader.to/api/progress/', {
            params: { id: jobId },
            headers: { ...COMMON_HEADERS, Referer: 'https://loader.to/' },
            timeout: 10000
        });
        const d = progressRes.data;
        if (d.success && d.download_url) {
            return { download: d.download_url, title: d.info?.title || 'YouTube' };
        }
        if (d.text === 'fail') throw new Error('Loader.to: conversion failed');
    }
    throw new Error('Loader.to: timed out');
}

// ─── PROVIDER 5: ootaizumi.web.id API (Indonesian, sometimes works) ───────────
async function getOotaizumi(url, isAudio) {
    const endpoint = isAudio
        ? `https://api.ootaizumi.web.id/downloader/ytmp3?url=${encodeURIComponent(url)}`
        : `https://api.ootaizumi.web.id/downloader/ytmp4?url=${encodeURIComponent(url)}`;
    const res = await axiosIgnoreSSL.get(endpoint);
    const d = res.data;
    let dl = isAudio
        ? (d.result?.download || d.result?.url || d.data?.download_url || d.download)
        : (d.result?.download || d.result?.url || d.data?.download_url || d.download);
    if (dl) return { download: dl, title: d.result?.title || d.title || 'YouTube' };
    throw new Error('Ootaizumi: no download URL');
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
/**
 * Downloads YouTube audio or video using multiple reliable providers in fallback order.
 * @param {string} url - YouTube URL
 * @param {'mp3'|'mp4'|'audio'|'video'} type
 * @returns {Promise<{download:string, title:string, thumb?:string, referer?:string}|null>}
 */
async function downloadYouTube(url, type = 'mp3') {
    const isAudio = type === 'mp3' || type === 'audio';

    const providers = [
        { name: 'YTConvert (ytmp3.gg)', fn: () => getYtconvert(url, isAudio) },
        { name: 'SaveTube', fn: () => getSaveTube(url, isAudio) },
        { name: 'SaveNow (y2down)', fn: () => getSaveNow(url, isAudio) },
        { name: 'Loader.to', fn: () => getLoader(url, isAudio) },
        { name: 'Ootaizumi', fn: () => getOotaizumi(url, isAudio) },
    ];

    for (const provider of providers) {
        try {
            console.log(`[YTDL] Trying ${provider.name}...`);
            const result = await provider.fn();
            if (result?.download) {
                console.log(`[YTDL] ✅ Success via ${provider.name}`);
                return result;
            }
        } catch (e) {
            console.log(`[YTDL] ❌ ${provider.name} failed: ${e.message}`);
        }
    }

    console.log('[YTDL] ❌ All providers exhausted — returning null');
    return null;
}

// ─── UTILITY: Buffer download ─────────────────────────────────────────────────
async function getBuffer(url, referer = null) {
    try {
        const headers = { ...COMMON_HEADERS };
        if (referer) headers['Referer'] = referer;
        const res = await axiosIgnoreSSL.get(url, {
            headers,
            responseType: 'arraybuffer',
            timeout: 120000
        });
        return Buffer.from(res.data);
    } catch (_) {
        return null;
    }
}

module.exports = { downloadYouTube, getBuffer };
