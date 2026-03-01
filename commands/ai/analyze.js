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
            console.log(`[AI Analyzer] Receiving buffer from passedBuffer (${passedBuffer.length} bytes)`);
            imgBuffer = passedBuffer;
        } else {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const mediaMsg = msg.message?.imageMessage ? msg : { message: quoted };
            imgBuffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, { logger: { level: 'silent' } });
        }

        let userRequest = args.join(" ").trim() || autoCaption || "";

        const systemInstruction = `أنت مساعد ذكي متعدد اللغات (دارجة مغربية، فرنسية، إنجليزية، عربي).
المهمة: أجب على سؤال المستخدم المتعلق بالصورة بأسلوب دردشة طبيعي وودود.
ممنوع استخدام العناوين مثل ### Question أو إرجاع نص التوجيهات الحالية. اجعل الرد مباشراً.`;

        if (!passedBuffer) {
            await sock.sendMessage(chatId, { text: "⏳ *Scanning image...*" }, { quoted: msg });
        }

        const { getGeminiResponse, getOpenRouterResponse } = require('../../lib/ai');
        let fullText = "";

        // --- Priority 1: Official Gemini API ---
        try {
            console.log(`[AI Analyzer] Trying Gemini Pro...`);
            fullText = await getGeminiResponse(chatId, `${systemInstruction}\n\nUser: ${userRequest || "علق على الصورة بذكاء بالدارجة"}`, imgBuffer);
        } catch (e) {
            console.error(`[AI Analyzer] Gemini failed:`, e.message);
        }

        // --- Priority 2: OpenRouter ---
        if (!fullText) {
            try {
                console.log(`[AI Analyzer] Trying OpenRouter...`);
                fullText = await getOpenRouterResponse(chatId, `${systemInstruction}\n\nUser: ${userRequest || "علق على الصورة بذكاء بالدارجة"}`, imgBuffer);
            } catch (e) {
                console.error(`[AI Analyzer] OpenRouter failed:`, e.message);
            }
        }

        // --- Priority 3: NoteGPT Fallback (Legacy) ---
        if (!fullText) {
            try {
                console.log(`[AI Analyzer] Trying NoteGPT Fallback...`);
                // Upload to Catbox for public URL
                const form = new FormData();
                form.append('reqtype', 'fileupload');
                form.append('fileToUpload', imgBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
                const uploadRes = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders(), timeout: 20000 });
                const imageUrl = uploadRes.data.trim();

                if (imageUrl.startsWith('http')) {
                    const payload = {
                        message: `${systemInstruction}\n\nUSER REQUEST: ${userRequest || "علق بجمالية"}`,
                        language: detectLanguage(userRequest),
                        model: "gemini-1.5-flash",
                        image_urls: [imageUrl]
                    };
                    const noteRes = await axios.post('https://notegpt.io/api/v2/homework/stream', payload, {
                        headers: { 'Content-Type': 'application/json', 'Origin': 'https://notegpt.io' },
                        responseType: 'stream'
                    });

                    await new Promise((resolve, reject) => {
                        noteRes.data.on('data', (chunk) => {
                            const lines = chunk.toString().split('\n');
                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    try {
                                        const data = JSON.parse(line.slice(6));
                                        if (data.text) fullText += data.text;
                                        if (data.done) resolve();
                                    } catch (e) { }
                                }
                            }
                        });
                        noteRes.data.on('end', () => resolve());
                        noteRes.data.on('error', (e) => reject(e));
                        setTimeout(() => resolve(), 30000);
                    });
                }
            } catch (e) {
                console.error(`[AI Analyzer] NoteGPT failed:`, e.message);
            }
        }

        if (!fullText) throw new Error("Could not analyze image. Please try again later.");

        // --- ROBUST CLEANUP ---
        function cleanResponse(text) {
            if (!text) return "";
            return text
                .replace(/### Question \d+/gi, '')
                .replace(/### Answer/gi, '')
                .replace(/### Solution Steps/gi, '')
                .replace(/### Analysis/gi, '')
                .replace(/Question \d+:/gi, '')
                .replace(/Answer:/gi, '')
                .replace(/أنت مساعد ذكي متعدد اللغات[\s\S]*?اجعل الرد مباشراً\./g, '') // Remove leaked prompt
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        const finalReply = cleanResponse(fullText);
        if (!finalReply) throw new Error("Empty AI response.");

        // Save to history
        addToHistory(chatId, "user", userRequest, { buffer: imgBuffer, mime: 'image/jpeg' });
        addToHistory(chatId, "assistant", finalReply);

        await sock.sendMessage(chatId, { text: finalReply }, { quoted: msg });

    } catch (err) {
        console.error(err);
        await sock.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    }
};
