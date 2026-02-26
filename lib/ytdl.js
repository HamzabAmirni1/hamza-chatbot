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

// --- SCRAPERS FROM SILANA OFFICIAL (FIXED 2026) ---

/**
 * SaveTube Scraper (AES Decryption)
 * Source: yt.savetube.me
 */
async function getSaveTube(url, isAudio = false) {
    try {
        const id = (url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        if (!id) throw new Error("Invalid URL");

        const ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
        const instance = axios.create({
            headers: {
                'content-type': 'application/json',
                'origin': 'https://yt.savetube.me',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });

        // 1. Get random CDN
        const cdnRes = await instance.get("https://media.savetube.vip/api/random-cdn");
        const cdn = cdnRes.data.cdn;

        // 2. Get encrypted info
        const infoRes = await instance.post(`https://${cdn}/v2/info`, {
            url: `https://www.youtube.com/watch?v=${id}`
        });

        // 3. Decrypt
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

        // 4. Request download
        const dlRes = await instance.post(`https://${cdn}/download`, {
            id,
            downloadType: isAudio ? 'audio' : 'video',
            quality: isAudio ? '128' : '720',
            key: dec.key
        });

        if (dlRes.data?.data?.downloadUrl) {
            return {
                download: dlRes.data.data.downloadUrl,
                title: dec.title,
                thumb: dec.thumbnail
            };
        }
        throw new Error("SaveTube DL failed");
    } catch (e) { throw e; }
}

/**
 * YTConvert Scraper (Poll-based)
 * Source: ytmp3.gg / ytconvert.org
 */
async function getYTConvert(url, isAudio = false) {
    try {
        const payload = {
            url,
            os: "android",
            output: {
                type: isAudio ? "audio" : "video",
                format: isAudio ? "mp3" : "mp4",
                quality: isAudio ? "128k" : "720p"
            }
        };
        const headers = {
            ...COMMON_HEADERS,
            'referer': 'https://ytmp3.gg/',
            'accept': 'application/json'
        };

        let init;
        try {
            init = await axios.post("https://api.ytconvert.org/api/download", payload, { headers, timeout: 10000 });
        } catch (e) {
            init = await axios.post("https://hub.ytconvert.org/api/download", payload, { headers, timeout: 10000 });
        }

        if (!init.data?.statusUrl) throw new Error("YTConvert Init failed");

        // Polling loop
        for (let i = 0; i < 30; i++) {
            const res = await axios.get(init.data.statusUrl, { headers, timeout: 5000 });
            if (res.data.status === "completed") {
                return { download: res.data.downloadUrl, title: "YTConvert Download" };
            }
            if (res.data.status === "failed") break;
            await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error("YTConvert Timeout");
    } catch (e) { throw e; }
}

/**
 * SaveNow Scraper
 * Source: savenow.to
 */
async function getSaveNow(url, isAudio = false) {
    try {
        const res = await axios.get(`https://p.savenow.to/ajax/download.php`, {
            params: {
                copyright: '0',
                format: isAudio ? 'mp3' : '720',
                url,
                api: 'dfcb6d76f2f6a9894gjkege8a4ab232222'
            },
            headers: { ...COMMON_HEADERS, 'Referer': 'https://y2down.cc/' },
            timeout: 10000
        });

        if (!res.data?.progress_url) throw new Error("SaveNow failed");

        // Polling loop
        for (let i = 0; i < 30; i++) {
            const status = await axios.get(res.data.progress_url, { headers: COMMON_HEADERS, timeout: 5000 });
            if (status.data?.download_url) {
                return { download: status.data.download_url, title: status.data.info?.title || "SaveNow Download" };
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error("SaveNow Timeout");
    } catch (e) { throw e; }
}

// --- MAIN EXPORT ---

async function downloadYouTube(url, type = 'video') {
    const isAudio = type === 'mp3' || type === 'audio';

    const methods = [
        getSaveTube,
        getYTConvert,
        getSaveNow
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

    return null;
}

module.exports = { downloadYouTube };
