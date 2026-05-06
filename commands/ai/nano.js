const axios = require('axios');
const config = require('../../config');
const { translateToEn } = require('../../lib/ai');

// Nano Banana Pro = Google Gemini 3 Pro Image (via aimlapi.com)
// One of the best image generation models available in 2025!

module.exports = async (sock, chatId, msg, args) => {
    const prompt = args.join(' ').trim();

    if (!prompt) {
        return await sock.sendMessage(chatId, {
            text: `🍌 *Nano Banana Pro - أقوى AI للصور*\n\n🧠 *المحرك:* Google Gemini 3 Pro Image\n\n📝 *الاستخدام:*\n.nano [وصف الصورة]\n\n*أمثلة:*\n🔸 .nano منظر طبيعي لجبال مغربية عند الغروب\n🔸 .nano فتاة ترتدي جلباب مغربي في مدينة فاس\n🔸 .nano ذئب يعوي أمام القمر ليلاً، أسلوب فني\n🔸 .nano سيارة سباق حمراء في شارع مضيء\n\n⚙️ *المزايا:*\n• 🏆 أفضل نموذج صور في 2025\n• 🖼️ جودة حتى 4K\n• 📐 نسب مختلفة (1:1, 16:9, 9:16)\n• ✨ تفاصيل واقعية جداً`
        }, { quoted: msg });
    }

    const apiKey = config.aimlApiKey || process.env.AIML_API_KEY;
    if (!apiKey) {
        return await sock.sendMessage(chatId, {
            text: `❌ *مفتاح AIML API غير موجود*\n\nيرجى تعيين \`AIML_API_KEY\` في متغيرات البيئة.\n\n💡 احصل على مفتاح مجاني من:\nhttps://aimlapi.com`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🍌", key: msg.key } });

    const waitMsg = await sock.sendMessage(chatId, {
        text: `🍌 *Nano Banana Pro*\n\n⏳ جاري إنشاء الصورة...\n📝 *الطلب:* ${prompt}\n\n🧠 *المحرك:* Gemini 3 Pro Image`
    }, { quoted: msg });

    try {
        // Auto-detect aspect ratio from prompt keywords
        let aspectRatio = '1:1';
        const lowerPrompt = prompt.toLowerCase();
        if (lowerPrompt.includes('بانوراما') || lowerPrompt.includes('panorama') || lowerPrompt.includes('واسع') || lowerPrompt.includes('wide')) {
            aspectRatio = '16:9';
        } else if (lowerPrompt.includes('بورتريه') || lowerPrompt.includes('portrait') || lowerPrompt.includes('شخص') || lowerPrompt.includes('وجه')) {
            aspectRatio = '4:5';
        } else if (lowerPrompt.includes('ستوري') || lowerPrompt.includes('story') || lowerPrompt.includes('موبايل')) {
            aspectRatio = '9:16';
        }

        // Translate to English for best results
        let enPrompt = prompt;
        try {
            enPrompt = await translateToEn(prompt);
        } catch (e) {
            console.log("Translation failed, using Arabic:", e.message);
        }

        const enhancedPrompt = `${enPrompt}, ultra realistic, cinematic lighting, 8K quality, highly detailed, professional photography`;

        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: `🍌 *Nano Banana Pro*\n\n🚀 *جاري الرسم...*\n📝 *AR:* ${prompt}\n🌐 *EN:* ${enPrompt.slice(0, 80)}...\n📐 *النسبة:* ${aspectRatio}\n🏆 *Gemini 3 Pro Image*`
        });

        // Call aimlapi.com with Nano Banana Pro model
        const response = await axios.post(
            'https://api.aimlapi.com/v1/images/generations',
            {
                model: 'google/nano-banana-pro',
                prompt: enhancedPrompt,
                aspect_ratio: aspectRatio,
                resolution: '2K',
                num_images: 1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        const imageUrl = response.data?.data?.[0]?.url;
        if (!imageUrl) throw new Error('لم يتم استلام رابط الصورة من API');

        // Delete wait message
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        // Send the image
        await sock.sendMessage(chatId, {
            image: { url: imageUrl },
            caption: `🍌 *Nano Banana Pro* ✨\n\n📝 *الطلب:* ${prompt}\n🧠 *المحرك:* Google Gemini 3 Pro Image\n🖼️ *الجودة:* 2K | ${aspectRatio}\n\n⚔️ *${config.botName}*`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } });

    } catch (err) {
        console.error("NanoBanana Error:", err.response?.data || err.message);

        const status = err.response?.status;
        const errMsg = err.response?.data?.error?.message || err.response?.data?.detail || err.message;

        let userMsg = `❌ *فشل إنشاء الصورة*\n\n`;
        if (status === 401) {
            userMsg += `🔑 مفتاح API غير صالح\n💡 تحقق من \`AIML_API_KEY\``;
        } else if (status === 429) {
            userMsg += `⚠️ تم تجاوز حد الاستخدام\n💡 حاول لاحقاً`;
        } else if (status === 402) {
            userMsg += `💳 رصيد AIML غير كافي\n💡 أعد شحن رصيدك على aimlapi.com`;
        } else {
            userMsg += `💬 *السبب:* ${errMsg}\n\n💡 جرب وصفاً مختلفاً`;
        }

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }
        await sock.sendMessage(chatId, { text: userMsg }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
