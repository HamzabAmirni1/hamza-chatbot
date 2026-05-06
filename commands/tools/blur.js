const jimp = require('jimp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');

module.exports = async (sock, chatId, msg, args) => {
    let q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
    let mime = (q.imageMessage || q.documentWithCaptionMessage?.message?.imageMessage)?.mimetype || "";

    // Check if the message itself is an image
    if (!mime.startsWith("image/") && msg.message?.imageMessage) {
        q = msg.message;
        mime = msg.message.imageMessage.mimetype;
    }

    if (!mime.startsWith("image/")) {
        // Try profile picture
        try {
            const targetJid = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || chatId;
            const ppUrl = await sock.profilePictureUrl(targetJid, 'image').catch(() => null);
            if (ppUrl) {
                const axios = require('axios');
                const { data } = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                q = { buffer: Buffer.from(data) };
            } else {
                return await sock.sendMessage(chatId, {
                    text: `⚠️ *يرجى الرد على صورة أو إشارة لشخص لعمل Blur*`
                }, { quoted: msg });
            }
        } catch (e) {
            return await sock.sendMessage(chatId, {
                text: `⚠️ *يرجى الرد على صورة*`
            }, { quoted: msg });
        }
    }

    const level = args[0] || '5';
    await sock.sendMessage(chatId, { react: { text: "🌫️", key: msg.key } });

    try {
        let buffer;
        if (q.buffer) {
            buffer = q.buffer;
        } else {
            const quotedMsg = { message: q };
            buffer = await downloadMediaMessage(
                quotedMsg,
                "buffer",
                {},
                { logger: pino({ level: "silent" }) },
            );
        }

        const img = await jimp.read(buffer);
        img.blur(isNaN(level) ? 5 : parseInt(level));
        const finalBuffer = await img.getBufferAsync(jimp.MIME_JPEG);

        await sock.sendMessage(chatId, {
            image: finalBuffer,
            caption: `🌫️ *Blur Level: ${level}*`
        }, { quoted: msg });

    } catch (e) {
        console.error("Blur Error:", e);
        await sock.sendMessage(chatId, {
            text: "❌ فشلت العملية."
        }, { quoted: msg });
    }
};
