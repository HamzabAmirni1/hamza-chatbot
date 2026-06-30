/**
 * 🖼️ STICKER MAKER
 * Adapted from silana-lite-ofc-master (sticker.js)
 * Converts image / GIF / WebP to a WhatsApp sticker
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function downloadMedia(msg) {
    const msgContent = msg.message;
    const type =
        msgContent.imageMessage ? 'imageMessage' :
        msgContent.stickerMessage ? 'stickerMessage' :
        msgContent.videoMessage ? 'videoMessage' :
        msgContent.documentMessage ? 'documentMessage' : null;

    if (!type) return null;

    const mediaMsg = msgContent[type];
    const mediaType =
        type === 'imageMessage' ? 'image' :
        type === 'stickerMessage' ? 'sticker' :
        type === 'videoMessage' ? 'video' : 'document';

    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return { buffer, mimetype: mediaMsg.mimetype || '' };
}

async function makeSticker(buffer, mimetype) {
    // Use the WhatsApp sticker API via a free public service
    // Supports: image/jpeg, image/png, image/gif, image/webp
    const FormData = require('form-data');
    const form = new FormData();

    const isGif = mimetype.includes('gif');
    const isWebp = mimetype.includes('webp');

    // We'll convert using the sharp-free approach via an external API
    // Using ezgif-like approach or direct webp conversion
    const tmpDir = path.join(__dirname, '../../tmp');
    fs.ensureDirSync(tmpDir);
    const tmpIn = path.join(tmpDir, `sticker_in_${Date.now()}.${isWebp ? 'webp' : isGif ? 'gif' : 'jpg'}`);
    const tmpOut = path.join(tmpDir, `sticker_out_${Date.now()}.webp`);

    fs.writeFileSync(tmpIn, buffer);

    try {
        // Try using the WhatsApp sticker API (no external API key needed)
        // We use ffmpeg if available, otherwise fallback to the webp trick
        const { execSync } = require('child_process');

        if (isGif) {
            // GIF to animated WebP
            execSync(
                `ffmpeg -i "${tmpIn}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0" -loop 0 -preset default -an -vsync 0 "${tmpOut}" -y`,
                { stdio: 'ignore', timeout: 20000 }
            );
        } else {
            // Image to static WebP
            execSync(
                `ffmpeg -i "${tmpIn}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0" "${tmpOut}" -y`,
                { stdio: 'ignore', timeout: 20000 }
            );
        }

        const stickerBuffer = fs.readFileSync(tmpOut);
        return stickerBuffer;
    } finally {
        try { fs.unlinkSync(tmpIn); } catch (_) {}
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch (_) {}
    }
}

module.exports = async (sock, sender, msg, args, extra) => {
    // Check for quoted message or direct image
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const directImage = msg.message?.imageMessage;
    const directVideo = msg.message?.videoMessage;

    let targetMsg = msg;
    let targetType = null;

    if (quotedMsg) {
        // Build a fake message to pass to downloadMedia
        targetMsg = {
            message: quotedMsg,
            key: msg.key
        };
        targetType = quotedMsg.imageMessage ? 'image' :
                     quotedMsg.stickerMessage ? 'sticker' :
                     quotedMsg.videoMessage ? 'video' : null;
    } else if (directImage) {
        targetType = 'image';
    } else if (directVideo) {
        targetType = 'video';
    }

    const hasBuffer = extra && extra.buffer;
    const isTelegramPhoto = msg.photo || msg.reply_to_message?.photo || msg.document || msg.reply_to_message?.document || msg.video || msg.reply_to_message?.video;
    const isFacebookPhoto = extra && extra.isFacebook;

    if (!targetType && !hasBuffer && !isTelegramPhoto && !isFacebookPhoto) {
        return await sock.sendMessage(sender, {
            text: `🖼️ *صانع الملصقات | Sticker Maker*\n\n` +
                  `📌 *كيفية الاستخدام:*\n` +
                  `• أرسل صورة مع الأمر *.s*\n` +
                  `• أو رد على صورة بالأمر *.sticker*\n\n` +
                  `✅ يدعم: صور، GIF، WebP\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(sender, { text: '⏳ *جاري تحويل الصورة إلى ملصق...*' }, { quoted: msg });

        let mediaBuffer;
        let mimetype = 'image/jpeg';

        if (extra && extra.buffer) {
            mediaBuffer = extra.buffer;
            mimetype = 'image/jpeg';
        } else if (typeof sock.downloadMediaMessage === 'function') {
            mediaBuffer = await sock.downloadMediaMessage(targetMsg);
            mimetype = (targetMsg.reply_to_message?.video || targetMsg.video) ? 'video/mp4' : 'image/jpeg';
        } else {
            const media = await downloadMedia(targetMsg);
            if (!media) throw new Error('تعذر تحميل الوسائط');
            mediaBuffer = media.buffer;
            mimetype = media.mimetype;
        }

        const stickerBuffer = await makeSticker(mediaBuffer, mimetype);

        await sock.sendMessage(sender, {
            sticker: stickerBuffer
        }, { quoted: msg });

    } catch (err) {
        console.error('[Sticker Error]:', err.message);
        await sock.sendMessage(sender, {
            text: `❌ *فشل تحويل الملصق*\n${err.message.includes('ffmpeg') ? 'تأكد من تثبيت ffmpeg على السيرفر.' : err.message}\n⚔️ ${config.botName}`
        }, { quoted: msg });
    }
};
