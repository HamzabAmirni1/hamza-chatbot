const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const { ytmp4, ytmp3 } = require('ruhend-scraper');

const AXIOS_TIMEOUT = 30000;
const agent = new https.Agent({ rejectUnauthorized: false });

const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};

const axiosIgnoreSSL = axios.create({
    httpsAgent: agent,
    headers: COMMON_HEADERS,
    timeout: AXIOS_TIMEOUT
});

/**
 * Downloads YouTube video or audio using a massive list of APIs (Merged from bot-hamza-amirni)
 */
async function downloadYouTube(url, type = 'mp3') {
    const isAudio = type === 'mp3' || type === 'audio';

    // 1. First try the robust built-in methods I added before
    const builtInMethods = [
        getBTCH, getShizuka, getSiputzx, getRyzendes, getZenkey,
        getVreden, getHanggts, getItzpire, getRuhend, getDreaded,
        getAgatz, getSaveTube
    ];

    for (const method of builtInMethods) {
        try {
            console.log(`[YTDL] Trying built-in ${method.name}...`);
            const res = await method(url, isAudio);
            if (res && res.download && await checkLink(res.download, res.referer)) {
                return res;
            }
        } catch (e) {
            console.log(`❌ ${method.name} failed: ${e.message}`);
        }
    }

    // 2. Try the massive API list from bot-hamza-amirni-main
    const apiList = isAudio ? [
        `https://btch.xyz/download/ytmp3?url=${encodeURIComponent(url)}`,
        `https://yt.le37.xyz/api/download?url=${encodeURIComponent(url)}&format=mp3`,
        `https://popcat.xyz/api/yt-dl?url=${encodeURIComponent(url)}`,
        `https://api.boxiimyz.my.id/api/download/ytmp3?url=${encodeURIComponent(url)}`,
        `https://api.darkness.biz.id/api/download/ytmp3?url=${encodeURIComponent(url)}`,
        `https://api.agungnx.my.id/api/ytmp3?url=${encodeURIComponent(url)}`,
        `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(url)}`,
        `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(url)}`,
        `https://deliriussapi-oficial.vercel.app/download/ytmp3?url=${encodeURIComponent(url)}`,
        `https://api.shizune.tech/api/download/ytmp3?url=${encodeURIComponent(url)}`,
        `https://api.guruapi.tech/videodownloader/ytmp3?url=${encodeURIComponent(url)}`,
        `https://itzpire.com/download/youtube-mp3?url=${encodeURIComponent(url)}`
    ] : [
        `https://btch.xyz/download/ytmp4?url=${encodeURIComponent(url)}`,
        `https://yt.le37.xyz/api/download?url=${encodeURIComponent(url)}&format=mp4`,
        `https://popcat.xyz/api/yt-dl?url=${encodeURIComponent(url)}`,
        `https://api.boxiimyz.my.id/api/download/ytmp4?url=${encodeURIComponent(url)}`,
        `https://api.darkness.biz.id/api/download/ytmp4?url=${encodeURIComponent(url)}`,
        `https://api.agungnx.my.id/api/ytmp4?url=${encodeURIComponent(url)}`,
        `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(url)}`,
        `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(url)}`,
        `https://deliriussapi-oficial.vercel.app/download/ytmp4?url=${encodeURIComponent(url)}`,
        `https://api.shizune.tech/api/download/ytmp4?url=${encodeURIComponent(url)}`,
        `https://api.guruapi.tech/videodownloader/ytmp4?url=${encodeURIComponent(url)}`,
        `https://itzpire.com/download/youtube-mp4?url=${encodeURIComponent(url)}`
    ];

    for (const apiUrl of apiList) {
        try {
            const providerName = new URL(apiUrl).hostname;
            console.log(`[YTDL] Trying rest-api provider: ${providerName}...`);
            const res = await axiosIgnoreSSL.get(apiUrl);
            const data = res.data;

            if (data && (data.status === true || data.status === 200 || data.success || data.result || data.data)) {
                let download = '';
                if (isAudio) {
                    download = data.audio || data.link || (data.result && (data.result.download || data.result.url)) || (data.data && data.data.download && data.data.download.url) || (data.result && data.result.mp3) || (data.data && data.data.url) || data.url;
                } else {
                    download = data.link || (data.result && (data.result.download || data.result.url)) || (data.data && (data.data.url || data.data.download)) || (data.result && data.result.mp4) || data.url;
                }

                if (download && typeof download === 'object') download = download.url || download.download;

                if (download && await checkLink(download)) {
                    return {
                        download: download,
                        title: data.title || (data.result && data.result.title) || 'YouTube Download',
                        thumb: data.thumbnail || (data.result && data.result.thumbnail) || ''
                    };
                }
            }
        } catch (e) { }
    }

    return null;
}

// --- Built-in Scraping Methods ---

async function getRuhend(url, isAudio = false) {
    const res = isAudio ? await ytmp3(url) : await ytmp4(url);
    if (res.status && res.result?.download) return { download: res.result.download, title: res.result.title, thumb: res.result.thumbnail };
    throw new Error('Failed');
}

