const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { PhotoEnhancer, ImageColorizer, processImageAI, aiLabs } = require('../../lib/media');
const { translateToEn } = require('../../lib/ai');


module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const { aiType, aiPrompt } = extra;
    let targetMsg = msg;
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const q = msg.message.extendedTextMessage.contextInfo;
        targetMsg = { message: q.quotedMessage };
    }

    const mime = (
        targetMsg.message?.imageMessage ||
        targetMsg.message?.documentWithCaptionMessage?.message?.imageMessage
    )?.mimetype || "";

    if (!mime.startsWith("image/") && aiType !== "ghibli") {
        return await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*⚠️ يرجى إرسال أو الرد على صورة*\n\n*مثال:* وضح هاد التصويرة\n*✨ ──────────────── ✨*`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏱", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, { text: `✨ *──────────────────────* ✨\n\n⏳ جاري معالجة الصورة بالذكاء الاصطناعي...\n\n✨ *──────────────────────* ✨` }, { quoted: msg });

    const labels = {
        "enhance": ["📈", "تحسين الجودة"],
        "upscale": ["🔍", "تحسين الدقة 4x"],
        "remove-bg": ["✂️", "حذف الخلفية"],
        "colorize": ["🎨", "تلوين الصورة"],
        "ghibli": ["🌿", "فن جيبلي Studio Ghibli"],
        "nano": ["🧠", "تعديل Nano AI"],
    };
    const [icon, labelName] = labels[aiType] || ["🧠", "تعديل AI"];

    try {
        if (aiType === "ghibli") {
            const enPrompt = await translateToEn(aiPrompt || "Studio Ghibli style landscape");
            const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enPrompt + ", studio ghibli style, anime art, high quality")}?width=1024&height=1024&nologo=true&model=flux`;
            try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }
            return await sock.sendMessage(chatId, {
                image: { url },
                caption: `✨ *───❪ HAMZA AMIRNI ❫───* ✨\n\n🎨 *تم توليد فن جيبلي بنجاح*\n\n📝 *الوصف:* ${aiPrompt || "Ghibli Style"}\n\n*🚀 تـم الـتـولـيـد بـوسـاطـة AI Labs*`,
            }, { quoted: msg });
        }

        let buffer;
        if (typeof sock.downloadMediaMessage === 'function') {
            buffer = await sock.downloadMediaMessage(targetMsg);
        } else {
            buffer = await downloadMediaMessage(
                targetMsg,
                "buffer",
                {},
                { logger: pino({ level: "silent" }) },
            );
        }

        if (!buffer) throw new Error("لم يتم العثور على الصورة أو فشل تحميلها.");

        let resultUrl;
        if (aiType === "nano") {
            const tmpFile = path.join(__dirname, "..", "..", "tmp", `${Date.now()}.jpg`);
            if (!fs.existsSync(path.join(__dirname, "..", "..", "tmp")))
                fs.mkdirSync(path.join(__dirname, "..", "..", "tmp"));
            fs.writeFileSync(tmpFile, buffer);
            const res = await processImageAI(tmpFile, aiPrompt);
            resultUrl = res.output;
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        } else if (aiType === "colorize") {
            const colorizer = new ImageColorizer();
            resultUrl = await colorizer.generate(buffer, aiPrompt);
        } else {
            const enhancer = new PhotoEnhancer();
            resultUrl = await enhancer.generate({
                imageBuffer: buffer,
                type: aiType,
            });
        }

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }
        await sock.sendMessage(chatId, {
            image: { url: resultUrl },
            caption: `✨ *──────────────────────* ✨\n        HAMZA AMIRNI BOT\n✨ *──────────────────────* ✨\n\n${icon} *${labelName}*\n✅ *تمت العملية بنجاح!*${aiPrompt ? '\n\n📝 *الوصف:* ' + aiPrompt : ''}\n\n*🚀 Powered by Hamza Amirni Bot*\n──────────────────────\n📸 instagram.com/hamza.amirni`,
            contextInfo: {
                externalAdReply: {
                    title: `${icon} ${labelName} - Hamza Amirni`,
                    body: "🚀 AI Image Processing",
                    thumbnailUrl: resultUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            },
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error(e);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ فشلت العملية: ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
