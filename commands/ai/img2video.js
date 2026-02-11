const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const { uploadToTmpfiles } = require('../../lib/media');

module.exports = async (sock, chatId, msg, args) => {
    let q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
    let mime = (q.imageMessage || q.documentWithCaptionMessage?.message?.imageMessage)?.mimetype || "";

    // Check if the message itself is an image
    if (!mime.startsWith("image/") && msg.message?.imageMessage) {
        q = msg.message;
        mime = msg.message.imageMessage.mimetype;
    }

    if (!mime.startsWith("image/")) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *يرجى الرد على صورة لتحويلها لفيديو:*\n\n*.img2video <الوصف>*\n\nمثال:\n.img2video اجعلها تتحرك ببطء`
        }, { quoted: msg });
    }

    const prompt = args.join(" ");
    if (!prompt) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *نسيتي الوصف! ضروري تقولي كيفاش بغيتيها تكون*\n\nمثال:\n.img2video اجعل الشخصية تضحك`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🔁", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, { text: "⏳ جاري رفع الصورة للسيرفر المؤقت..." }, { quoted: msg });

    try {
        const quotedMsg = { message: q };
        const buffer = await downloadMediaMessage(
            quotedMsg,
            "buffer",
            {},
            { logger: pino({ level: "silent" }) },
        );

        const imageUrl = await uploadToTmpfiles(buffer);
        if (!imageUrl) throw new Error("فشل رفع الصورة لـ tmpfiles");

        await sock.sendMessage(chatId, { edit: waitMsg.key, text: "⏳ جاري إنشاء الفيديو بالذكاء الاصطناعي (veo31ai)... قد يستغرق 3-5 دقائق." });

        const payload = {
            videoPrompt: prompt,
            videoAspectRatio: "16:9",
            videoDuration: 5,
            videoQuality: "540p",
            videoModel: "v4.5",
            videoImageUrl: imageUrl,
            videoPublic: false,
        };

        const gen = await axios.post("https://veo31ai.io/api/pixverse-token/gen", payload, {
            headers: { "Content-Type": "application/json" },
            timeout: 60000,
        });

        const taskId = gen.data.taskId;
        if (!taskId) throw new Error("لم يتم استلام taskId من السيرفر");

        await sock.sendMessage(chatId, { edit: waitMsg.key, text: `✅ بدأت المهمة (ID: ${taskId})\n⏳ يتم المعالجة دابا... تسنا واحد شوية (3-5 دقائق).` });

        let videoUrl;
        const timeout = Date.now() + 300000; // 5 minutes timeout

        while (Date.now() < timeout) {
            await new Promise((r) => setTimeout(r, 10000));

            try {
                const res = await axios.post(
                    "https://veo31ai.io/api/pixverse-token/get",
                    {
                        taskId,
                        videoPublic: false,
                        videoQuality: "540p",
                        videoAspectRatio: "16:9",
                        videoPrompt: prompt,
                    },
                    { headers: { "Content-Type": "application/json" } }
                );

                if (res.data?.videoData?.url) {
                    videoUrl = res.data.videoData.url;
                    break;
                }
            } catch (pollError) {
                console.error("Polling error:", pollError.message);
                continue;
            }
        }

        if (!videoUrl) throw new Error("انتهى الوقت (Timeout) أو فشل الفيديو.");

        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: `🎥 *Video AI Generated*\n\n📝 *Prompt:* ${prompt}\n\n*🚀 Hamza Amirni Bot*`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { delete: waitMsg.key });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Img2Video Error:", e);
        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: `❌ فشل إنشاء الفيديو: ${e.message}`
        });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
