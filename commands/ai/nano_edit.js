const axios = require("axios");
const CryptoJS = require("crypto-js");
const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');

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
        const imgBase64 = buffer.toString("base64");

        const settings = encryptSettings({
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
            "https://aienhancer.ai/api/v1/k/image-enhance/create",
            {
                model: 2,
                image: `data:image/jpeg;base64,${imgBase64}`,
                settings
            },
            { headers }
        );

        const id = create?.data?.data?.id;
        if (!id) throw new Error("لم يتم العثور على معرف المهمة");

        for (let i = 0; i < 20; i++) {
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

module.exports = async (sock, sender, msg, args, { command }) => {
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
    const mime = (q.imageMessage || q.documentWithCaptionMessage?.message?.imageMessage)?.mimetype || "";

    if (!mime.startsWith("image/")) {
        return await sock.sendMessage(sender, {
            text: `🦅 *H A M Z A  A M I R N I*\n\n╭━━━ ⌜ ⚠️ خطأ في الوسائط ⌟ ━━━╮\n┃\n┃ 📥 *يرجى إرسال صورة أو الرد عليها*\n┃ 💡 *مثال:* .${command} تحويل الوجه إلى أنمي\n┃\n╰━━━━━━━━━━━━━━━━━━━━╯`
        }, { quoted: msg });
    }

    const text = args.join(" ");
    if (!text) {
        return await sock.sendMessage(sender, {
            text: `🦅 *H A M Z A  A M I R N I*\n\n╭━━━ ⌜ 📝 تنبيه: طلب ناقص ⌟ ━━━╮\n┃\n┃ 🖋️ *يرجى كتابة وصف التعديل المطلوب*\n┃ 💡 *مثال:* .${command} تغيير الملابس إلى بدلة\n┃\n╰━━━━━━━━━━━━━━━━━━━━╯`
        }, { quoted: msg });
    }

    await sock.sendMessage(sender, { react: { text: "🕒", key: msg.key } });
    const waitMsg = await sock.sendMessage(sender, {
        text: `🦅 *H A M Z A  A M I R N I*\n\n╭━━━━━━━━━━━━━━━━━━━━╮\n┃ ⏳ *جاري تعديل الصورة بالذكاء الاصطناعي...*\n┃ 🖌️ *الطلب:* ${text}\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n💡 *قد يستغرق الأمر 30-60 ثانية*`
    }, { quoted: msg });

    try {
        const quotedMsg = { message: q };
        const buffer = await downloadMediaMessage(
            quotedMsg,
            "buffer",
            {},
            { logger: pino({ level: "silent" }) },
        );

        const result = await processImageAI(buffer, text);

        const caption = `
🦅 *H A M Z A  A M I R N I  B O T*

╭━━━ ⌜ ✨ تم التعديل بنجاح ⌟ ━━━╮
┃
┃ �️ *الوصف:* ${text}
┃ 🏆 *المحرك:* Nano Banana Editor
┃
╰━━━━━━━━━━━━━━━━━━━━╯

*🚀 تم بواسطة حمزة اعمرني*
`.trim();

        await sock.sendMessage(
            sender,
            {
                image: { url: result.output },
                caption: caption,
                contextInfo: {
                    externalAdReply: {
                        title: "H A M Z A  A M I R N I  A I",
                        body: "Nano Banana AI Editor",
                        thumbnailUrl: result.output,
                        sourceUrl: "https://instagram.com/hamza_amirni_01",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            },
            { quoted: msg }
        );

        await sock.sendMessage(sender, { delete: waitMsg.key });
        await sock.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(sender, {
            edit: waitMsg.key,
            text: `🦅 *H A M Z A  A M I R N I*\n\n╭━━━ ⌜ ❌ فشل التعديل ⌟ ━━━╮\n┃\n┃ ⚠️ تأكد من وضوح الصورة والوصف\n┃ 💡 حاول بجملة أبسط بالإنجليزية\n┃\n╰━━━━━━━━━━━━━━━━━━━━╯`
        });
        await sock.sendMessage(sender, { react: { text: "❌", key: msg.key } });
    }
};
