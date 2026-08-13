/**
 * .sd - Stable Diffusion Image Generator
 * Features: txt2img, multiple models, negative prompt, steps control, sampler selection
 * Inspired by AUTOMATIC1111 Stable Diffusion WebUI
 * المطور: حمزة اعمرني (HAMZA AMIRNI)
 */

const axios = require('axios');
const config = require('../../config');

// ─────────────────────────────────────────
// Available SD Models (like AUTOMATIC1111's model list)
// ─────────────────────────────────────────
const SD_MODELS = {
    'sd15': { id: 'stable-diffusion-v1-5/stable-diffusion-v1-5', label: 'SD 1.5 Classic' },
    'sdxl': { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL High Quality' },
    'realistic': { id: 'SG161222/Realistic_Vision_V6.0_B1_noVAE', label: 'Realistic Vision 6.0' },
    'dreamshaper': { id: 'Lykon/dreamshaper-8', label: 'DreamShaper 8' },
    'anime': { id: 'Linaqruf/anything-v3.0', label: 'Anything V3 Anime' },
    'fantasy': { id: 'prompthero/openjourney-v4', label: 'OpenJourney Fantasy' },
    'portrait': { id: 'digiplay/majicMIX_realistic_v6', label: 'MajicMIX Realistic' },
    'pixel': { id: 'nerijs/pixel-art-xl', label: 'Pixel Art XL' },
};

// ─────────────────────────────────────────
// Available Samplers (like AUTOMATIC1111)
// ─────────────────────────────────────────
const SAMPLERS = ['Euler a', 'DPM++ 2M Karras', 'DDIM', 'LMS', 'Heun'];

// ─────────────────────────────────────────
// Hugging Face API - Free inference
// ─────────────────────────────────────────
async function generateWithHF(prompt, negativePrompt, modelId, steps, seed) {
    const hfToken = config.hfToken || '';
    const headers = {
        'Content-Type': 'application/json',
        ...(hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {})
    };

    const payload = {
        inputs: prompt,
        parameters: {
            negative_prompt: negativePrompt || 'ugly, deformed, bad quality, blurry, watermark, text, bad anatomy',
            num_inference_steps: steps || 25,
            seed: seed || Math.floor(Math.random() * 9999999),
            guidance_scale: 7.5,
            width: 512,
            height: 512
        }
    };

    const res = await axios.post(
        `https://api-inference.huggingface.co/models/${modelId}`,
        payload,
        { headers, responseType: 'arraybuffer', timeout: 120000 }
    );

    if (res.headers['content-type']?.includes('application/json')) {
        const json = JSON.parse(Buffer.from(res.data).toString());
        if (json.error) throw new Error(json.error);
    }

    return Buffer.from(res.data);
}

// ─────────────────────────────────────────
// Pollinations fallback (always free, no token needed)
// ─────────────────────────────────────────
async function generateWithPollinations(prompt, negativePrompt, model) {
    const sdModel = model === 'anime' ? 'anything-v3' :
        model === 'realistic' ? 'realistic-vision-v6' :
            model === 'sdxl' ? 'sdxl' :
                model === 'dreamshaper' ? 'dreamshaper' : 'flux';

    const seed = Math.floor(Math.random() * 9999999);
    const fullPrompt = negativePrompt
        ? `${prompt} ### negative: ${negativePrompt}`
        : prompt;

    const url = `https://pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=768&height=768&seed=${seed}&nologo=true&model=${sdModel}&enhance=true`;
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
    return Buffer.from(res.data);
}

// ─────────────────────────────────────────
// Translate to English
// ─────────────────────────────────────────
async function translateToEn(text) {
    try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encodeURIComponent(text);
        const res = await axios.get(url, { timeout: 8000 });
        return res.data[0].map(t => t[0]).join('');
    } catch {
        return text;
    }
}

