const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');

class ImgEditorAI {
    static base = "https://imgeditor.co/api";

    static async getUploadUrl(buffer) {
        const res = await axios.post(`${this.base}/get-upload-url`, {
            fileName: "photo.jpg",
            contentType: "image/jpeg",
            fileSize: buffer.length,
        }, {
            headers: { 'content-type': 'application/json' },
            timeout: 20000,
        });
        return res.data;
    }

    static async upload(uploadUrl, buffer) {
        await axios.put(uploadUrl, buffer, {
            headers: { 'content-type': 'image/jpeg' },
            timeout: 30000,
        });
    }

    static async generate(prompt, imageUrl) {
        const res = await axios.post(`${this.base}/generate-image`, {
            prompt,
            styleId: "realistic",
            mode: "image",
            imageUrl,
            imageUrls: [imageUrl],
            numImages: 1,
            outputFormat: "png",
            model: "nano-banana",
        }, {
            headers: { 'content-type': 'application/json' },
            timeout: 30000,
        });
        return res.data;
    }

    static async check(taskId) {
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const res = await axios.get(`${this.base}/generate-image/status?taskId=${taskId}`, { timeout: 15000 });
            if (res.data?.status === "completed") return res.data.imageUrl;
            if (res.data?.status === "failed") throw new Error("فشلت مهمة التعديل");
        }
        throw new Error("انتهت مدة الانتظار");
    }
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const directImg = msg.message?.imageMessage;
    const hasQuotedImg = quotedMsg?.imageMessage || quotedMsg?.documentWithCaptionMessage?.message?.imageMessage;

    if (!hasQuotedImg && !directImg) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════════╗\n║  ✏️ *IMGEDITOR AI PRO* ║\n╚══════════════════════╝\n\n📸 *الرجاء الرد على صورة مع وصف التعديل*\n\n*أمثلة:*\n.imgedit اجعلها كرتون\n.imgedit حولها لأنمي\n.imgedit cyberpunk style\n\n─────────────────────\n📸 instagram.com/hamza.amirni`,
        }, { quoted: msg });
    }

    const prompt = args.join(' ').trim();
    if (!prompt) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════════╗\n║  ✏️ *IMGEDITOR AI PRO* ║\n╚══════════════════════╝\n\n⚠️ *يرجى إضافة وصف التعديل*\n\n*مثال:*\n.imgedit اجعلها تبدو مثل لوحة زيتية\n\n─────────────────────`,
        }, { quoted: msg });
    }

    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════════╗\n║  ✏️ *IMGEDITOR AI PRO* ║\n╚══════════════════════╝\n\n⏳ *جاري تحميل الصورة...*\n🔄 يرجى الانتظار (20-50 ثانية)`,
    }, { quoted: msg });

    try {
        let targetMsg = msg;
        if (hasQuotedImg) {
            targetMsg = {
                message: quotedMsg,
                key: msg.message.extendedTextMessage.contextInfo,
            };
        }

        const buffer = await downloadMediaMessage(
            targetMsg,
            'buffer',
            {},
            { logger: pino({ level: 'silent' }) }
        );

        await sock.sendMessage(chatId, { edit: waitMsg.key, text: `╔══════════════════════╗\n║  ✏️ *IMGEDITOR AI PRO* ║\n╚══════════════════════╝\n\n📤 *جاري رفع الصورة...*` });

        const up = await ImgEditorAI.getUploadUrl(buffer);
        if (!up?.uploadUrl || !up?.publicUrl) throw new Error('فشل الحصول على رابط الرفع');

        await ImgEditorAI.upload(up.uploadUrl, buffer);

        await sock.sendMessage(chatId, { edit: waitMsg.key, text: `╔══════════════════════╗\n║  ✏️ *IMGEDITOR AI PRO* ║\n╚══════════════════════╝\n\n🎨 *جاري التعديل بالذكاء الاصطناعي...*\n⏳ 20-50 ثانية\n\n📝 *الوصف:* ${prompt}` });

        const task = await ImgEditorAI.generate(prompt, up.publicUrl);
        if (!task?.taskId) throw new Error('فشل بدء مهمة التعديل');

        const resultUrl = await ImgEditorAI.check(task.taskId);
        if (!resultUrl) throw new Error('فشل الحصول على النتيجة');

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        const responseBuffer = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const finalBuffer = Buffer.from(responseBuffer.data, 'binary');

        await sock.sendMessage(chatId, {
            image: finalBuffer,
            caption: `╔══════════════════════╗\n║  ✏️ *IMGEDITOR AI PRO* ║\n╚══════════════════════╝\n\n✅ *تم التعديل بنجاح!*\n📝 *الوصف:* ${prompt}\n\n*🚀 Hamza Amirni Bot*\n─────────────────────\n📸 instagram.com/hamza.amirni`,
            contextInfo: {
                externalAdReply: {
                    title: '✏️ ImgEditor AI Pro',
                    body: 'Hamza Amirni Bot',
                    thumbnailUrl: resultUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            },
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('ImgEditAI Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشل التعديل*\n\n${e.message}\n\nيرجى المحاولة لاحقاً.`,
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
