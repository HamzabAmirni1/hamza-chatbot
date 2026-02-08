const axios = require('axios');
const crypto = require('crypto');

async function getCobalt(url, isAudio = false) {
    try {
        const res = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            vCodec: 'h264',
            vQuality: '720',
            aFormat: 'mp3',
            filenamePattern: 'classic',
            isAudioOnly: isAudio
        }, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' } });

        if (res.data?.url) return { download: res.data.url, title: 'Cobalt Media' };
        throw new Error('No URL');
    } catch (e) { throw e; }
}

async function getSavetube(url, isAudio = false) {
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

    try {
        const cdnRes = await axios.get(`${savetube.api.base}${savetube.api.cdn}`, { headers: savetube.headers });
        const cdn = cdnRes.data.cdn;

        const infoRes = await axios.post(`https://${cdn}${savetube.api.info}`, { url: `https://www.youtube.com/watch?v=${videoId}` }, { headers: savetube.headers });
        const decrypted = await savetube.crypto.decrypt(infoRes.data.data);

        const videoQuality = '720';
        const audioQuality = '128';

        const dlRes = await axios.post(`https://${cdn}${savetube.api.download}`, {
            id: videoId,
            downloadType: isAudio ? 'audio' : 'video',
            quality: isAudio ? audioQuality : videoQuality,
            key: decrypted.key
        }, { headers: savetube.headers });

        if (dlRes.data?.data?.downloadUrl) return { download: dlRes.data.data.downloadUrl, title: decrypted.title || 'YouTube Video' };
        throw new Error('Savetube failed');
    } catch (e) {
        throw e;
    }
}

async function downloadYouTube(url, type = 'video') {
    const isAudio = type === 'mp3' || type === 'audio';
    try { return await getCobalt(url, isAudio); } catch (e) { }
    try { return await getSavetube(url, isAudio); } catch (e) { }
    return null;
}

module.exports = { downloadYouTube };