// ─────────────────────────────────────────
// Parse prompt flags (like AUTOMATIC1111 CLI args)
// e.g. .sd a cat --neg ugly --model realistic --steps 30 --seed 12345
// ─────────────────────────────────────────
function parseFlags(rawInput) {
    const flags = {
        prompt: '',
        negativePrompt: '',
        model: 'sdxl',
        steps: 25,
        seed: Math.floor(Math.random() * 9999999),
        sampler: 'Euler a',
        width: 768,
        height: 768
    };

    let remaining = rawInput;

    // Extract --neg or -n
    const negMatch = remaining.match(/--neg\s+(.+?)(?=--|$)/i) || remaining.match(/-n\s+(.+?)(?=--|$)/i);
    if (negMatch) {
        flags.negativePrompt = negMatch[1].trim();
        remaining = remaining.replace(negMatch[0], '').trim();
    }

    // Extract --model or -m
    const modelMatch = remaining.match(/--model\s+(\S+)/i) || remaining.match(/-m\s+(\S+)/i);
    if (modelMatch) {
        flags.model = modelMatch[1].toLowerCase();
        remaining = remaining.replace(modelMatch[0], '').trim();
    }

    // Extract --steps or -s
    const stepsMatch = remaining.match(/--steps\s+(\d+)/i) || remaining.match(/-s\s+(\d+)/i);
    if (stepsMatch) {
        flags.steps = Math.min(50, Math.max(5, parseInt(stepsMatch[1])));
        remaining = remaining.replace(stepsMatch[0], '').trim();
    }

    // Extract --seed
    const seedMatch = remaining.match(/--seed\s+(\d+)/i);
    if (seedMatch) {
        flags.seed = parseInt(seedMatch[1]);
        remaining = remaining.replace(seedMatch[0], '').trim();
    }

    // Extract --size (e.g. --size 512x768)
    const sizeMatch = remaining.match(/--size\s+(\d+)x(\d+)/i);
    if (sizeMatch) {
        flags.width = Math.min(1024, Math.max(256, parseInt(sizeMatch[1])));
        flags.height = Math.min(1024, Math.max(256, parseInt(sizeMatch[2])));
        remaining = remaining.replace(sizeMatch[0], '').trim();
    }

    // Extract --portrait or --landscape shortcuts
    if (remaining.includes('--portrait')) {
        flags.width = 512; flags.height = 768;
        remaining = remaining.replace('--portrait', '').trim();
    } else if (remaining.includes('--landscape')) {
        flags.width = 768; flags.height = 512;
        remaining = remaining.replace('--landscape', '').trim();
    } else if (remaining.includes('--square')) {
        flags.width = 768; flags.height = 768;
        remaining = remaining.replace('--square', '').trim();
    }

    flags.prompt = remaining.trim();
    return flags;
}

// ─────────────────────────────────────────
// Build help message
// ─────────────────────────────────────────
function buildHelp() {
    const modelList = Object.keys(SD_MODELS).map(k => `  • \`${k}\` - ${SD_MODELS[k].label}`).join('\n');
    return `🎨 *Stable Diffusion Image Generator*
━━━━━━━━━━━━━━━━━━━━━
*الاستخدام:*
\`.sd <وصف الصورة>\`

*خيارات متقدمة (مثل AUTOMATIC1111):*
  \`--model <الموديل>\` - اختيار الموديل
  \`--neg <ما لا تريده>\` - Negative Prompt
  \`--steps <عدد>\` - خطوات التوليد (5-50)
  \`--seed <رقم>\` - Seed محدد
  \`--portrait\` - حجم طولي 512x768
  \`--landscape\` - حجم عرضي 768x512

*الموديلات المتاحة:*
${modelList}

*أمثلة:*
\`.sd امرأة مغربية جميلة\`
\`.sd futuristic city at sunset --model realistic --steps 30\`
\`.sd anime girl in forest --neg ugly,blurry --model anime\`
\`.sd portrait of a warrior --portrait --model dreamshaper\`
━━━━━━━━━━━━━━━━━━━━━
⚡ *Powered by Stable Diffusion + Hamza Amirni Bot*`;
}

