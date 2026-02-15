const axios = require('axios');
const settings = require('../settings');
const { t } = require('../lib/language');

class YouTubeDownloader {
    constructor() {
        this.baseUrl = 'https://p.savenow.to'
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://y2down.cc/',
            'Origin': 'https://y2down.cc'
        }
    }

    async request(url, format) {
        try {
            const res = await axios.get(`${this.baseUrl}/ajax/download.php`, {
                params: {
                    copyright: '0',
                    format,
                    url,
                    api: 'dfcb6d76f2f6a9894gjkege8a4ab232222'
                },
                headers: this.headers
            });

            if (!res.data?.progress_url) return null;

            return {
                progress: res.data.progress_url,
                title: res.data.info?.title || 'YouTube Video'
            };
        } catch (e) {
            console.error("Savenow Request Error:", e.message);
            return null;
        }
    }

    async wait(progressUrl) {
        for (let i = 0; i < 60; i++) {
            try {
                const res = await axios.get(progressUrl, { headers: this.headers });
                if (res.data?.download_url) return res.data.download_url;
                if (res.data?.error) return null;
            } catch (e) {
                console.error("Savenow Wait Error:", e.message);
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        return null;
    }

    async download(url, format) {
        const req = await this.request(url, format);
        if (!req) return null;

        const dl = await this.wait(req.progress);
        if (!dl) return null;

        return {
            downloadUrl: dl,
            title: req.title
        };
    }
}

function cleanFileName(text) {
    return text
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const url = args[0];
    const format = args[1] || '720';

    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
        return await sock.sendMessage(chatId, {
            text: `📥 *YouTube Downloader*\n\nDownload YouTube videos directly.\n\n📌 *Usage*\n.ytdl <youtube_url> [quality]\n\n🎥 *Video qualities*\n144, 240, 320, 480, 720, 1080, 1440, 4k\n\n⭐ *Default quality*\n720p (if not specified)\n\n🧪 *Example:*\n.ytdl https://youtu.be/9zvdMLfYFkM 720`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });
    await sock.sendMessage(chatId, { text: '⏳ *جاري المعالجة... المرجو الانتظار.*' }, { quoted: msg });

    try {
        const ytdl = new YouTubeDownloader();
        const data = await ytdl.download(url, format);

        if (!data) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return await sock.sendMessage(chatId, { text: '❌ فشل تحميل الفيديو. المرجو تجربة جودة أخرى أو رابط مغاير.' }, { quoted: msg });
        }

        // Check size
        const head = await axios.head(data.downloadUrl);
        const sizeMB = Number(head.headers['content-length'] || 0) / (1024 * 1024);

        if (sizeMB > 95) {
            await sock.sendMessage(chatId, { react: { text: '⚠️', key: msg.key } });
            return await sock.sendMessage(chatId, {
                text: `❌ الفيديو كبير جداً بالنسبة لـ WhatsApp (${sizeMB.toFixed(1)} MB)\n\n🔗 يمكنك تحميله مباشرة من هنا:\n${data.downloadUrl}`
            }, { quoted: msg });
        }

        const safeTitle = cleanFileName(data.title);

        await sock.sendMessage(chatId, {
            video: { url: data.downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${safeTitle}.mp4`,
            caption: `🎬 *${data.title}*\n\n📥 تم التحميل بنجاح بواسطة Hamza Bot`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error("YTDL Command Error:", e);
        await sock.sendMessage(chatId, { text: `❌ حدث خطأ غير متوقع: ${e.message}` }, { quoted: msg });
    }
};
