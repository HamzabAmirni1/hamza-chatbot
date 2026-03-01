const axios = require('axios');
const FormData = require('form-data');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.imageMessage;

    if (!quoted && !msg.message?.imageMessage) {
        return await sock.sendMessage(chatId, { text: "✂️ *Pixa Remove-BG*\n\nEx: Reply to an image + .removebg" }, { quoted: msg });
    }

    try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const media = msg.message?.imageMessage ? msg : { message: quoted };
        const imgBuffer = await downloadMediaMessage(media, 'buffer', {}, { logger: { level: 'silent' } });

        await sock.sendMessage(chatId, { text: "⏳ *Removing background...*" }, { quoted: msg });

        let form = new FormData();
        form.append('image', imgBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
        form.append('format', 'png');
        form.append('model', 'v1');

        const res = await axios.post('https://api2.pixelcut.app/image/matte/v1', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
                'x-locale': 'en',
                'x-client-version': 'web:pixa.com:4a5b0af2',
                'origin': 'https://www.pixa.com',
                'referer': 'https://www.pixa.com/',
            },
            responseType: 'arraybuffer'
        });

        if (res.status === 200) {
            await sock.sendMessage(chatId, { image: Buffer.from(res.data), caption: `✂️ *Background Removed!*` }, { quoted: msg });
        } else throw new Error("Processing failed");

    } catch (err) {
        console.error(err);
        await sock.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    }
};
