const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

function detectLanguage(text = '') {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? 'ar' : 'en';
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.imageMessage;

    if (!quoted && !msg.message?.imageMessage) {
        return await sock.sendMessage(chatId, { text: "📌 *Smart Image Analyzer*\n\nEx: Reply to an image + .analyze what is this?" }, { quoted: msg });
    }

    try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const mediaMsg = msg.message?.imageMessage ? msg : { message: quoted };
        const imgBuffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, { logger: { level: 'silent' } });

        const userPrompt = args.join(" ").trim() || "What is this image?";
        const detectedLang = detectLanguage(userPrompt);

        await sock.sendMessage(chatId, { text: "⏳ *Scanning image...*" }, { quoted: msg });

        // Upload to Catbox for public URL
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', imgBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

        const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders(), timeout: 30000 });
        const imageUrl = uploadRes.data.trim();

        if (!imageUrl.startsWith('http')) throw new Error("Upload failed");

        const conversationId = crypto.randomUUID();
        const payload = {
            message: userPrompt,
            language: detectedLang,
            model: "gemini-3-flash-preview",
            tone: "default",
            length: "moderate",
            conversation_id: conversationId,
            image_urls: [imageUrl],
            stream_url: "/api/v2/homework/stream"
        };

        const response = await axios.post('https://notegpt.io/api/v2/homework/stream', payload, {
            headers: { 'Content-Type': 'application/json', 'Origin': 'https://notegpt.io', 'Referer': 'https://notegpt.io/ai-answer-generator', 'User-Agent': 'Mozilla/5.0' },
            responseType: 'stream'
        });

        let fullText = '';
        await new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonStr = line.slice(6);
                            if (!jsonStr) continue;
                            const data = JSON.parse(jsonStr);
                            if (data.text) fullText += data.text;
                            if (data.done) resolve();
                        } catch (e) { }
                    }
                }
            });
            response.data.on('end', () => resolve());
            response.data.on('error', (e) => reject(e));
        });

        if (!fullText) throw new Error("No response received.");
        await sock.sendMessage(chatId, { text: `🤖 *Analysis:*\n\n${fullText}` }, { quoted: msg });

    } catch (err) {
        console.error(err);
        await sock.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    }
};
