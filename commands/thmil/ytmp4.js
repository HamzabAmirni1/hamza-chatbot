const axios = require('axios');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args) => {
    if (!args[0]) return sock.sendMessage(chatId, { text: 'المرجو وضع رابط يوتيوب.' }, { quoted: msg });

    const url = args[0];
    const quality = args[1] || '720';

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    try {
        const apis = [
            `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(url)}`,
            `https://api.vreden.web.id/api/ytmp4?url=${encodeURIComponent(url)}`,
            `https://p.savenow.to/ajax/download.php?copyright=0&format=${quality}&url=${encodeURIComponent(url)}&api=dfcb6d76f2f6a9894gjkege8a4ab232222`
        ];

        let downloadUrl = null;
        let title = 'Video';

        for (const api of apis) {
            try {
                const res = await axios.get(api, { timeout: 15000 });
                const data = res.data;
                if (data.status || data.success || data.progress_url) {
                    if (data.progress_url) {
                        // Savenow logic
                        for (let i = 0; i < 20; i++) {
                            const status = await axios.get(data.progress_url);
                            if (status.data?.download_url) {
                                downloadUrl = status.data.download_url;
                                title = data.info?.title || title;
                                break;
                            }
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    } else {
                        downloadUrl = data.data?.download || data.result?.download || data.data?.url || data.result?.url;
                        title = data.data?.title || data.result?.title || title;
                    }
                    if (downloadUrl) break;
                }
            } catch (e) { }
        }

        if (!downloadUrl) throw new Error("Failed to download video.");

        await sock.sendMessage(chatId, {
            video: { url: downloadUrl },
            caption: `🎬 *${title}*\n\n🚀 ${settings.botName}`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
