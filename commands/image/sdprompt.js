/**
 * .sdprompt - AI Prompt Enhancer / CLIP Interrogator
 * Inspired by AUTOMATIC1111 SD WebUI's CLIP Interrogator
 * المطور: حمزة اعمرني (HAMZA AMIRNI)
 */

const axios = require('axios');
const config = require('../../config');

const QUALITY_TAGS = {
    ultra: 'masterpiece, best quality, ultra-detailed, ultra high resolution, 8k uhd, photorealistic',
    anime: 'best quality, masterpiece, anime style, detailed anime face, studio quality, 8k anime',
    realistic: 'RAW photo, photorealistic, hyperrealistic, ultra sharp, 8k uhd, DSLR photo, professional',
    portrait: 'portrait photography, professional lighting, sharp focus, bokeh background, detailed face',
    art: 'digital art, concept art, artstation, deviantart, trending, highly detailed, vivid colors',
    dark: 'dark fantasy, dramatic lighting, dark atmosphere, moody, cinematic, epic composition',
};

const NEGATIVE_TAGS = {
    default: 'ugly, deformed, noisy, blurry, low quality, watermark, signature, text, bad anatomy, bad hands, extra fingers, missing fingers',
    anime: 'lowres, bad anatomy, bad hands, text, error, missing fingers, worst quality, low quality, jpeg artifacts, signature, watermark',
    realistic: 'painting, illustration, cartoon, anime, 3d render, ugly, deformed, bad anatomy, extra limbs',
};

async function enhancePromptWithAI(userPrompt, style) {
    const systemMsg = `You are an expert Stable Diffusion prompt engineer. Convert the user's simple description into a detailed, high-quality SD prompt. Format: [subject], [style], [lighting], [quality tags]. Quality tags for style "${style}": ${QUALITY_TAGS[style] || QUALITY_TAGS.ultra}. Return ONLY the enhanced prompt, nothing else. Keep it under 150 words.`;
    try {
        const res = await axios.post('https://text.pollinations.ai/', {
            messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: `Simple description: "${userPrompt}"\nEnhanced SD prompt:` }],
            model: 'openai', seed: Math.floor(Math.random() * 9999)
        }, { timeout: 20000 });
        if (res.data && typeof res.data === 'string' && res.data.length > 10) return res.data.trim();
    } catch (e) { }
    return `${userPrompt}, ${QUALITY_TAGS[style] || QUALITY_TAGS.ultra}, cinematic lighting, detailed, sharp focus, HDR`;
}

async function translateToEn(text) {
    try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encodeURIComponent(text);
        const res = await axios.get(url, { timeout: 8000 });
        return res.data[0].map(t => t[0]).join('');
    } catch { return text; }
}

