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

async function getLolHuman(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.lolhuman.xyz/api/${type}?apikey=free&url=${encodeURIComponent(url)}`, { timeout: 20000 });
        if (res.data?.status === 200 && res.data.result?.link) {
            return { download: res.data.result.link, title: res.data.result.title || 'LolHuman Video' };
        }
        throw new Error('LolHuman failed');
    } catch (e) { throw e; }
}

async function getAgatz(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.agatz.xyz/api/${type}?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.status === 200 && (res.data.data?.url || res.data.data?.download)) {
            return { download: res.data.data.url || res.data.data.download, title: res.data.data.title || 'Agatz Video' };
        }
        throw new Error('Agatz failed');
    } catch (e) { throw e; }
}

async function getMaher(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.maher-zubair.tech/download/${type}?url=${encodeURIComponent(url)}`, { timeout: 20000 });
        if (res.data?.status && res.data.result?.url) {
            return { download: res.data.result.url, title: res.data.result.title || 'Maher Video' };
        }
        throw new Error('Maher failed');
    } catch (e) { throw e; }
}

async function getBetabotz(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.betabotz.eu.org/api/download/${type}?url=${encodeURIComponent(url)}&apikey=p82W70Vd`, { timeout: 20000 });
        if (res.data?.status && res.data.result?.url) {
            return { download: res.data.result.url, title: res.data.result.title || 'Betabotz Video' };
        }
        throw new Error('Betabotz failed');
    } catch (e) { throw e; }
}

async function getSiputzx(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        // Siputzx moved to a new stable D API
        const res = await axios.get(`https://api.siputzx.my.id/api/d/${type}?url=${encodeURIComponent(url)}`, { timeout: 20000 });
        if (res.data?.status && res.data.data?.dl) {
            return { download: res.data.data.dl, title: res.data.data.title || 'Siputzx Video' };
        }
        throw new Error('Siputzx failed');
    } catch (e) { throw e; }
}

// --- MAIN EXPORT ---

async function downloadYouTube(url, type = 'video') {
    const isAudio = type === 'mp3' || type === 'audio';

    const methods = [
        getMaher,
        getLolHuman,
        getAgatz,
        getBetabotz,
        getSiputzx
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