async function getSiputzx(url, isAudio = false) {
    const type = isAudio ? 'ytmp3' : 'ytmp4';
    const res = await axiosIgnoreSSL.get(`https://api.siputzx.my.id/api/${type}?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data.data?.download) return { download: res.data.data.download, title: res.data.data.title, thumb: res.data.data.thumbnail };
    throw new Error('Failed');
}

async function getVreden(url, isAudio = false) {
    const type = isAudio ? 'ytmp3' : 'ytmp4';
    const res = await axiosIgnoreSSL.get(`https://api.vreden.my.id/api/${type}?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data.result?.download) return { download: res.data.result.download, title: res.data.result.title };
    throw new Error('Failed');
}

async function getItzpire(url, isAudio = false) {
    const res = await axiosIgnoreSSL.get(`https://itzpire.com/download/youtube?url=${encodeURIComponent(url)}`);
    if (res.data?.status === 'success' && res.data.data) {
        const d = res.data.data;
        const dl = isAudio ? (d.audio?.url || d.mp3 || d.audio) : (d.video?.url || d.mp4 || d.video);
        if (dl && typeof dl === 'string') return { download: dl, title: d.title, thumb: d.thumbnail };
    }
    throw new Error('Failed');
}

async function getSaveTube(url, isAudio = false) {
    const id = (url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
    if (!id) throw new Error("Invalid ID");
    const ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
    const infoRes = await axiosIgnoreSSL.post(`https://cdn401.savetube.vip/v2/info`, { url: `https://www.youtube.com/watch?v=${id}` });
    const decrypt = (enc) => {
        const buf = Buffer.from(enc, 'base64');
        const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(ky, 'hex'), buf.slice(0, 16));
        return JSON.parse(Buffer.concat([decipher.update(buf.slice(16)), decipher.final()]).toString());
    };
    const dec = decrypt(infoRes.data.data);
    const dlRes = await axiosIgnoreSSL.post(`https://cdn401.savetube.vip/download`, { id, downloadType: isAudio ? 'audio' : 'video', quality: isAudio ? '128' : '360', key: dec.key });
    if (dlRes.data?.data?.downloadUrl) return { download: dlRes.data.data.downloadUrl, title: dec.title, thumb: dec.thumbnail, referer: 'https://yt.savetube.me/' };
    throw new Error("Failed");
}

async function getRyzendes(url, isAudio = false) {
    const type = isAudio ? 'ytmp3' : 'ytmp4';
    const res = await axiosIgnoreSSL.get(`https://api.ryzendesu.vip/api/downloader/${type}?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data.result?.url) return { download: res.data.result.url, title: res.data.result.title, thumb: res.data.result.thumbnail };
    throw new Error('Failed');
}

async function getHanggts(url, isAudio = false) {
    const type = isAudio ? 'youtube-audio' : 'youtube-video';
    const res = await axiosIgnoreSSL.get(`https://api.hanggts.xyz/download/${type}?url=${encodeURIComponent(url)}`);
    if (res.data?.status && (res.data.result?.url || res.data.result?.download)) return { download: res.data.result.url || res.data.result.download, title: res.data.result.title };
    throw new Error('Failed');
}

async function getZenkey(url, isAudio = false) {
    const type = isAudio ? 'ytmp3' : 'ytmp4';
    const res = await axiosIgnoreSSL.get(`https://api.zenkey.my.id/api/download/${type}?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data.result?.downloadUrl) return { download: res.data.result.downloadUrl, title: res.data.result.title, thumb: res.data.result.thumbnail };
    throw new Error('Failed');
}

async function getDreaded(url, isAudio = false) {
    const type = isAudio ? 'audio' : 'video';
    const res = await axiosIgnoreSSL.get(`https://api.dreaded.site/api/ytdl/${type}?url=${encodeURIComponent(url)}`, { maxRedirects: 0, validateStatus: null });
    if (res.headers.location) return { download: res.headers.location, title: 'Dreaded' };
    if (res.data?.status === 'success' && res.data.url) return { download: res.data.url, title: res.data.title };
    throw new Error('Failed');
}

async function getAgatz(url, isAudio = false) {
    const type = isAudio ? 'ytmp3' : 'ytmp4';
    const res = await axiosIgnoreSSL.get(`https://api.agatz.xyz/api/${type}?url=${encodeURIComponent(url)}`, { maxRedirects: 0, validateStatus: null });
    if (res.headers.location) return { download: res.headers.location, title: 'Agatz' };
    if (res.data?.status === 200 && res.data.data?.url) return { download: res.data.data.url, title: res.data.data.title };
    throw new Error('Failed');
}

async function getBTCH(url, isAudio = false) {
    const type = isAudio ? 'ytmp3' : 'ytmp4';
    const res = await axiosIgnoreSSL.get(`https://api.btch.rf.gd/api/download/${type}?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data.result?.url) return { download: res.data.result.url, title: res.data.result.title, thumb: res.data.result.thumbnail };
    throw new Error('Failed');
}

async function getShizuka(url, isAudio = false) {
    const type = isAudio ? 'ytmp3' : 'ytmp4';
    const res = await axiosIgnoreSSL.get(`https://shizuka.site/api/${type}?url=${encodeURIComponent(url)}`);
    if (res.data?.status && res.data.result?.downloadUrl) return { download: res.data.result.downloadUrl, title: res.data.result.title };
    throw new Error('Failed');
}

// --- Utilities ---

async function checkLink(url, referer = null) {
    try {
        const headers = { ...COMMON_HEADERS };
        if (referer) headers['Referer'] = referer;
        const res = await axiosIgnoreSSL.get(url, { headers, timeout: 5000, maxContentLength: 1, validateStatus: (s) => s >= 200 && s < 400 });
        return true;
    } catch (e) { return false; }
}

async function getBuffer(url, referer = null) {
    try {
        const headers = { ...COMMON_HEADERS };
        if (referer) headers['Referer'] = referer;
        const res = await axiosIgnoreSSL.get(url, { headers, responseType: 'arraybuffer', timeout: 120000 });
        return Buffer.from(res.data);
    } catch (e) { return null; }
}

module.exports = { downloadYouTube, getBuffer };