async function clipInterrogate(imageBuffer) {
    const imgBase64 = imageBuffer.toString('base64');
    const res = await axios.post('https://text.pollinations.ai/', {
        messages: [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imgBase64}` } },
                { type: 'text', text: 'Analyze this image and generate a detailed Stable Diffusion prompt that would recreate it. Include: subject, style, lighting, colors, mood, quality tags. Format as comma-separated SD prompt. Be specific.' }
            ]
        }],
        model: 'openai', seed: 42
    }, { timeout: 30000 });
    if (res.data && typeof res.data === 'string') return res.data.trim();
    throw new Error('CLIP interrogator failed');
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers?.isTelegram;
    const isFacebook = helpers?.isFacebook;
    const rawInput = args.join(' ').trim();

    let imageBuffer = null;
    if (isTelegram || isFacebook) {
        imageBuffer = await sock.downloadMedia(msg);
        if (!imageBuffer && msg.reply_to_message) imageBuffer = await sock.downloadMedia(msg.reply_to_message);
    } else {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted?.imageMessage) {
            try {
                const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                const pino = require('pino');
                imageBuffer = await downloadMediaMessage({ key: msg.message.extendedTextMessage.contextInfo, message: quoted }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
            } catch (e) { }
        } else if (msg.message?.imageMessage) {
            try {
                const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                const pino = require('pino');
                imageBuffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
            } catch (e) { }
        }
    }

    if (!rawInput && !imageBuffer) {
        const styleList = Object.keys(QUALITY_TAGS).map(k => `\`${k}\``).join(', ');
        return await sock.sendMessage(chatId, {
            text: `✍️ *SD Prompt Enhancer + CLIP Interrogator*\n━━━━━━━━━━━━━━━━━━━━━\n\n*الاستخدام 1 - تحسين وصف:*\n\`.sdprompt <وصف>\`\n\n*الاستخدام 2 - CLIP Interrogator (رد على صورة):*\n\`.sdprompt\`\n_يقرأ الصورة ويولد prompt جاهز!_\n\n*الستايلات:* ${styleList}\n\`.sdprompt <وصف> --style <الستايل>\`\n\n*أمثلة:*\n\`.sdprompt امرأة مغربية --style realistic\`\n\`.sdprompt\` (رد على صورة = CLIP Interrogator)\n━━━━━━━━━━━━━━━━━━━━━\n⚡ *Powered by CLIP + AI*`
        }, { quoted: msg });
    }

    let prompt = rawInput;
    let style = 'ultra';
    const styleMatch = prompt.match(/--style\s+(\S+)/i);
    if (styleMatch) { style = styleMatch[1].toLowerCase(); prompt = prompt.replace(styleMatch[0], '').trim(); if (!QUALITY_TAGS[style]) style = 'ultra'; }

    await sock.sendMessage(chatId, { react: { text: '✍️', key: msg.key } });

    // CLIP Interrogator mode
    if (imageBuffer) {
        const waitMsg = await sock.sendMessage(chatId, { text: `🔍 *CLIP Interrogator*\n━━━━━━━━━━━━━━━━━━━━━\n⏳ _جاري تحليل الصورة وتوليد الـ prompt..._` }, { quoted: msg });
        try {
            const clipPrompt = await clipInterrogate(imageBuffer);
            try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }
            await sock.sendMessage(chatId, {
                text: `🔍 *CLIP Interrogator Result*\n━━━━━━━━━━━━━━━━━━━━━\n\n✅ *Prompt المستخرج:*\n\`\`\`\n${clipPrompt}\n\`\`\`\n\n🚫 *Negative Prompt:*\n\`\`\`\n${NEGATIVE_TAGS.default}\n\`\`\`\n\n💡 استخدمه مع .sd:\n\`.sd ${clipPrompt.substring(0, 80)}...\`\n\n*⚔️ ${config.botName}*`
            }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
        } catch (e) {
            try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
            await sock.sendMessage(chatId, { text: `❌ فشل CLIP Interrogator: ${e.message}` }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        }
        return;
    }

    // Prompt Enhancement mode
    const waitMsg = await sock.sendMessage(chatId, {
        text: `✍️ *SD Prompt Enhancer*\n━━━━━━━━━━━━━━━━━━━━━\n⏳ _جاري تحسين الـ prompt..._\n\n📝 *الوصف:* ${prompt}\n🎨 *الستايل:* ${style}`
    }, { quoted: msg });

    try {
        const enPrompt = await translateToEn(prompt);
        const enhanced = await enhancePromptWithAI(enPrompt, style);
        const negPrompt = NEGATIVE_TAGS[style] || NEGATIVE_TAGS.default;
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            text: `✍️ *SD Prompt Enhancer Result*\n━━━━━━━━━━━━━━━━━━━━━\n\n📝 *الوصف الأصلي:* ${prompt}\n\n✅ *Positive Prompt (المُحسَّن):*\n\`\`\`\n${enhanced}\n\`\`\`\n\n🚫 *Negative Prompt:*\n\`\`\`\n${negPrompt}\n\`\`\`\n\n🎨 *الستايل:* ${style}\n\n💡 استخدمه مع .sd:\n\`.sd ${enhanced.substring(0, 100)}...\`\n\n*⚔️ ${config.botName}*`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('[sdprompt] Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ *فشل تحسين الـ prompt*\n\n⚠️ ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
