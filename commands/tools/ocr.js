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

async function downloadImage(msg) {
    // Check quoted first, then direct image
    const msgContent = msg.message;
    const quotedMsg = msgContent?.extendedTextMessage?.contextInfo?.quotedMessage;

    let imageMsg = null;

    if (quotedMsg?.imageMessage) {
        imageMsg = quotedMsg.imageMessage;
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        return { buffer, mimetype: imageMsg.mimetype || 'image/jpeg' };
    } else if (msgContent?.imageMessage) {
        imageMsg = msgContent.imageMessage;
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        return { buffer, mimetype: imageMsg.mimetype || 'image/jpeg' };
    }

    return null;
}

async function extractTextFromImage(buffer, mimetype, lang = 'ara') {
    // OCR.space free API (no key required for basic use, or use free key)
    // Free API key - rate limited but works for basic use
    const OCR_KEY = 'helloworld'; // Free public demo key

    const form = new FormData();
    form.append('base64Image', `data:${mimetype};base64,${buffer.toString('base64')}`);
    form.append('language', lang);
    form.append('isOverlayRequired', 'false');
    form.append('detectOrientation', 'true');
    form.append('scale', 'true');
    form.append('OCREngine', '2'); // More accurate engine
    form.append('apikey', OCR_KEY);

    const res = await axios.post('https://api.ocr.space/parse/image', form, {
        headers: form.getHeaders(),
        timeout: 30000,
    });

    const data = res.data;
    if (data.IsErroredOnProcessing) {
        throw new Error(data.ErrorMessage?.[0] || 'OCR processing failed');
    }

    const parsedResults = data.ParsedResults;
    if (!parsedResults || parsedResults.length === 0) {
        throw new Error('لم يتم العثور على نص في الصورة');
    }

    const text = parsedResults.map(r => r.ParsedText).join('\n').trim();
    if (!text) throw new Error('الصورة لا تحتوي على نص قابل للقراءة');

    return text;
}

module.exports = async (sock, sender, msg, args) => {
    // Detect language preference from args
    const langArg = args[0] || 'ara';
    const langMap = {
        'ar': 'ara', 'ara': 'ara', 'عربي': 'ara',
        'en': 'eng', 'eng': 'eng', 'english': 'eng',
        'fr': 'fre', 'fre': 'fre', 'french': 'fre',
        'es': 'spa', 'spa': 'spa',
        'de': 'deu', 'deu': 'deu',
        'auto': 'auto'
    };
    const ocrLang = langMap[langArg.toLowerCase()] || 'ara';

    // Check if there's an image
    const hasDirectImage = !!msg.message?.imageMessage;
    const hasQuotedImage = !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

    if (!hasDirectImage && !hasQuotedImage) {
        return await sock.sendMessage(sender, {
            text: `🔍 *استخراج النص من الصور | OCR*\n\n` +
                  `📌 *الاستخدام:*\n` +
                  `• أرسل صورة مع الأمر *.ocr*\n` +
                  `• أو رد على صورة بالأمر *.ocr*\n\n` +
                  `📌 *تحديد اللغة (اختياري):*\n` +
                  `• .ocr ar → عربي (افتراضي)\n` +
                  `• .ocr en → إنجليزي\n` +
                  `• .ocr fr → فرنسي\n` +
                  `• .ocr auto → تلقائي\n\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(sender, {
            text: '🔍 *جاري استخراج النص من الصورة...*'
        }, { quoted: msg });

        const image = await downloadImage(msg);
        if (!image) throw new Error('تعذر تحميل الصورة');

        const extractedText = await extractTextFromImage(image.buffer, image.mimetype, ocrLang);

        const langNames = { 'ara': 'عربي 🇲🇦', 'eng': 'إنجليزي 🇬🇧', 'fre': 'فرنسي 🇫🇷', 'spa': 'إسباني 🇪🇸', 'deu': 'ألماني 🇩🇪', 'auto': 'تلقائي 🌐' };

        await sock.sendMessage(sender, {
            text: `✅ *النص المستخرج:*\n` +
                  `🌍 اللغة: ${langNames[ocrLang] || ocrLang}\n` +
                  `📊 عدد الأحرف: ${extractedText.length}\n\n` +
                  `━━━━━━━━━━━━━━━━\n` +
                  `${extractedText}\n` +
                  `━━━━━━━━━━━━━━━━\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });

    } catch (err) {
        console.error('[OCR Error]:', err.message);
        await sock.sendMessage(sender, {
            text: `❌ *فشل استخراج النص*\n${err.message}\n\n💡 تأكد من أن الصورة واضحة وتحتوي على نص.\n⚔️ ${config.botName}`
        }, { quoted: msg });
    }
};
