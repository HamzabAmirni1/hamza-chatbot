/**
 * .sdimg - Stable Diffusion img2img
 * Convert/Transform an existing image using SD
 * Inspired by AUTOMATIC1111 Stable Diffusion WebUI img2img tab
 * المطور: حمزة اعمرني (HAMZA AMIRNI)
 */

const axios = require('axios');
const config = require('../../config');

const STYLE_PRESETS = {
    'anime': 'anime style, high quality anime art, studio quality, vibrant colors',
    'realistic': 'photorealistic, ultra detailed, 8k, DSLR photo, professional photography',
    'oil': 'oil painting, impressionist style, textured brushstrokes, canvas texture, masterpiece',
    'watercolor': 'watercolor painting, soft edges, delicate colors, artistic, illustration',
    'cyberpunk': 'cyberpunk style, neon lights, futuristic, dark atmosphere, sci-fi',
    'ghibli': 'Studio Ghibli style, anime, soft colors, magical, miyazaki style',
    'sketch': 'pencil sketch, detailed linework, artistic drawing, black and white',
    'pixel': 'pixel art, 8-bit style, retro game art, pixelated',
    'cartoon': 'cartoon style, bold outlines, colorful, fun illustration',
    '3d': '3D render, octane render, unreal engine, hyper realistic, volumetric lighting',
    'fantasy': 'fantasy art, epic, magical, dragons, mystical landscape, concept art',
    'vintage': 'vintage photography, film grain, retro colors, aged photo, nostalgic',
};

async function translateToEn(text) {
    try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encodeURIComponent(text);
        const res = await axios.get(url, { timeout: 8000 });
        return res.data[0].map(t => t[0]).join('');
    } catch { return text; }
}

async function img2img_HFSpace(imageBuffer, prompt, negativePrompt, strength) {
    const CryptoJS = require('crypto-js');
    const AES_KEY = 'ai-enhancer-web__aes-key';
    const AES_IV = 'aienhancer-aesiv';

    const settingsData = CryptoJS.AES.encrypt(
        JSON.stringify({
            prompt,
            negative_prompt: negativePrompt || 'ugly, deformed, bad quality',
            strength: strength || 0.75,
            size: 'original',
            aspect_ratio: 'match_input_image',
            output_format: 'jpeg',
        }),
        CryptoJS.enc.Utf8.parse(AES_KEY),
        { iv: CryptoJS.enc.Utf8.parse(AES_IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    ).toString();

    const img = imageBuffer.toString('base64');
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
        'Content-Type': 'application/json',
        Origin: 'https://aienhancer.ai',
        Referer: 'https://aienhancer.ai/ai-image-editor'
    };

    const createRes = await axios.post(
        'https://aienhancer.ai/api/v1/k/image-enhance/create',
        { model: 2, function: 'ai-image-editor', image: [`data:image/jpeg;base64,${img}`], settings: settingsData },
        { headers }
    );
    const taskId = createRes?.data?.data?.id;
    if (!taskId) throw new Error('Failed to create task');

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const pollRes = await axios.post('https://aienhancer.ai/api/v1/k/image-enhance/result', { task_id: taskId }, { headers });
        const data = pollRes?.data?.data;
        if (!data) continue;
        if (data.status === 'success') return data.output;
        if (data.status === 'failed') throw new Error(data.error || 'Processing failed');
    }
    throw new Error('Timeout');
}

async function img2img_Pollinations(imageBuffer, prompt, style) {
    const { uploadToCatbox, uploadToTmpfiles } = require('../../lib/media');
    let imageUrl = await uploadToCatbox(imageBuffer);
    if (!imageUrl) imageUrl = await uploadToTmpfiles(imageBuffer);
    if (!imageUrl) throw new Error('Failed to upload image');

    const enhancedPrompt = style ? `${STYLE_PRESETS[style] || ''}, ${prompt}` : prompt;
    const seed = Math.floor(Math.random() * 9999999);
    const url = `https://pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=768&height=768&seed=${seed}&nologo=true&model=flux&enhance=true`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
    return Buffer.from(res.data);
}

