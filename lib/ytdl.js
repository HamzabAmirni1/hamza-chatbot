const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const { ytmp4, ytmp3 } = require('ruhend-scraper');

const AXIOS_TIMEOUT = 15000;

// Centralized Headers to avoid bot detection
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
};

// --- SCRAPERS ---

async function getSiputzx(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.siputzx.my.id/api/d/${type}?url=${encodeURIComponent(url)}`, { timeout: 20000 });
        if (res.data?.status && res.data.data?.dl) {
            return { download: res.data.data.dl, title: res.data.data.title || 'Siputzx Video' };
        }
        throw new Error('Siputzx failed');
    } catch (e) { throw e; }
}

async function getVreden(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.vreden.my.id/api/${type}?url=${encodeURIComponent(url)}`, { headers: COMMON_HEADERS, timeout: 15000 });
        if (res.data?.status && (res.data.result?.download || res.data.result?.url)) {
            return { download: res.data.result.download || res.data.result.url, title: res.data.result.title || 'Vreden Video' };
        }
        throw new Error('Vreden failed');
    } catch (e) { throw e; }
}

async function getYupra(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.yupra.my.id/api/downloader/${type}?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.success && res.data.data?.download_url) {
            return { download: res.data.data.download_url, title: res.data.data.title || 'Yupra Video' };
        }
        throw new Error('Yupra failed');
    } catch (e) { throw e; }
}

async function getDarkness(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.darkness.my.id/api/downloader/${type}?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.status && (res.data.result?.url || res.data.result?.download)) {
            return { download: res.data.result.url || res.data.result.download, title: res.data.result.title || 'Darkness Video' };
        }
        throw new Error('Darkness failed');
    } catch (e) { throw e; }
}

async function getRuhend(url, isAudio = false) {
    try {
        const res = isAudio ? await ytmp3(url) : await ytmp4(url);
        if (res && (res.video || res.audio)) return { download: res.video || res.audio, title: res.title };
        throw new Error('Ruhend No Result');
    } catch (e) { throw e; }
}

// --- MAIN EXPORT ---

async function downloadYouTube(url, type = 'video') {
    const isAudio = type === 'mp3' || type === 'audio';

    const methods = [
        getYupra,
        getVreden,
        getSiputzx,
        getDarkness,
        getRuhend
    ];

    for (const method of methods) {
        try {
            const result = await method(url, isAudio);
            if (result && result.download) {
                console.log(`✅ Download successful via ${method.name}`);
                return result;
            }
        } catch (e) {
            console.log(`❌ ${method.name} failed: ${e.message}`);
        }
    }

    // Ultimate Fallback: Siputzx Scraper (Alternative endpoint)
    try {
        const res = await axios.get(`https://api.siputzx.my.id/api/downloader/ytmp4?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.data?.url) return { download: res.data.data.url, title: 'Fallback Video' };
    } catch (e) { }

    return null;
}

module.exports = { downloadYouTube };
