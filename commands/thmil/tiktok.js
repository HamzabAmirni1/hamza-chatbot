const axios = require('axios');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const url = args[0];
        if (!url || !/(tiktok.com)/.test(url)) return sock.sendMessage(chatId, { text: "المرجو وضع رابط تيكتوك صحيح." }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '⌛', key: msg.key } });

        const encodedParams = new URLSearchParams();
        encodedParams.set("url", url);
        encodedParams.set("hd", "1");

        const response = await axios({
            method: "POST",
            url: "https://tikwm.com/api/",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                Cookie: "current_language=en",
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
            },
            data: encodedParams,
        });

        let res = response.data.data;
        
        if (!res || !res.play) throw new Error("لم يتم العثور على الفيديو أو الرابط غير صالح.");

        await sock.sendMessage(chatId, {
            video: { url: res.play },
            caption: `✅ *TikTok Download*\n\n${res.title ? `📌 ${res.title}\n` : ''}⚔️ ${settings.botName}`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ فشل التحميل: ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