function buildHelp() {
    const styleList = Object.keys(STYLE_PRESETS).map(k => `\`${k}\``).join(', ');
    return `🖼️ *Stable Diffusion img2img*\n━━━━━━━━━━━━━━━━━━━━━\n*الاستخدام:*\nرد على صورة واكتب:\n\`.sdimg <وصف التحويل>\`\n\n*خيارات:*\n  \`--style <الستايل>\` - تطبيق ستايل\n  \`--neg <ما لا تريده>\` - Negative Prompt\n  \`--strength 0.8\` - قوة التحويل (0.1-1.0)\n\n*الستايلات:*\n${styleList}\n\n*أمثلة:*\n\`.sdimg حول هذا لأنمي --style anime\`\n\`.sdimg make it cyberpunk --style cyberpunk\`\n━━━━━━━━━━━━━━━━━━━━━\n⚡ *Powered by SD img2img*`;
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const rawInput = args.join(' ').trim();
    if (!rawInput || rawInput === 'help') return await sock.sendMessage(chatId, { text: buildHelp() }, { quoted: msg });

    let prompt = rawInput;
    let style = null, negPrompt = '', strength = 0.75;

    const styleMatch = prompt.match(/--style\s+(\S+)/i);
    if (styleMatch) { style = styleMatch[1].toLowerCase(); prompt = prompt.replace(styleMatch[0], '').trim(); }
    const negMatch = prompt.match(/--neg\s+(.+?)(?=--|$)/i);
    if (negMatch) { negPrompt = negMatch[1].trim(); prompt = prompt.replace(negMatch[0], '').trim(); }
    const strengthMatch = prompt.match(/--strength\s+([\d.]+)/i);
    if (strengthMatch) { strength = Math.min(1, Math.max(0.1, parseFloat(strengthMatch[1]))); prompt = prompt.replace(strengthMatch[0], '').trim(); }

    const isTelegram = helpers?.isTelegram;
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

    if (!imageBuffer) return await sock.sendMessage(chatId, { text: `⚠️ *يرجى الرد على صورة*\n\nمثال: رد على صورة بـ:\n\`.sdimg حول هذا لأنمي --style anime\`` }, { quoted: msg });
    if (!prompt) return await sock.sendMessage(chatId, { text: `⚠️ يرجى كتابة وصف التحويل!\n\nمثال: .sdimg حول هذا لأنمي --style anime` }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: '🖼️', key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, {
        text: `🖼️ *SD img2img - Processing...*\n━━━━━━━━━━━━━━━━━━━━━\n📝 *Prompt:* ${prompt}\n${style ? `🎨 *Style:* ${style}\n` : ''}${negPrompt ? `🚫 *Negative:* ${negPrompt}\n` : ''}💪 *Strength:* ${strength}\n━━━━━━━━━━━━━━━━━━━━━\n⏳ _جاري تحويل الصورة... 30-60 ثانية_`
    }, { quoted: msg });

    try {
        const enPrompt = await translateToEn(style ? `${STYLE_PRESETS[style] || ''}, ${prompt}` : prompt);
        const enNeg = negPrompt ? await translateToEn(negPrompt) : 'ugly, deformed, bad quality, blurry';

        let resultBuffer = null, resultUrl = null, usedEngine = '';
        try {
            resultUrl = await img2img_HFSpace(imageBuffer, enPrompt, enNeg, strength);
            usedEngine = 'AI Enhancer';
        } catch (e) {
            console.log('[sdimg] fallback to Pollinations:', e.message);
            resultBuffer = await img2img_Pollinations(imageBuffer, enPrompt, style);
            usedEngine = 'Pollinations SD';
        }

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        const caption = `*✨ ───❪ SD img2img ❫─── ✨*\n\n✅ *تم تحويل الصورة بنجاح!*\n\n📝 *Prompt:* ${prompt}\n${style ? `🎨 *Style:* ${style}\n` : ''}${negPrompt ? `🚫 *Negative:* ${negPrompt}\n` : ''}💪 *Strength:* ${strength}\n⚡ *Engine:* ${usedEngine}\n\n*⚔️ ${config.botName}*`;

        if (resultUrl) {
            const imgRes = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 });
            resultBuffer = Buffer.from(imgRes.data, 'binary');
        }

        await sock.sendMessage(chatId, {
            image: resultBuffer, caption,
            contextInfo: { externalAdReply: { title: '🖼️ SD img2img', body: style ? `Style: ${style}` : 'Image to Image', sourceUrl: config.instagram || 'https://instagram.com/hamza_amirni_01', mediaType: 1, renderLargerThumbnail: true } }
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('[sdimg] Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ *فشل تحويل الصورة*\n\n⚠️ ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
