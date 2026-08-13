const axios = require('axios');
const config = require('../../config');
const { translateToEn } = require('../../lib/ai');

// Free video API - No API key needed!
// Uses veo31ai.io (PixVerse backend) - completely free

module.exports = async (sock, chatId, msg, args) => {
    const prompt = args.join(' ').trim();

    if (!prompt) {
        return await sock.sendMessage(chatId, {
            text: `🎬 *AI Video Generator (Free)*\n\n📝 *الاستخدام:*\n.aiideo [وصف الفيديو]\n\n*أمثلة:*\n🔸 .aivideo بحر هادئ مع غروب الشمس\n🔸 .aivideo سيارة تمشي في شوارع مضيئة ليلاً\n🔸 .aivideo ذئب يجري في الغابة\n🔸 .aivideo صاروخ ينطلق نحو الفضاء\n\n⚙️ *المزايا:*\n• ✅ مجاني 100% - بلا مفتاح API\n• 🎯 جودة: 540p\n• ⏱️ 5 ثوان\n• 📐 نسبة: 16:9`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🎬", key: msg.key } });

    const waitMsg = await sock.sendMessage(chatId, {
        text: `🎬 *AI Video (Free)*\n\n⏳ جاري إنشاء الفيديو...\n📝 *الطلب:* ${prompt}\n\n💡 قد يستغرق 2-5 دقائق`
    }, { quoted: msg });

    try {
        // Translate to English for better results
        let enPrompt = prompt;
        try {
            enPrompt = await translateToEn(prompt);
        } catch (e) {
            console.log("Translation failed, using Arabic:", e.message);
        }

        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: `🎬 *AI Video (Free)*\n\n🚀 *جاري الإرسال للـ API...*\n📝 *AR:* ${prompt}\n🌐 *EN:* ${enPrompt}\n\n⏳ سيصلك الفيديو قريباً...`
        });

        // Step 1: Create video generation task - FREE, no key needed
        const payload = {
            videoPrompt: enPrompt + ', cinematic quality, smooth motion, high detail',
            videoAspectRatio: "16:9",
            videoDuration: 5,
            videoQuality: "540p",
            videoModel: "v4.5",
            videoPublic: false
        };

        const genRes = await axios.post("https://veo31ai.io/api/pixverse-token/gen", payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 60000
        });

        const taskId = genRes.data?.taskId;
        if (!taskId) throw new Error("فشل في إنشاء المهمة، يرجى المحاولة لاحقاً");

        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: `🎬 *AI Video (Free)*\n\n✅ *تم قبول الطلب!*\n🆔 Task: ${taskId}\n\n⏳ جاري المعالجة... (2-5 دقائق)\n🔄 يتم التحقق كل 15 ثانية`
        });

        // Step 2: Poll for result (max 6 minutes)
        const timeout = Date.now() + 360000;
        let videoUrl = null;
        let attempt = 0;

        while (Date.now() < timeout) {
            await new Promise(r => setTimeout(r, 15000));
            attempt++;

            try {
                const pollRes = await axios.post(
                    "https://veo31ai.io/api/pixverse-token/get",
                    {
                        taskId,
                        videoPublic: false,
                        videoQuality: "540p",
                        videoAspectRatio: "16:9",
                        videoPrompt: enPrompt
                    },
                    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
                );

                if (pollRes.data?.videoData?.url) {
                    videoUrl = pollRes.data.videoData.url;
                    break;
                }

                // Update status every minute
                if (attempt % 4 === 0) {
                    const elapsed = Math.floor((Date.now() - (timeout - 360000)) / 60000);
                    await sock.sendMessage(chatId, {
                        edit: waitMsg.key,
                        text: `🎬 *AI Video (Free)*\n\n🔄 *لا تزال المعالجة جارية...*\n⏱️ وقت منقضي: ${elapsed + 1} دقائق\n\n⏳ تحمل قليلاً...`
                    });
                }
            } catch (pollErr) {
                console.log("Polling attempt failed:", pollErr.message);
            }
        }

        if (!videoUrl) throw new Error("انتهى وقت الانتظار (6 دقائق). حاول مرة أخرى أو جرب وصفاً أبسط");

        // Delete wait message
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        // Send the video
        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: `🎬 *AI Video Generator* ✨\n\n📝 *الطلب:* ${prompt}\n🆓 *API:* Free (veo31ai.io)\n🎯 *الجودة:* 540p | 16:9\n⏱️ *المدة:* 5 ثوان\n\n⚔️ *${config.botName}*`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "🎬", key: msg.key } });

    } catch (err) {
        console.error("AiVideo Error:", err.message);

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            text: `❌ *فشل إنشاء الفيديو*\n\n💬 *السبب:* ${err.message}\n\n💡 *حلول ممكنة:*\n• جرب وصفاً أبسط\n• حاول مرة أخرى\n• جرب أمر: .grokvideo`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
