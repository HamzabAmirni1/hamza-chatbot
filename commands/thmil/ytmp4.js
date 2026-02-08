// plugin by hamza amirni
const axios = require('axios');
const crypto = require('crypto');

const savetube = {
    api: {
        base: "https://media.savetube.me/api",
        cdn: "/random-cdn",
        info: "/v2/info",
        download: "/download"
    },
    headers: {
        'accept': '*/*',
        'content-type': 'application/json',
        'origin': 'https://yt.savetube.me',
        'referer': 'https://yt.savetube.me/',
        'user-agent': 'Postify/1.0.0'
    },
    formats: ['144', '240', '360', '480', '720', '1080', 'mp3'],

    crypto: {
        hexToBuffer: (hexString) => {
            const matches = hexString.match(/.{1,2}/g);
            return Buffer.from(matches.join(''), 'hex');
        },

        decrypt: async (enc) => {
            try {
                const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
                const data = Buffer.from(enc, 'base64');
                const iv = data.slice(0, 16);
                const content = data.slice(16);
                const key = savetube.crypto.hexToBuffer(secretKey);

                const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
                let decrypted = decipher.update(content);
                decrypted = Buffer.concat([decrypted, decipher.final()]);

                return JSON.parse(decrypted.toString());
            } catch (error) {
                throw new Error(`${error.message}`);
            }
        }
    },

    isUrl: str => {
        try {
            new URL(str);
            return true;
        } catch (_) {
            return false;
        }
    },

    youtube: url => {
        if (!url) return null;
        const patterns = [
            /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/
        ];
        for (let pattern of patterns) {
            if (pattern.test(url)) return url.match(pattern)[1];
        }
        return null;
    },

    request: async (endpoint, data = {}, method = 'post') => {
        try {
            const { data: response } = await axios({
                method,
                url: `${endpoint.startsWith('http') ? '' : savetube.api.base}${endpoint}`,
                data: method === 'post' ? data : undefined,
                params: method === 'get' ? data : undefined,
                headers: savetube.headers
            });
            return {
                status: true,
                code: 200,
                data: response
            };
        } catch (error) {
            return {
                status: false,
                code: error.response?.status || 500,
                error: error.message
            };
        }
    },

    getCDN: async () => {
        const response = await savetube.request(savetube.api.cdn, {}, 'get');
        if (!response.status) return response;
        return {
            status: true,
            code: 200,
            data: response.data.cdn
        };
    },

    download: async (link, format) => {
        if (!link) {
            return {
                status: false,
                code: 400,
                error: "Please provide a link."
            };
        }

        if (!savetube.isUrl(link)) {
            return {
                status: false,
                code: 400,
                error: "Invalid link! Please enter a valid YouTube link."
            };
        }

        if (!format || !savetube.formats.includes(format)) {
            return {
                status: false,
                code: 400,
                error: "Invalid format! Choose from the available formats.",
                available_fmt: savetube.formats
            };
        }

        const id = savetube.youtube(link);
        if (!id) {
            return {
                status: false,
                code: 400,
                error: "Cannot extract YouTube video ID. Please check the link."
            };
        }

        try {
            const cdnx = await savetube.getCDN();
            if (!cdnx.status) return cdnx;
            const cdn = cdnx.data;

            const result = await savetube.request(`https://${cdn}${savetube.api.info}`, {
                url: `https://www.youtube.com/watch?v=${id}`
            });
            if (!result.status) return result;
            const decrypted = await savetube.crypto.decrypt(result.data.data);

            const dl = await savetube.request(`https://${cdn}${savetube.api.download}`, {
                id: id,
                downloadType: format === 'mp3' ? 'audio' : 'video',
                quality: format === 'mp3' ? '128' : format,
                key: decrypted.key
            });

            return {
                status: true,
                code: 200,
                result: {
                    title: decrypted.title || "Unknown",
                    type: format === 'mp3' ? 'audio' : 'video',
                    format: format,
                    thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
                    download: dl.data.data.downloadUrl,
                    id: id,
                    key: decrypted.key,
                    duration: decrypted.duration,
                    quality: format === 'mp3' ? '128' : format,
                    downloaded: dl.data.data.downloaded || false
                }
            };

        } catch (error) {
            return {
                status: false,
                code: 500,
                error: error.message
            };
        }
    }
};

const handler = async (sock, chatId, msg, args, commands, userLang) => {
    const command = (msg.text || msg.body || '').split(' ')[0].slice(1); // Basic command extract

    if (args.length < 1) return sock.sendMessage(chatId, { text: `Format:\n- *ytmp4 <url> [quality]* (for video)\n- *ytmp3 <url>* (for audio)\n\n*Available quality:* 144, 240, 360, 480, 720, 1080 (default: 720p for video)` }, { quoted: msg });

    let url = args[0];
    let format = command.includes('mp3') ? 'mp3' : args[1] || '720';

    if (!savetube.isUrl(url)) return sock.sendMessage(chatId, { text: "Please enter a valid YouTube link." }, { quoted: msg });

    try {
        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
        let res = await savetube.download(url, format);
        if (!res.status) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
            return sock.sendMessage(chatId, { text: `*Error:* ${res.error}` }, { quoted: msg });
        }

        let { title, download, type } = res.result;

        if (type === 'video') {
            await sock.sendMessage(chatId, {
                video: { url: download },
                caption: `🎬 *${title}*\n✅ Savetube Downloader`
            }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, {
                audio: { url: download },
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`,
                ppt: false
            }, { quoted: msg });
        }
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
    } catch (e) {
        sock.sendMessage(chatId, { text: `*Download failed!*` }, { quoted: msg });
    }
};

module.exports = handler;
