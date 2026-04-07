const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

function detectLanguage(text = '') {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? 'ar' : 'en';
}

const { getContext, addToHistory, analyzeImage } = require('../../lib/ai');

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

        if (!passedBuffer) {
            await sock.sendMessage(chatId, { text: "⏳ *جاري تحليل الصورة...*" }, { quoted: msg });
        }

        const mime = msg.message?.imageMessage?.mimetype || msg.message?.documentWithCaptionMessage?.message?.imageMessage?.mimetype || 'image/jpeg';
        
        let finalReply = await analyzeImage(imgBuffer, mime, userRequest);

        if (!finalReply) throw new Error("No response received from AI.");

        // Cleanup: remove headers if they appear
        finalReply = finalReply
            .replace(/### Question \d+/gi, '')
            .replace(/### Answer/gi, '')
            .replace(/### Solution Steps/gi, '')
            .replace(/### Analysis/gi, '')
            .trim();

        // Save context
        addToHistory(chatId, "user", userRequest, { buffer: imgBuffer, mime: 'image/jpeg' });
        addToHistory(chatId, "assistant", finalReply);

        // Guard: wrap sendMessage in its own try/catch so a connection drop mid-send
        // never escapes to the global uncaughtException handler and kills the bot.
        try {
            await sock.sendMessage(chatId, { text: finalReply }, { quoted: msg });
        } catch (sendErr) {
            // Silently ignore — connection may have dropped while waiting for AI response
            if (!sendErr?.message?.includes('Connection Closed') && sendErr?.output?.statusCode !== 428) {
                console.error('[analyze] sendMessage failed:', sendErr.message);
            }
        }

    } catch (err) {
        // Silently ignore WhatsApp connection-closed errors (status 428)
        // These happen when the socket drops while waiting for the long AI response.
        const isConnClosed = err?.output?.statusCode === 428
            || err?.message?.includes('Connection Closed')
            || err?.message?.includes('connection closed');

        if (!isConnClosed) {
            console.error('[analyze] Error:', err.message || err);
            try {
                if (sock.ws && sock.ws.readyState === 1) {
                    await sock.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
                }
            } catch (_) { /* ignore send errors too */ }
        }
    } finally {
        try {
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) { /* ignore cleanup errors */ }
    }
};
