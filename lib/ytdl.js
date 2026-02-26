const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const { ytmp4, ytmp3 } = require('ruhend-scraper');

const AXIOS_TIMEOUT = 30000;

// Centralized Headers to avoid bot detection and 403/404 errors
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};

const axiosIgnoreSSL = axios.create({
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: COMMON_HEADERS,
    timeout: AXIOS_TIMEOUT
});

// Added for some APIs that need it
const axiosNoRedirect = axios.create({
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: COMMON_HEADERS,
    timeout: AXIOS_TIMEOUT,
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400
});

// --- SCRAPERS 2026 ---

/**
 * Built-in Ruhend Scraper
 */
async function getRuhend(url, isAudio = false) {
    try {
        const res = isAudio ? await ytmp3(url) : await ytmp4(url);
        if (res.status && res.result?.download) {
            return {
                download: res.result.download,
                title: res.result.title || 'Ruhend Downloader',
                thumb: res.result.thumbnail
            };
        }
        throw new Error('Ruhend failed');
    } catch (e) { throw e; }
}

/**
 * Siputzx API - Often stable for bots
 */
async function getSiputzx(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axiosIgnoreSSL.get(`https://api.siputzx.my.id/api/${type}?url=${encodeURIComponent(url)}`);
        if (res.data?.status && res.data.data?.download) {
            return {
                download: res.data.data.download,
                title: res.data.data.title || 'Siputzx Download',
                thumb: res.data.data.thumbnail
            };
        }
        throw new Error('Siputzx failed');
    } catch (e) { throw e; }
}

/**
 * Vreden API
 */
async function getVreden(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axiosIgnoreSSL.get(`https://api.vreden.my.id/api/${type}?url=${encodeURIComponent(url)}`);
        if (res.data?.status && res.data.result?.download) {
            return {
                download: res.data.result.download,
                title: res.data.result.title || 'Vreden Download'
            };
        }
        throw new Error('Vreden failed');
    } catch (e) { throw e; }
}

/**
 * Itzpire API (With SSL Fix)
 */
async function getItzpire(url, isAudio = false) {
    try {
        const res = await axiosIgnoreSSL.get(`https://itzpire.com/download/youtube?url=${encodeURIComponent(url)}`);
        if (res.data?.status === 'success' && res.data.data) {
            const d = res.data.data;
            const dl = isAudio ? (d.audio?.url || d.mp3 || d.audio) : (d.video?.url || d.mp4 || d.video);
            if (dl && typeof dl === 'string') {
                return {
                    download: dl,
                    title: d.title || 'Itzpire Video',
                    thumb: d.thumbnail
                };
            }
        }
        throw new Error('Itzpire failed');
    } catch (e) { throw e; }
}

/**
 * SaveTube Scraper (AES Decryption)
 * Fixed with better headers to avoid 404
 */
async function getSaveTube(url, isAudio = false) {
    try {
        const id = (url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        if (!id) throw new Error("Invalid URL");

        const ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
        const instance = axios.create({
            headers: {
                ...COMMON_HEADERS,
                'content-type': 'application/json',
                'origin': 'https://yt.savetube.me',
                'referer': 'https://yt.savetube.me/'
            }
        });

        const cdnRes = await instance.get("https://media.savetube.vip/api/random-cdn");
        const cdn = cdnRes.data.cdn;

        const infoRes = await instance.post(`https://${cdn}/v2/info`, {
            url: `https://www.youtube.com/watch?v=${id}`
        });

        const decrypt = (enc) => {
            const buf = Buffer.from(enc, 'base64');
            const key = Buffer.from(ky, 'hex');
            const iv = buf.slice(0, 16);
            const data = buf.slice(16);
            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
            return JSON.parse(decrypted.toString());
        };

        const dec = decrypt(infoRes.data.data);

        const dlRes = await instance.post(`https://${cdn}/download`, {
            id,
            downloadType: isAudio ? 'audio' : 'video',
            quality: isAudio ? '128' : '360', // 360p is safer for 500MB server
            key: dec.key
        });

        if (dlRes.data?.data?.downloadUrl) {
            return {
                download: dlRes.data.data.downloadUrl,
                title: dec.title,
                thumb: dec.thumbnail,
                referer: 'https://yt.savetube.me/'
            };
        }
        throw new Error("SaveTube DL failed");
    } catch (e) { throw e; }
}

/**
 * Ryzendes API - Alternative reliable source
 */
async function getRyzendes(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axiosIgnoreSSL.get(`https://api.ryzendesu.vip/api/downloader/${type}?url=${encodeURIComponent(url)}`);
        if (res.data?.status && res.data.result?.url) {
            return {
                download: res.data.result.url,
                title: res.data.result.title || 'Ryzendes Download',
                thumb: res.data.result.thumbnail
            };
        }
        throw new Error('Ryzendes failed');
    } catch (e) { throw e; }
}

