const axios = require('axios');
const config = require('../../config');
const { translateToEn } = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args) => {
    const prompt = args.join(' ').trim();

    if (!prompt) {
        return await sock.sendMessage(chatId, {
            text: `🎬 *Grok Video AI*\n\n📝 *الاستخدام:*\n.grokvideo [وصف الفيديو]\n\n*أمثلة:*\n🔸 .grokvideo بحر هادئ مع غروب الشمس\n🔸 .grokvideo سيارة تمشي في شوارع مضيئة\n🔸 .grokvideo نجوم تتساقط فوق جبال مغربية\n\n⚙️ *الإعدادات:*\n• المدة: 8 ثوان\n• الجودة: 720p\n• النسبة: 16:9\n\n⚠️ قد يستغرق 3-5 دقائق`
        }, { quoted: msg });
    }

    const apiKey = config.xaiApiKey || process.env.XAI_API_KEY;
    if (!apiKey) {
        return await sock.sendMessage(chatId, {
            text: `❌ *مفتاح Grok API غير موجود*\n\nيرجى تعيين \`XAI_API_KEY\` في متغيرات البيئة.`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🎬", key: msg.key } });

    const waitMsg = await sock.sendMessage(chatId, {
        text: `🎬 *Grok Video AI*\n\n⏳ جاري ترجمة الطلب وإرساله لـ Grok...\n\n📝 *طلبك:* ${prompt}`
    }, { quoted: msg });

    try {
        // Translate prompt to English for better results
        let enPrompt = prompt;
        try {
            enPrompt = await translateToEn(prompt);
        } catch (e) {
            console.log("Translation failed, using original:", e.message);
        }

        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: `🎬 *Grok Video AI*\n\n🚀 *تم الإرسال لـ Grok xAI*\n📝 *الطلب:* ${prompt}\n🌐 *EN:* ${enPrompt}\n\n⏳ جاري توليد الفيديو... (3-5 دقائق)`
        });

        // Step 1: Start video generation
        const genResponse = await axios.post(
            'https://api.x.ai/v1/videos/generations',
            {
                model: 'grok-imagine-video',
                prompt: enPrompt + ', cinematic, high quality, ultra realistic',
                duration: 8,
                aspect_ratio: '16:9',
                resolution: '720p'
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: 30000
            }
        );

        const requestId = genResponse.data?.request_id;
        if (!requestId) throw new Error('لم يتم استلام request_id من Grok API');

        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: `🎬 *Grok Video AI*\n\n✅ *تم قبول الطلب بنجاح!*\n🆔 *ID:* ${requestId.slice(0, 8)}...\n\n⏳ جاري المعالجة... سيصلك الفيديو قريباً\n💡 هذا يستغرق 3-5 دقائق عادةً`
        });

        // Step 2: Poll for result (max 8 minutes)
        const timeout = Date.now() + 480000;
        let videoUrl = null;
        let attempt = 0;

        while (Date.now() < timeout) {
            await new Promise(r => setTimeout(r, 15000)); // Poll every 15s
            attempt++;

            try {
                const pollRes = await axios.get(
                    `https://api.x.ai/v1/videos/${requestId}`,
                    {
                        headers: { 'Authorization': `Bearer ${apiKey}` },
                        timeout: 15000
                    }
                );

                const status = pollRes.data?.status;

                if (attempt % 4 === 0) { // Update message every 4 attempts (1 min)
                    await sock.sendMessage(chatId, {
                        edit: waitMsg.key,
                        text: `🎬 *Grok Video AI*\n\n🔄 *الحالة:* ${status || 'pending'}\n⏱️ *الوقت المنقضي:* ${Math.floor((Date.now() - (timeout - 480000)) / 60000)} دقيقة\n\n⏳ لا تزال المعالجة جارية...`
                    });
                }

                if (status === 'done' && pollRes.data?.video?.url) {
                    videoUrl = pollRes.data.video.url;
                    break;
                } else if (status === 'expired') {
                    throw new Error('انتهت صلاحية الطلب (expired)');
                }
            } catch (pollErr) {
                if (pollErr.response?.status !== 404) {
                    console.error("Grok polling error:", pollErr.message);
                }
            }
        }

        if (!videoUrl) throw new Error('انتهى وقت الانتظار (8 دقائق)، حاول مرة أخرى');

        // Delete wait message
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        // Send the video
        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: `🎬 *Grok Video AI* ✨\n\n📝 *الطلب:* ${prompt}\n🤖 *النموذج:* grok-imagine-video\n🎯 *الجودة:* 720p | 16:9\n⏱️ *المدة:* 8 ثوان\n\n⚔️ *${config.botName}*`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "🎬", key: msg.key } });

    } catch (err) {
        console.error('GrokVideo Error:', err.response?.data || err.message);

        const errMsg = err.response?.data?.error?.message || err.message || 'خطأ غير معروف';
        const isAuthErr = err.response?.status === 401;
        const isQuota = err.response?.status === 429;

        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: `❌ *فشل توليد الفيديو*\n\n${isAuthErr ? '🔑 مفتاح API غير صالح أو منتهي الصلاحية' : isQuota ? '⚠️ تم تجاوز حد الاستخدام، حاول لاحقاً' : `💬 *السبب:* ${errMsg}`}\n\n💡 حاول مرة أخرى أو غير وصف الطلب`
        });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
