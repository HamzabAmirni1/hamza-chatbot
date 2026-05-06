const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.stickerMessage ? msg.message : null;
    const isSticker = quoted?.stickerMessage;

    if (!isSticker) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║   🖼️ *STICKER TO IMG* ║\n╚══════════════════╝\n\n⚠️ *يرجى الرد على ستيكر (Sticker)*\n\n*الوظيفة:* تحويل الملصق إلى صورة.\n─────────────────────\n🚀 *Hamza Amirni Bot*`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: msg.key } });

    try {
        const stream = await downloadContentFromMessage(quoted.stickerMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const tempWebp = path.join(process.cwd(), `tmp/${crypto.randomBytes(6).toString('hex')}.webp`);
        const tempPng = path.join(process.cwd(), `tmp/${crypto.randomBytes(6).toString('hex')}.png`);

        await fs.ensureDir(path.dirname(tempWebp));
        await fs.writeFile(tempWebp, buffer);

        // Use ffmpeg to convert webp to png
        exec(`ffmpeg -i ${tempWebp} ${tempPng}`, async (err) => {
            if (err) {
                console.error(err);
                throw new Error("فشل تحويل الملصق");
            }

            const pngBuffer = await fs.readFile(tempPng);

            await sock.sendMessage(chatId, {
                image: pngBuffer,
                caption: `✅ *تم التحويل بنجاح!*\n🚀 *Hamza Amirni Bot*`
            }, { quoted: msg });

            // Cleanup
            await fs.remove(tempWebp);
            await fs.remove(tempPng);
            await sock.sendMessage(chatId, { react: { text: '✨', key: msg.key } });
        });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(chatId, { text: `❌ حدث خطأ: ${e.message}` }, { quoted: msg });
    }
};
