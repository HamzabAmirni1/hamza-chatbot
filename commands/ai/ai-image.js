const axios = require('axios');
const config = require('../../config');
const { translateToEn } = require('../../lib/ai');

const aiLabs = {
    api: {
        base: 'https://text2pet.zdex.top',
        endpoints: {
            images: '/images'
        }
    },
    headers: {
        'user-agent': 'NB Android/1.0.0',
        'accept-encoding': 'gzip',
        'content-type': 'application/json',
        authorization: ''
    },
    state: { token: null },
    setup: {
        cipher: 'hbMcgZLlzvghRlLbPcTbCpfcQKM0PcU0zhPcTlOFMxBZ1oLmruzlVp9remPgi0QWP0QW',
        shiftValue: 3,
        dec(text, shift) {
            return [...text].map(c =>
                /[a-z]/.test(c) ?
                    String.fromCharCode((c.charCodeAt(0) - 97 - shift + 26) % 26 + 97) :
                    /[A-Z]/.test(c) ?
                        String.fromCharCode((c.charCodeAt(0) - 65 - shift + 26) % 26 + 65) :
                        c
            ).join('');
        },
        decrypt: async () => {
            if (aiLabs.state.token) return aiLabs.state.token;
            const decrypted = aiLabs.setup.dec(aiLabs.setup.cipher, aiLabs.setup.shiftValue);
            aiLabs.state.token = decrypted;
            aiLabs.headers.authorization = decrypted;
            return decrypted;
        }
    },
    generateImage: async (prompt = '') => {
        if (!prompt?.trim()) {
            return { success: false, error: 'Empty prompt' };
        }
        await aiLabs.setup.decrypt();
        try {
            const payload = { prompt };
            const url = aiLabs.api.base + aiLabs.api.endpoints.images;
            const res = await axios.post(url, payload, { headers: aiLabs.headers });
            if (res.data.code !== 0 || !res.data.data) {
                return { success: false, error: 'Server failed to generate image.' };
            }
            return { success: true, url: res.data.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(chatId, { text: "🎨 *توليد صور بالذكاء الاصطناعي*\n\nالمرجو كتابة وصف الصورة.\n\n📌 مثال: .ai-image neon city" }, { quoted: msg });
    }

    try {
        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
        await sock.sendMessage(chatId, { text: "🎨 جاري توليد الصورة... المرجو الانتظار." }, { quoted: msg });

        const enPrompt = await translateToEn(text);
        const response = await aiLabs.generateImage(enPrompt);

        if (response.success) {
            await sock.sendMessage(chatId, {
                image: { url: response.url },
                caption: `🎨 *AI Image Labs* ⚔️\n\n📝 *الوصف:* ${text}\n⚔️ ${config.botName}`
            }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } });
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('ai-image error:', error);
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
        await sock.sendMessage(chatId, { text: `❌ فشل توليد الصورة: ${error.message}` }, { quoted: msg });
    }
};