// ─────────────────────────────────────────
// Main Command Handler
// ─────────────────────────────────────────
module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers?.isTelegram;
    const rawInput = args.join(' ').trim();

    if (!rawInput || rawInput === 'help' || rawInput === 'مساعدة') {
        return await sock.sendMessage(chatId, { text: buildHelp() }, { quoted: msg });
    }

    const flags = parseFlags(rawInput);

    if (!flags.prompt) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ يرجى كتابة وصف الصورة!\n\nمثال: .sd امرأة مغربية جميلة --model realistic\n\nاكتب .sd help لعرض التعليمات الكاملة`
        }, { quoted: msg });
    }

    // Validate model
    if (!SD_MODELS[flags.model]) {
        flags.model = 'sdxl'; // default fallback
    }

    const modelInfo = SD_MODELS[flags.model];

    // React with brush emoji
    await sock.sendMessage(chatId, { react: { text: '🎨', key: msg.key } });

    // Send waiting message with generation params
    const waitMsg = await sock.sendMessage(chatId, {
        text: `🎨 *Stable Diffusion - Generating...*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📝 *Prompt:* ${flags.prompt}\n` +
            (flags.negativePrompt ? `🚫 *Negative:* ${flags.negativePrompt}\n` : '') +
            `🤖 *Model:* ${modelInfo.label}\n` +
            `⚙️ *Steps:* ${flags.steps} | *Seed:* ${flags.seed}\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `⏳ _جاري التوليد... يرجى الانتظار 30-60 ثانية_`
    }, { quoted: msg });

    try {
        // Translate prompt if not in English
        const enPrompt = await translateToEn(flags.prompt);
        const enNeg = flags.negativePrompt ? await translateToEn(flags.negativePrompt) : '';

        let imageBuffer = null;
        let usedEngine = '';

        // Try HF first, then Pollinations as fallback
        try {
            imageBuffer = await generateWithHF(enPrompt, enNeg, modelInfo.id, flags.steps, flags.seed);
            if (!imageBuffer || imageBuffer.length < 5000) throw new Error("Invalid image received from HF");
            usedEngine = 'HuggingFace';
        } catch (hfErr) {
            console.log(`[SD] HF failed (${hfErr.message}), trying Pollinations...`);
            imageBuffer = await generateWithPollinations(enPrompt, enNeg, flags.model);
            if (!imageBuffer || imageBuffer.length < 5000) throw new Error("Invalid image received from Pollinations");
            usedEngine = 'Pollinations';
        }

        // Delete waiting message
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        const caption =
            `*✨ ───❪ STABLE DIFFUSION AI ❫─── ✨*\n\n` +
            `✅ *تم توليد الصورة بنجاح!*\n\n` +
            `📝 *الوصف:* ${flags.prompt}\n` +
            (flags.negativePrompt ? `🚫 *Negative Prompt:* ${flags.negativePrompt}\n` : '') +
            `🤖 *Model:* ${modelInfo.label}\n` +
            `⚙️ *Steps:* ${flags.steps} | 🎲 *Seed:* ${flags.seed}\n` +
            `⚡ *Engine:* ${usedEngine}\n\n` +
            `💡 _استخدم .sd help للخيارات المتقدمة_\n` +
            `*⚔️ ${config.botName}*`;

        await sock.sendMessage(chatId, {
            image: imageBuffer,
            caption,
            contextInfo: {
                externalAdReply: {
                    title: '🎨 Stable Diffusion AI',
                    body: `${modelInfo.label} • ${flags.steps} steps`,
                    sourceUrl: config.instagram || 'https://instagram.com/hamza_amirni_01',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('[SD] Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشل توليد الصورة*\n\n⚠️ ${e.message}\n\n💡 _جرب موديل مختلف: .sd ${flags.prompt} --model sdxl_`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
