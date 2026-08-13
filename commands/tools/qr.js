/**
 * 📱 QR CODE GENERATOR
 * Adapted from silana-lite-ofc-master (qr.js)
 * Generates a QR code image from text or URL
 * Usage: .qr text or URL
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

async function generateQR(input) {
    const tmpDir = path.join(__dirname, '../../tmp');
    fs.ensureDirSync(tmpDir);
    const tmpOut = path.join(tmpDir, `qr_${Date.now()}.png`);

    // Use goqr.me API - free, no key needed, returns PNG directly
    const encoded = encodeURIComponent(input);
    const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encoded}&size=512x512&color=000000&bgcolor=FFFFFF&margin=20&format=png`;

    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
    });

    fs.writeFileSync(tmpOut, Buffer.from(res.data));
    return tmpOut;
}

module.exports = async (sock, sender, msg, args) => {
    const input = args.join(' ');

    if (!input) {
        return await sock.sendMessage(sender, {
            text: `📱 *مولّد رمز QR | QR Code Generator*\n\n` +
                  `📌 *الاستخدام:*\n` +
                  `*.qr النص أو الرابط*\n\n` +
                  `📌 *أمثلة:*\n` +
                  `• .qr https://google.com\n` +
                  `• .qr مرحبا بك في البوت\n` +
                  `• .qr +212600000000\n\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });
    }

    let tmpPath = null;
    try {
        await sock.sendMessage(sender, { text: '⏳ *جاري توليد رمز QR...*' }, { quoted: msg });

        tmpPath = await generateQR(input);

        const isUrl = input.startsWith('http://') || input.startsWith('https://');
        const caption = `✅ *رمز QR جاهز!*\n\n` +
                        `📋 *المحتوى:* ${input.length > 60 ? input.slice(0, 60) + '...' : input}\n` +
                        `🔗 *النوع:* ${isUrl ? 'رابط URL' : 'نص'}\n\n` +
                        `⚔️ ${config.botName}`;

        await sock.sendMessage(sender, {
            image: { url: tmpPath },
            caption
        }, { quoted: msg });

    } catch (err) {
        console.error('[QR Error]:', err.message);
        await sock.sendMessage(sender, {
            text: `❌ *فشل توليد رمز QR*\n${err.message}\n⚔️ ${config.botName}`
        }, { quoted: msg });
    } finally {
        if (tmpPath) {
            try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
    }
};
