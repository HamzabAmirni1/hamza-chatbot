const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const { uploadToTmpfiles, uploadToCatbox } = require('../../lib/media');

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

    try {
        await sock.sendMessage(chatId, { react: { text: "🔁", key: msg.key } });
        const waitMsg = await sock.sendMessage(chatId, { text: "⏳ جاري رفع الصورة للسيرفر المؤقت (Catbox)..." }, { quoted: msg });

        const quotedMsg = { message: q };
        const buffer = await downloadMediaMessage(
            quotedMsg,
            "buffer",
            {},
            { logger: pino({ level: "silent" }) },
        );

        // Try Catbox first, then Tmpfiles
        let imageUrl = await uploadToCatbox(buffer);
        if (!imageUrl) {
            await sock.sendMessage(chatId, { edit: waitMsg.key, text: "⚠️ فشل الرفع لـ Catbox، جاري المحاولة مع Tmpfiles..." });
            imageUrl = await uploadToTmpfiles(buffer);
        }

        if (!imageUrl) throw new Error("فشل رفع الصورة لجميع السيرفرات المؤقتة.");

        await sock.sendMessage(chatId, { edit: waitMsg.key, text: "⏳ جاري إنشاء مهمة الفيديو... (API: veo31ai.io)" });

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
        if (!taskId) throw new Error("لم يتم استلام taskId من السيرفر. قد يكون هناك ضغط على الخدمة.");

        await sock.sendMessage(chatId, { edit: waitMsg.key, text: `✅ تم إنشاء المهمة بنجاح (ID: ${taskId})\n⏳ معالجة الفيديو بدأت... قد يستغرق الأمر 3-5 دقائق.` });

        let videoUrl;
        const timeout = Date.now() + 300000; // 5 minutes timeout

        while (Date.now() < timeout) {
            await new Promise((r) => setTimeout(r, 15000)); // Poll every 15s

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
                    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
                );

                if (res.data?.videoData?.url) {
                    videoUrl = res.data.videoData.url;
                    break;
                }
            } catch (pollError) {
                console.error("Polling error:", pollError.message);
                if (pollError.response?.status === 500) {
                    // Sometimes 500 means "not ready yet" in poorly designed APIs, but let's keep polling
                }
            }
        }

        if (!videoUrl) throw new Error("انتهى وقت الانتظار (5 دقائق). السيرفر قد يكون مثقلاً أو فشل في معالجة الفيديو.");

        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: `🎥 *Video AI Generated*\n\n📝 *Prompt:* ${prompt}\n✅ *API:* veo31ai.io\n\n*🚀 Hamza Amirni Bot*`
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
