const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');

const AXIOS_TIMEOUT = 10000;

// --- SCRAPERS ---

async function getSiputzx(url, isAudio = false) {
    try {
        const baseURL = 'https://backand-ytdl.siputzx.my.id/api';
        const headers = {
            'authority': 'backand-ytdl.siputzx.my.id',
            'accept': '*/*',
            'origin': 'https://yuyuyu.siputzx.my.id',
            'referer': 'https://yuyuyu.siputzx.my.id/',
            'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36'
        };

        const formData1 = new FormData();
        formData1.append('url', url);
        const infoResponse = await axios.post(`${baseURL}/get-info`, formData1, { headers: { ...headers, ...formData1.getHeaders() }, timeout: AXIOS_TIMEOUT });
        const videoInfo = infoResponse.data;

        const formData2 = new FormData();
        formData2.append('id', videoInfo.id);
        formData2.append('format', isAudio ? 'mp3' : 'mp4');
        formData2.append('video_format_id', isAudio ? '18' : '18'); // Fallback IDs, often ignored for conversions
        formData2.append('audio_format_id', '251');
        formData2.append('info', JSON.stringify(videoInfo));

        const jobResponse = await axios.post(`${baseURL}/create_job`, formData2, { headers: { ...headers, ...formData2.getHeaders() }, timeout: AXIOS_TIMEOUT });
        const jobId = jobResponse.data.job_id;

        for (let i = 0; i < 15; i++) {
            const statusResponse = await axios.get(`${baseURL}/check_job/${jobId}`, { headers, timeout: 5000 });
            if (statusResponse.data.status === 'completed') {
                return {
                    download: `https://backand-ytdl.siputzx.my.id${statusResponse.data.download_url}`,
                    title: videoInfo.title
                };
            }
            if (statusResponse.data.status === 'failed') break;
            await new Promise(r => setTimeout(r, 1500));
        }
        throw new Error('Siputzx Timeout');
    } catch (e) { throw e; }
}

async function getCobalt(url, isAudio = false) {
    try {
        const res = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            vCodec: 'h264',
            vQuality: '720',
            aFormat: 'mp3',
            filenamePattern: 'classic',
            isAudioOnly: isAudio
        }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: AXIOS_TIMEOUT });

        if (res.data?.url) return { download: res.data.url, title: 'Cobalt Video' };
        throw new Error('Cobalt No URL');
    } catch (e) { throw e; }
}

async function getSavetube(url, isAudio = false) {
    try {
        const savetube = {
            api: { base: "https://media.savetube.me/api", cdn: "/random-cdn", info: "/v2/info", download: "/download" },
            headers: { 'accept': '*/*', 'content-type': 'application/json', 'origin': 'https://yt.savetube.me', 'referer': 'https://yt.savetube.me/', 'user-agent': 'Postify/1.0.0' },
            crypto: {
                decrypt: async (enc) => {
                    const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
                    const data = Buffer.from(enc, 'base64');
                    const iv = data.slice(0, 16);
                    const content = data.slice(16);
                    const key = Buffer.from(secretKey.match(/.{1,2}/g).join(''), 'hex');
                    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
                    let decrypted = decipher.update(content);
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    return JSON.parse(decrypted.toString());
                }
            }
        };

        const videoId = (url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        if (!videoId) throw new Error('Invalid ID');

        const cdnRes = await axios.get(`${savetube.api.base}${savetube.api.cdn}`, { headers: savetube.headers, timeout: AXIOS_TIMEOUT });
        const cdn = cdnRes.data.cdn;

        const infoRes = await axios.post(`https://${cdn}${savetube.api.info}`, { url: `https://www.youtube.com/watch?v=${videoId}` }, { headers: savetube.headers, timeout: AXIOS_TIMEOUT });
        const decrypted = await savetube.crypto.decrypt(infoRes.data.data);

        const dlRes = await axios.post(`https://${cdn}${savetube.api.download}`, {
            id: videoId,
            downloadType: isAudio ? 'audio' : 'video',
            quality: isAudio ? '128' : '720',
            key: decrypted.key
        }, { headers: savetube.headers, timeout: AXIOS_TIMEOUT });

        if (dlRes.data?.data?.downloadUrl) return { download: dlRes.data.data.downloadUrl, title: decrypted.title || 'Savetube Video' };
        throw new Error('Savetube No URL');
    } catch (e) { throw e; }
}

async function getSavenow(url, isAudio = false) {
    try {
        // Limited to video usually, but let's try
        const res = await axios.get('https://p.savenow.to/ajax/download.php', {
            params: { copyright: '0', format: isAudio ? 'mp3' : '720', url, api: 'dfcb6d76f2f6a9894gjkege8a4ab232222' },
            headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://y2down.cc/' },
            timeout: AXIOS_TIMEOUT
        });

        if (res.data?.progress_url) {
            for (let i = 0; i < 15; i++) {
                const s = await axios.get(res.data.progress_url, { timeout: 5000 });
                if (s.data?.download_url) return { download: s.data.download_url, title: res.data.info?.title || 'Savenow Video' };
                await new Promise(r => setTimeout(r, 1500));
            }
        }
        throw new Error('Savenow Timeout');
    } catch (e) { throw e; }
}

// --- MAIN EXPORT ---

async function downloadYouTube(url, type = 'video') {
    const isAudio = type === 'mp3' || type === 'audio';

    // Priority Order: Siputzx -> Cobalt -> Savetube -> Savenow
    const methods = [
        () => getSiputzx(url, isAudio),
        () => getCobalt(url, isAudio),
        () => getSavetube(url, isAudio),
        () => getSavenow(url, isAudio)
    ];

    let lastError;
    for (const method of methods) {
        try {
            const result = await method();
            if (result && result.download) return result;
        } catch (e) {
            lastError = e;
            // console.log(`Method failed: ${e.message}`); // Silent fail for retries
        }
    }

    // Fallbacks if all else fails (Legacy APIs)
    try {
        const yupra = `https://api.yupra.my.id/api/downloader/${isAudio ? 'ytmp3' : 'ytmp4'}?url=${encodeURIComponent(url)}`;
        const res = await axios.get(yupra, { timeout: AXIOS_TIMEOUT });
        if (res.data?.data?.download_url) return { download: res.data.data.download_url, title: res.data.data.title };
    } catch (e) { }

    return null;
}

module.exports = { downloadYouTube };
