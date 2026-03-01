const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

function detectLanguage(text = '') {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? 'ar' : 'en';
}

const { getContext, addToHistory } = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const { buffer: passedBuffer, isVideo, caption: autoCaption } = helpers || {};

    if (isVideo) return;

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.imageMessage;

    if (!passedBuffer && !quoted && !msg.message?.imageMessage) {
        return await sock.sendMessage(chatId, { text: "📌 *Smart Image Analyzer*\n\nEx: Reply to an image + .analyze what is this?" }, { quoted: msg });
    }

    let filePath = null;
    try {
        let imgBuffer;
        if (passedBuffer) {
            imgBuffer = passedBuffer;
        } else {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const mediaMsg = msg.message?.imageMessage ? msg : { message: quoted };
            imgBuffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, { logger: { level: 'silent' } });
        }

        if (!imgBuffer) throw new Error("Could not get image buffer.");

        // Save to temp file for FormData (like the requested plugin)
        filePath = path.join(__dirname, `../../tmp/temp_${Date.now()}.jpg`);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, imgBuffer);

        let userRequest = args.join(" ").trim() || autoCaption || "";

        const systemInstruction = `أنت مساعد ذكي متعدد اللغات (دارجة، فرنسية، إنجليزية). أجب مباشرة على سؤال المستخدم حول الصورة بأسلوب دردشة طبيعي وودي. ممنوع العناوين مثل ### Question أو Answer.`;

        if (!passedBuffer) {
            await sock.sendMessage(chatId, { text: "⏳ *Analyzing image...*" }, { quoted: msg });
        }

        // --- 1. Upload to Catbox ---
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', fs.createReadStream(filePath));

        const uploadRes = await axios.post('https://catbox.moe/user/api.php', formData, {
            headers: formData.getHeaders()
        });

        const imageUrl = uploadRes.data.trim();
        if (!imageUrl.startsWith('http')) throw new Error("Upload to Catbox failed.");

        const detectedLang = detectLanguage(userRequest);
        const conversationId = crypto.randomUUID();

        // --- 2. Call NoteGPT (Homework API) ---
        const payload = {
            message: `${systemInstruction}\n\nUser Question: ${userRequest || "علق على الصورة بذكاء بالدارجة"}`,
            language: detectedLang,
            model: "gemini-3-flash-preview", // Exactly like requested
            tone: "default",
            length: "moderate",
            conversation_id: conversationId,
            image_urls: [imageUrl],
            stream_url: "/api/v2/homework/stream"
        };

        const response = await axios.post('https://notegpt.io/api/v2/homework/stream', payload, {
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://notegpt.io',
                'Referer': 'https://notegpt.io/ai-answer-generator',
                'User-Agent': 'Mozilla/5.0'
            },
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
            setTimeout(() => resolve(), 30000); // 30s max
        });

        if (!fullText) throw new Error("No response received from AI.");

        // Cleanup: remove headers if they appear
        const finalReply = fullText
            .replace(/### Question \d+/gi, '')
            .replace(/### Answer/gi, '')
            .replace(/### Solution Steps/gi, '')
            .replace(/### Analysis/gi, '')
            .trim();

        // Save context
        addToHistory(chatId, "user", userRequest, { buffer: imgBuffer, mime: 'image/jpeg' });
        addToHistory(chatId, "assistant", finalReply);

        await sock.sendMessage(chatId, { text: finalReply }, { quoted: msg });

    } catch (err) {
        console.error(err);
        await sock.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    } finally {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
};
