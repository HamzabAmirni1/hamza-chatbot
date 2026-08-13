const axios = require('axios');

async function testApi(url) {
    try {
        const res = await axios.get(url, { timeout: 15000 });
        console.log(`[SUCCESS] ${url}:`, JSON.stringify(res.data).substring(0, 300));
    } catch (e) {
        console.log(`[FAILED] ${url}:`, e.response?.status || e.message);
    }
}

async function run() {
    const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const apis = [
        `https://api.vreden.my.id/api/ytmp4?url=${videoUrl}`,
        `https://api.agatz.xyz/api/ytmp3?url=${videoUrl}`,
        `https://api.dreaded.site/api/ytdl/audio?url=${videoUrl}`,
        `https://api.dreaded.site/api/ytdl/video?url=${videoUrl}`,
        `https://api.siputzx.my.id/api/ytmp4?url=${videoUrl}`,
        `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${videoUrl}`,
        `https://api.zenkey.my.id/api/download/ytmp4?url=${videoUrl}`,
        `https://api.hanggts.xyz/download/youtube-video?url=${videoUrl}`
    ];

    for (const api of apis) {
        await testApi(api);
    }
}

run();
