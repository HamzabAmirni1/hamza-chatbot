/**
   • الميزة: تعديل الصور بالذكاء الاصطناعي - نانو بنانا
   • المطور: حمزة اعمرني (𝐇𝐀𝐌𝐙𝐀 𝐀𝐌𝐈𝐑𝐍𝐈)
   • القناة: https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p
**/

const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const CryptoJS = require("crypto-js");
const fs = require("fs");
const path = require("path");
const config = require("../../config");

const AES_KEY = "ai-enhancer-web__aes-key";
const AES_IV = "aienhancer-aesiv";

function encryptSettings(obj) {
    return CryptoJS.AES.encrypt(
        JSON.stringify(obj),
        CryptoJS.enc.Utf8.parse(AES_KEY),
        {
            iv: CryptoJS.enc.Utf8.parse(AES_IV),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }
    ).toString();
}

async function processImageAI(buffer, prompt) {
    try {
        const img = buffer.toString("base64");

        const settingsData = encryptSettings({
            prompt,
            size: "2K",
            aspect_ratio: "match_input_image",
            output_format: "jpeg",
            max_images: 1
        });

        const headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
            "Content-Type": "application/json",
            Origin: "https://aienhancer.ai",
            Referer: "https://aienhancer.ai/ai-image-editor"
        };

        const create = await axios.post(
            "https://aienhancer.ai/api/v1/r/image-enhance/create",
            {
                model: 2,
                function: "image-edit",
                image: `data:image/jpeg;base64,${img}`,
                settings: settingsData
            },
            { headers }
        );

        const id = create?.data?.data?.id;
        if (!id) throw new Error("لم يتم العثور على معرف المهمة");

        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 4000));

            const r = await axios.post(
                "https://aienhancer.ai/api/v1/k/image-enhance/result",
                { task_id: id },
                { headers }
            );

            const data = r?.data?.data;
            if (!data) continue;

            if (data.status === "success") {
                return {
                    id,
                    output: data.output,
                    input: data.input
                };
            }

            if (data.status === "failed") {
                throw new Error(data.error || "فشلت العملية");
            }
        }

        throw new Error("استغرق الأمر وقتاً طويلاً جداً");

    } catch (e) {
        throw e;
    }
}

module.exports = async (sock, chatId, msg, args) => {
    let targetMsg = msg;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedInfo = msg.message.extendedTextMessage.contextInfo;
        targetMsg = {
            key: {
                remoteJid: chatId,
                id: quotedInfo.stanzaId,
                participant: quotedInfo.participant
            },
            message: quotedInfo.quotedMessage
        };
    }

    const mime = targetMsg.message?.imageMessage?.mimetype || targetMsg.message?.documentWithCaptionMessage?.message?.imageMessage?.mimetype || "";

    if (!mime.startsWith("image/")) {
        return await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*⚠️ يرجى إرسال أو الرد على صورة*\n\n*مثال:* .nano تحويل الوجه إلى أنمي\n*✨ ──────────────── ✨*`
        }, { quoted: msg });
    }

    const text = args.join(" ");
    if (!text) {
        return await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*📝 يرجى كتابة وصف التعديل*\n\n*مثال:* .nano تغيير الملابس إلى بدلة رسمية\n*✨ ──────────────── ✨*`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, {
        react: { text: "🕒", key: msg.key }
    });

    const waitMsg = await sock.sendMessage(chatId, { text: "🔄 جاري معالجة طلبك وتعديل الصورة بذكاء نانو... يرجى الانتظار." }, { quoted: msg });

    try {
        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!buffer) throw new Error("فشل تحميل الصورة");

        const result = await processImageAI(buffer, text);

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        const caption = `
*✨ ───❪ HAMZA AMIRNI AI ❫─── ✨*

✅ *تم تعديل الصورة بنجاح*

📝 *الوصف:* ${text}

*🚀 تـم الـتـولـيـد بـوسـاطـة نـانـو AI*
`.trim();

        const imgRes = await axios.get(result.output, { responseType: 'arraybuffer', timeout: 30000 });
        const finalBuffer = Buffer.from(imgRes.data, 'binary');

        await sock.sendMessage(
            chatId,
            {
                image: finalBuffer,
                caption: caption,
                contextInfo: {
                    externalAdReply: {
                        title: "Nano AI Image Editor",
                        body: "𝐇𝐀𝐌𝐙𝐀 𝐀𝐌𝐈𝐑𝐍𝐈",
                        thumbnailUrl: result.output,
                        sourceUrl: "https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            },
            { quoted: msg }
        );

        await sock.sendMessage(chatId, {
            react: { text: "✅", key: msg.key }
        });

    } catch (e) {
        console.error(e);
        try { if (waitMsg) await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*❌ فشل التعديل*\n\n📌 تأكد من أن الصورة واضحة والوصف مفهوم\n⚠️ ${e.message}\n*✨ ──────────────── ✨*`
        }, { quoted: msg });

        await sock.sendMessage(chatId, {
            react: { text: "❌", key: msg.key }
        });
    }
}
