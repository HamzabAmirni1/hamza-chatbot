const { downloadYouTube, getBuffer } = require('../../lib/ytdl');

const handler = async (sock, chatId, msg, args, helpers, userLang) => {
    // Extract command from msg text or helpers
    const text = (msg.text || msg.body || '').toLowerCase();
    const isMp3 = text.includes('mp3') || text.includes('song') || text.includes('audio');

    if (args.length < 1) {
        return sock.sendMessage(chatId, {
            text: `Format:\n- *ytmp4 <url> [quality]* (for video)\n- *ytmp3 <url>* (for audio)\n\n*Available quality:* 360, 480, 720 (default: 720p)`
        }, { quoted: msg });
    }

    let url = args[0];
    if (!url.startsWith('http')) {
        return sock.sendMessage(chatId, { text: "Please enter a valid YouTube link." }, { quoted: msg });
    }

    try {
        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

        const type = isMp3 ? 'audio' : 'video';
        const res = await downloadYouTube(url, type);

        if (!res || !res.download) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
            return sock.sendMessage(chatId, { text: `*Error:* All download methods failed for this video.` }, { quoted: msg });
        }

        const { title, download } = res;

        if (!isMp3) {
            try {
                await sock.sendMessage(chatId, {
                    video: { url: download },
                    caption: `🎬 *${title}*\n🚀 Downloaded via Hamza Bot`
                }, { quoted: msg });
            } catch (e) {
                console.log("[YTMP4] Video direct send failed, trying buffer...");
                const buffer = await getBuffer(download, res.referer);
                if (buffer) {
                    await sock.sendMessage(chatId, {
                        video: buffer,
                        caption: `🎬 *${title}*\n🚀 Downloaded via Hamza Bot (Buffer)`
                    }, { quoted: msg });
                } else throw e;
            }
        } else {
            try {
                await sock.sendMessage(chatId, {
                    audio: { url: download },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    contextInfo: {
                        externalAdReply: {
                            title: title,
                            body: "Hamza Bot YouTube Downloader",
                            mediaType: 1,
                            sourceUrl: url
                        }
                    }
                }, { quoted: msg });
            } catch (e) {
                console.log("[YTMP3] Audio direct send failed, trying buffer...");
                const buffer = await getBuffer(download, res.referer);
                if (buffer) {
                    await sock.sendMessage(chatId, {
                        audio: buffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${title}.mp3`
                    }, { quoted: msg });
                } else throw e;
            }
        }

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("YTMP4 Error:", e);
        sock.sendMessage(chatId, { text: `*Download failed!*` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};

module.exports = handler;