/**
 * Hanggts API
 */
async function getHanggts(url, isAudio = false) {
    try {
        const type = isAudio ? 'youtube-audio' : 'youtube-video';
        const res = await axiosIgnoreSSL.get(`https://api.hanggts.xyz/download/${type}?url=${encodeURIComponent(url)}`);
        if (res.data?.status && (res.data.result?.url || res.data.result?.download)) {
            return {
                download: res.data.result.url || res.data.result.download,
                title: res.data.result.title || 'Hanggts Download'
            };
        }
        throw new Error('Hanggts failed');
    } catch (e) { throw e; }
}

/**
 * Zenkey API
 */
async function getZenkey(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axiosIgnoreSSL.get(`https://api.zenkey.my.id/api/download/${type}?url=${encodeURIComponent(url)}`);
        if (res.data?.status && res.data.result?.downloadUrl) {
            return {
                download: res.data.result.downloadUrl,
                title: res.data.result.title || 'Zenkey Download',
                thumb: res.data.result.thumbnail
            };
        }
        throw new Error('Zenkey failed');
    } catch (e) { throw e; }
}

/**
 * Dreaded API - Reliable fallback
 */
async function getDreaded(url, isAudio = false) {
    try {
        const type = isAudio ? 'audio' : 'video';
        // Try without redirect first as many these apps use SSR/HTML redirectors
        const res = await axiosNoRedirect.get(`https://api.dreaded.site/api/ytdl/${type}?url=${encodeURIComponent(url)}`);

        if (res.headers.location) {
            return {
                download: res.headers.location,
                title: 'Dreaded Download'
            };
        }

        if (res.data?.status === 'success' && res.data.url) {
            return {
                download: res.data.url,
                title: res.data.title || 'Dreaded Download'
            };
        }
        throw new Error('Dreaded failed');
    } catch (e) {
        if (e.response?.headers?.location) {
            return { download: e.response.headers.location, title: 'Dreaded' };
        }
        throw e;
    }
}

/**
 * Agatz API
 */
async function getAgatz(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axiosNoRedirect.get(`https://api.agatz.xyz/api/${type}?url=${encodeURIComponent(url)}`);

        if (res.headers.location) {
            return { download: res.headers.location, title: 'Agatz Download' };
        }

        if (res.data?.status === 200 && res.data.data?.url) {
            return {
                download: res.data.data.url,
                title: res.data.data.title || 'Agatz Download'
            };
        }
        throw new Error('Agatz failed');
    } catch (e) {
        if (e.response?.headers?.location) {
            return { download: e.response.headers.location, title: 'Agatz' };
        }
        throw e;
    }
}

// --- MAIN EXPORT ---

async function downloadYouTube(url, type = 'video') {
    const isAudio = type === 'mp3' || type === 'audio';

    const methods = [
        getSaveTube,
        getRuhend,
        getDreaded,
        getAgatz,
        getSiputzx,
        getRyzendes,
        getZenkey,
        getHanggts,
        getVreden,
        getItzpire
    ];

    for (const method of methods) {
        try {
            console.log(`[YTDL] Trying ${method.name}...`);
            const result = await method(url, isAudio);
            if (result && result.download) {
                console.log(`✅ Download successful via ${method.name}`);
                return result;
            }
        } catch (e) {
            console.log(`❌ ${method.name} failed: ${e.message}`);
        }
    }

    return null;
}

/**
 * Specialized Buffer Fetcher with dynamic Referer
 */
async function getBuffer(url, referer = null) {
    try {
        const headers = { ...COMMON_HEADERS };
        if (referer) headers['Referer'] = referer;

        const res = await axiosIgnoreSSL.get(url, {
            headers,
            responseType: 'arraybuffer',
            timeout: 60000
        });
        return Buffer.from(res.data);
    } catch (e) {
        console.error(`[YTDL] Buffer fetch failed for ${url}: ${e.message}`);
        return null;
    }
}

module.exports = { downloadYouTube, getBuffer };
