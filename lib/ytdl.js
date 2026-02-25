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
        const baseURL = 'https://backand-ytdl.siputzx.my.id/api';
        const headers = {
            ...COMMON_HEADERS,
            'authority': 'backand-ytdl.siputzx.my.id',
            'origin': 'https://yuyuyu.siputzx.my.id',
            'referer': 'https://yuyuyu.siputzx.my.id/',
        };

        const formData1 = new FormData();
        formData1.append('url', url);
        const infoResponse = await axios.post(`${baseURL}/get-info`, formData1, { headers: { ...headers, ...formData1.getHeaders() }, timeout: AXIOS_TIMEOUT });
        const videoInfo = infoResponse.data;

        const formData2 = new FormData();
        formData2.append('id', videoInfo.id);
        formData2.append('format', isAudio ? 'mp3' : 'mp4');
        formData2.append('video_format_id', '18');
        formData2.append('audio_format_id', '251');
        formData2.append('info', JSON.stringify(videoInfo));

        const jobResponse = await axios.post(`${baseURL}/create_job`, formData2, { headers: { ...headers, ...formData2.getHeaders() }, timeout: AXIOS_TIMEOUT });
        const jobId = jobResponse.data.job_id;

        for (let i = 0; i < 20; i++) {
            const statusResponse = await axios.get(`${baseURL}/check_job/${jobId}`, { headers, timeout: 5000 });
            if (statusResponse.data.status === 'completed') {
                return {
                    download: `https://backand-ytdl.siputzx.my.id${statusResponse.data.download_url}`,
                    title: videoInfo.title
                };
            }
            if (statusResponse.data.status === 'failed') break;
            await new Promise(r => setTimeout(r, 2000));
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
        }, { headers: { ...COMMON_HEADERS, 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: AXIOS_TIMEOUT });

        if (res.data?.url) return { download: res.data.url, title: 'Cobalt Video' };
        throw new Error('Cobalt No URL');
    } catch (e) { throw e; }
}

async function getVreden(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.vreden.my.id/api/${type}?url=${encodeURIComponent(url)}`, { headers: COMMON_HEADERS, timeout: 15000 });
        if (res.data?.status && res.data?.result?.download) {
            return { download: res.data.result.download, title: res.data.result.title || 'Vreden Video' };
        }
        if (res.data?.result?.url) {
            return { download: res.data.result.url, title: res.data.result.title || 'Vreden Video' };
        }
        throw new Error('Vreden failed');
    } catch (e) { throw e; }
}

async function getAlya(url, isAudio = false) {
    try {
        const type = isAudio ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.alya-chan.my.id/api/${type}?url=${encodeURIComponent(url)}&apikey=alya-hamza`, { headers: COMMON_HEADERS, timeout: 15000 });
        if (res.data?.status && res.data?.result?.url) {
            return { download: res.data.result.url, title: res.data.result.title };
        }
        throw new Error('Alya failed');
    } catch (e) { throw e; }
}

async function getRuhend(url, isAudio = false) {
    try {
        const res = isAudio ? await ytmp3(url) : await ytmp4(url);
        if (res && (res.video || res.audio)) return { download: res.video || res.audio, title: res.title };
        throw new Error('Ruhend No Result');
    } catch (e) { throw e; }
}

async function getKeith(url, isAudio = false) {
    try {
        const type = isAudio ? 'dlmp3' : 'dlmp4';
        // Keith API often fails on Render, but let's try the newer endpoint
        const res = await axios.get(`https://keith.onrender.com/api/downloader/${isAudio ? 'ytmp3' : 'ytmp4'}?url=${encodeURIComponent(url)}`, { timeout: 20000 });
        if (res.data?.result?.url) return { download: res.data.result.url, title: res.data.result.title };
        throw new Error('Keith failed');
    } catch (e) { throw e; }
}

// --- MAIN EXPORT ---

async function downloadYouTube(url, type = 'video') {
    const isAudio = type === 'mp3' || type === 'audio';

    // Added random seed to bypass basic caching/blocks
    const methods = [
        () => getVreden(url, isAudio),
        () => getRuhend(url, isAudio),
        () => getSiputzx(url, isAudio),
        () => getAlya(url, isAudio),
        () => getCobalt(url, isAudio),
        () => getKeith(url, isAudio)
    ];

    for (const method of methods) {
        try {
            const result = await method();
            if (result && result.download) {
                console.log(`✅ Download successful via ${method.name}`);
                return result;
            }
        } catch (e) {
            console.log(`❌ Method failed: ${e.message}`);
        }
    }

    // Extended Fail-Safe Fallback (Third-party generic scraper)
    try {
        const res = await axios.get(`https://api.yupra.my.id/api/downloader/${isAudio ? 'ytmp3' : 'ytmp4'}?url=${encodeURIComponent(url)}`, { timeout: 20000 });
        if (res.data?.success && res.data?.data?.download_url) {
            return { download: res.data.data.download_url, title: res.data.data.title };
        }
    } catch (e) { }

    return null;
}

module.exports = { downloadYouTube };
