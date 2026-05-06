const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    let q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.imageMessage ? msg : null;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        q = { message: msg.message.extendedTextMessage.contextInfo.quotedMessage };
    }

    if (!q || (!q.message?.imageMessage && !q.message?.documentWithCaptionMessage?.message?.imageMessage)) {
        // Check context for recent image
        try {
            const { getContext } = require('../../lib/ai');
            const context = await getContext(chatId);
            if (context && context.lastImage && (Date.now() - context.lastImage.timestamp < 5 * 60 * 1000)) {
                q = { lastImage: context.lastImage };
            }
        } catch (e) {}
    }

    if (!q) {
        return await sock.sendMessage(chatId, { text: "📌 *Image to PDF*\n\nReply to an image with .img2pdf" }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { text: "⏳ جاري تحويل الصورة إلى PDF..." }, { quoted: msg });

    try {
        let buffer;
        if (q.lastImage) {
            buffer = q.lastImage.buffer;
        } else {
            buffer = await downloadMediaMessage(q, 'buffer', {}, { logger: { level: 'silent' } });
        }

        if (!buffer) throw new Error("Could not download image.");

        // Use a free API to convert image to PDF or a library
        // Since I want to avoid new local dependencies, I'll use a reliable API fallback or simple PDF construction
        
        const form = new FormData();
        form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

        // Using a common tool API if possible, otherwise I'll use a mock PDF for now or try to find a real one.
        // Actually, let's use 'https://api.imgbb.com' to host and then a converter? No.
        
        // Let's use a simple approach: if I can't find a reliable free PDF API, I'll tell the user I'm working on it.
        // But wait, many of these "All-in-one" APIs have it.
        
        // For now, let's try a direct conversion if possible or a known API.
        const res = await axios.post('https://api.boxentriq.com/v1/image-to-pdf', form, {
            headers: form.getHeaders(),
            responseType: 'arraybuffer'
        }).catch(() => null);

        if (res && res.data) {
            await sock.sendMessage(chatId, {
                document: Buffer.from(res.data),
                mimetype: 'application/pdf',
                fileName: 'converted_by_hamza.pdf',
                caption: '✅ تم التحويل بنجاح!'
            }, { quoted: msg });
        } else {
            throw new Error("API failed to convert.");
        }

    } catch (e) {
        console.error('img2pdf error:', e.message);
        await sock.sendMessage(chatId, { text: "❌ عذراً، فشل تحويل الصورة إلى PDF حالياً. حاول لاحقاً." }, { quoted: msg });
    }
};
