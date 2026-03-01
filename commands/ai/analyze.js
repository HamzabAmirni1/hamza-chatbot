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

    // If it's a video, we might want to fall back or just handle it if it's an image
    if (isVideo) return; // Currently analyze logic only supports images

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.imageMessage;

    if (!passedBuffer && !quoted && !msg.message?.imageMessage) {
        return await sock.sendMessage(chatId, { text: "📌 *Smart Image Analyzer*\n\nEx: Reply to an image + .analyze what is this?" }, { quoted: msg });
    }

    try {
        let imgBuffer;
        if (passedBuffer) {
            imgBuffer = passedBuffer;
        } else {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const mediaMsg = msg.message?.imageMessage ? msg : { message: quoted };
            imgBuffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, { logger: { level: 'silent' } });
        }

        let userRequest = args.join(" ").trim() || autoCaption || "";

        const systemInstruction = `أنت مساعد ذكي تتواصل بالدارجة المغربية والعربية بشكل طبيعي جداً كأنك صديق.
المهمة: أجب على سؤال المستخدم المتعلق بالصورة مباشرة وبدون مقدمات رسمية.

⚠️ القواعد الذهبية:
1. الجواب يكون مباشر (ماتقولش "بناءً على الصورة" أو "التحليل" أو "تم العثور").
2. لا تستخدم أبداً عناوين مثل ### Question أو ### Answer أو ### Solution.
3. إذا سألك المستخدم سؤالاً، جاوبه عليه فوراً بناءً على ما تراه في الصورة.
4. إذا لم يطرح سؤالاً، علق على الصورة بذكاء واختصار.
5. استعمل الدارجة المغربية لأنها الأقرب للمستخدم.
6. ممنوع تماماً تنسيق الإجابة بشكل تقني أو أكاديمي.`;

        // --- Context Awareness ---
        const context = getContext(chatId);
        const history = context.messages.slice(-5); // Get last 5 messages for context
        let contextText = history.map(m => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`).join('\n');

        const finalPrompt = `${systemInstruction}\n\n` +
            (contextText ? `Previous Conversation:\n${contextText}\n\n` : "") +
            `Current User Request: "${userRequest || "علق على هذه الصورة بذكاء"}"`;

        const detectedLang = detectLanguage(userRequest);

        if (!passedBuffer) {
            await sock.sendMessage(chatId, { text: "⏳ *Scanning image...*" }, { quoted: msg });
        }

        // Upload to Catbox for public URL
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', imgBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

        const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders(), timeout: 30000 });
        const imageUrl = uploadRes.data.trim();

        if (!imageUrl.startsWith('http')) throw new Error("Upload failed");

        const conversationId = chatId.replace(/[^a-zA-Z0-9]/g, '-'); // Use chatId as conversationId for consistency
        const payload = {
            message: finalPrompt,
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

        // Save to history so the bot "remembers" the photo and the discussion
        addToHistory(chatId, "user", userPrompt, { buffer: imgBuffer, mime: 'image/jpeg' });
        addToHistory(chatId, "assistant", fullText);

        await sock.sendMessage(chatId, { text: fullText }, { quoted: msg });

    } catch (err) {
        console.error(err);
        await sock.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    }
};
