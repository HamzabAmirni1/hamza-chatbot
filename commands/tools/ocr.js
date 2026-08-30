/**
 * 🔍 OCR - IMAGE TO TEXT
 * Adapted from silana-lite-ofc-master (ocr.js)
 * Extracts text from images using OCR.space free API
 * Usage: Send image + .ocr (or reply to image with .ocr)
 */

const axios = require('axios');
const FormData = require('form-data');
const config = require('../../config');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { analyzeImage } = require('../../lib/ai');

async function downloadImage(msg) {
    const msgContent = msg.message;
    const quotedMsg = msgContent?.extendedTextMessage?.contextInfo?.quotedMessage;

    let imageMsg = null;
    if (quotedMsg?.imageMessage) imageMsg = quotedMsg.imageMessage;
    else if (msgContent?.imageMessage) imageMsg = msgContent.imageMessage;

    if (imageMsg) {
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        return { buffer, mimetype: imageMsg.mimetype || 'image/jpeg' };
    }
    return null;
}

async function fallbackOCR(buffer, mimetype, lang = 'ara') {
    const OCR_KEY = 'helloworld'; 
    const form = new FormData();
    form.append('base64Image', `data:${mimetype};base64,${buffer.toString('base64')}`);
    form.append('language', lang);
    form.append('OCREngine', '2');
    form.append('apikey', OCR_KEY);

    const res = await axios.post('https://api.ocr.space/parse/image', form, {
        headers: form.getHeaders(),
        timeout: 20000,
    });
    return res.data.ParsedResults?.[0]?.ParsedText || null;
}

module.exports = async (sock, sender, msg, args) => {
    const hasImage = msg.message?.imageMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

    if (!hasImage) {
        return await sock.sendMessage(sender, {
            text: `🔍 *أفضل أداة استخراج النص من الصور (OCR AI)*\n\n` +
                  `📌 *الاستخدام:*\n` +
                  `• أرسل صورة مع الأمر *.ocr*\n` +
                  `• أو رد على صورة بالأمر *.ocr*\n\n` +
                  `💡 *ملاحظة:* البوت يستعمل الآن الذكاء الاصطناعي (Gemini 1.5) للحصول على أدق النتائج حتى في الخطوط الصعبة.\n\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(sender, { text: '🔍 *جاري استخراج النص باستخدام الذكاء الاصطناعي...*' }, { quoted: msg });

        const image = await downloadImage(msg);
        if (!image) throw new Error('تعذر تحميل الصورة');

        // Primary: AI OCR (Superior for Arabic/Handwriting)
        let extractedText = await analyzeImage(image.buffer, image.mimetype, "Extract all text from this image exactly. Do not add any explanation or conversational text. Just the raw text.");

        // Fallback: OCR.space
        if (!extractedText || extractedText.includes("Error") || extractedText.includes("عذرا")) {
            console.log("[OCR] AI failed, falling back to OCR.space...");
            extractedText = await fallbackOCR(image.buffer, image.mimetype);
        }

        if (!extractedText) throw new Error('لم يتم العثور على نص قابل للقراءة');

        await sock.sendMessage(sender, {
            text: `✅ *النص المستخرج:*\n\n` +
                  `━━━━━━━━━━━━━━━━\n` +
                  `${extractedText}\n` +
                  `━━━━━━━━━━━━━━━━\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });

    } catch (err) {
        console.error('[OCR Error]:', err.message);
        await sock.sendMessage(sender, {
            text: `❌ *فشل استخراج النص*\n${err.message}\n\n⚔️ ${config.botName}`
        }, { quoted: msg });
    }
};

