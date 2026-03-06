/**
 * .sdinpaint - Stable Diffusion Inpainting
 * Fill/replace areas of an image (like AUTOMATIC1111 inpainting tab)
 * المطور: حمزة اعمرني (HAMZA AMIRNI)
 */

const axios = require('axios');
const config = require('../../config');

async function translateToEn(text) {
    try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encodeURIComponent(text);
        const res = await axios.get(url, { timeout: 8000 });
        return res.data[0].map(t => t[0]).join('');
    } catch { return text; }
}

async function inpaintImage(imageBuffer, prompt, region) {
    const CryptoJS = require('crypto-js');
    const AES_KEY = 'ai-enhancer-web__aes-key';
    const AES_IV = 'aienhancer-aesiv';

    const inpaintPrompts = {
        'background': `change background to: ${prompt}, keep the main subject unchanged, seamless integration`,
        'face': `improve face: ${prompt}, realistic, detailed facial features, natural skin tone`,
        'clothes': `change outfit to: ${prompt}, realistic fabric texture, proper lighting`,
        'hair': `change hair to: ${prompt}, realistic hair strands, natural shine`,
        'auto': prompt
    };

    const finalPrompt = inpaintPrompts[region] || inpaintPrompts['auto'];
    const settingsData = CryptoJS.AES.encrypt(
        JSON.stringify({ prompt: finalPrompt, size: '2K', aspect_ratio: 'match_input_image', output_format: 'jpeg', max_images: 1 }),
        CryptoJS.enc.Utf8.parse(AES_KEY),
        { iv: CryptoJS.enc.Utf8.parse(AES_IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    ).toString();

    const img = imageBuffer.toString('base64');
    const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10)', 'Content-Type': 'application/json', Origin: 'https://aienhancer.ai', Referer: 'https://aienhancer.ai/ai-image-editor' };

    const createRes = await axios.post('https://aienhancer.ai/api/v1/k/image-enhance/create', { model: 2, function: 'ai-image-editor', image: [`data:image/jpeg;base64,${img}`], settings: settingsData }, { headers });
    const id = createRes?.data?.data?.id;
    if (!id) throw new Error('No task ID from API');

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const r = await axios.post('https://aienhancer.ai/api/v1/k/image-enhance/result', { task_id: id }, { headers });
        const data = r?.data?.data;
        if (!data) continue;
        if (data.status === 'success') return data.output;
        if (data.status === 'failed') throw new Error(data.error || 'Processing failed');
    }
    throw new Error('Timeout: took too long');
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers?.isTelegram;
    const rawInput = args.join(' ').trim();

    if (!rawInput || rawInput === 'help') {
        return await sock.sendMessage(chatId, {
            text: `🎭 *Stable Diffusion Inpainting*\n━━━━━━━━━━━━━━━━━━━━━\n*الاستخدام:*\nرد على صورة واكتب:\n\`.sdinpaint <ما تريد تغييره>\`\n\n*خيار المنطقة (--region):*\n  \`background\` - تغيير الخلفية\n  \`face\` - تحسين الوجه\n  \`clothes\` - تغيير الملابس\n  \`hair\` - تغيير الشعر\n  \`auto\` - تلقائي (افتراضي)\n\n*أمثلة:*\n\`.sdinpaint غير الخلفية لشاطئ --region background\`\n\`.sdinpaint لبس بدلة رسمية --region clothes\`\n\`.sdinpaint شعر طويل ذهبي --region hair\`\n━━━━━━━━━━━━━━━━━━━━━\n⚡ *Powered by SD Inpainting*`
        }, { quoted: msg });
    }

    let prompt = rawInput;
    let region = 'auto';
    const regionMatch = prompt.match(/--region\s+(\S+)/i);
    if (regionMatch) { region = regionMatch[1].toLowerCase(); prompt = prompt.replace(regionMatch[0], '').trim(); if (!['background', 'face', 'clothes', 'hair', 'auto'].includes(region)) region = 'auto'; }

    const isFacebook = helpers?.isFacebook;
    let imageBuffer = null;

    if (isTelegram || isFacebook) {
        imageBuffer = await sock.downloadMedia(msg);
        if (!imageBuffer && msg.reply_to_message) imageBuffer = await sock.downloadMedia(msg.reply_to_message);
    } else {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const pino = require('pino');
        let targetMsg = msg;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted?.imageMessage) targetMsg = { key: msg.message.extendedTextMessage.contextInfo, message: quoted };
        const mime = targetMsg.message?.imageMessage?.mimetype || msg.message?.imageMessage?.mimetype || '';
        if (mime.startsWith('image/')) {
            try { imageBuffer = await downloadMediaMessage(mime === msg.message?.imageMessage?.mimetype ? msg : targetMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) }); } catch (e) { }
        }
    }

    if (!imageBuffer) return await sock.sendMessage(chatId, { text: `⚠️ يرجى الرد على صورة!\n\nمثال: رد على صورة بـ:\n\`.sdinpaint غير الخلفية لغابة --region background\`` }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '🎭', key: msg.key } });

    const regionEmoji = { 'background': '🌄', 'face': '👤', 'clothes': '👔', 'hair': '💇', 'auto': '🤖' };
    const waitMsg = await sock.sendMessage(chatId, {
        text: `🎭 *SD Inpainting - Processing...*\n━━━━━━━━━━━━━━━━━━━━━\n📝 *التعديل:* ${prompt}\n${regionEmoji[region] || '🎯'} *المنطقة:* ${region}\n━━━━━━━━━━━━━━━━━━━━━\n⏳ _جاري تعديل الصورة... 30-60 ثانية_`
    }, { quoted: msg });

    try {
        const enPrompt = await translateToEn(prompt);
        const resultUrl = await inpaintImage(imageBuffer, enPrompt, region);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        const caption = `*✨ ───❪ SD Inpainting ❫─── ✨*\n\n✅ *تم التعديل بنجاح!*\n\n📝 *التعديل:* ${prompt}\n${regionEmoji[region] || '🎯'} *المنطقة:* ${region}\n\n💡 _مثل Inpainting في Stable Diffusion WebUI_\n*⚔️ ${config.botName}*`;

        const imgRes = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 });
        await sock.sendMessage(chatId, {
            image: Buffer.from(imgRes.data, 'binary'), caption,
            contextInfo: { externalAdReply: { title: '🎭 SD Inpainting', body: `Region: ${region}`, thumbnailUrl: resultUrl, sourceUrl: config.instagram || 'https://instagram.com/hamza_amirni_01', mediaType: 1, renderLargerThumbnail: true } }
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('[sdinpaint] Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ *فشل الـ Inpainting*\n\n⚠️ ${e.message}\n\n💡 جرب وصفاً أوضح للتعديل` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
