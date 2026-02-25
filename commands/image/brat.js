const axios = require('axios');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchBrat = async (text, attempt = 1) => {
    try {
        const response = await axios.get(`https://kepolu-brat.hf.space/brat`, {
            params: { q: text },
            responseType: 'arraybuffer',
            timeout: 30000,
        });
        return response.data;
    } catch (error) {
        if (error.response?.status === 429 && attempt <= 3) {
            const retryAfter = error.response.headers['retry-after'] || 5;
            await delay(retryAfter * 1000);
            return fetchBrat(text, attempt + 1);
        }
        throw error;
    }
};

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  🐸 *BRAT STICKER*  ║\n╚══════════════════╝\n\n✏️ *أضف النص بعد الأمر*\n\n*مثال:*\n.brat hamza amirni\n\n─────────────────────\n📸 instagram.com/hamza.amirni`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🐸', key: msg.key } });

    try {
        const buffer = await fetchBrat(text);

        await sock.sendMessage(chatId, {
            sticker: Buffer.from(buffer),
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Brat Error:', e.message);
        await sock.sendMessage(chatId, {
            text: `❌ *فشل إنشاء الستيكر*\n\n${e.message}`,
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
