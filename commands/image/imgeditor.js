const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { ImgEditor } = require('../../lib/media');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    let q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
    let mime = (q.imageMessage || q.documentWithCaptionMessage?.message?.imageMessage)?.mimetype || "";

    // Check if the message itself is an image
    if (!mime.startsWith("image/") && msg.message?.imageMessage) {
        q = msg.message;
        mime = msg.message.imageMessage.mimetype;
    }

    if (!mime.startsWith("image/")) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *يرجى الرد على صورة أو إرسال صورة مع الأمر:*\n\n*.imgeditor <الوصف>*\n\nمثال:\n.imgeditor حولها إلى كرتون`
        }, { quoted: msg });
    }

    const text = args.join(" ");
    if (!text) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *نسيتي الوصف!*\n\nمثال:\n.imgeditor اجعلها تبدو كأنها مرسومة بالزيت`
        }, { quoted: msg });
    }

    const waitMsg = await sock.sendMessage(chatId, { text: "⏳ جاري تحميل الصورة..." }, { quoted: msg });

    try {
        const quotedMsg = { message: q };
        const buffer = await downloadMediaMessage(
            quotedMsg,
            "buffer",
            {},
            { logger: pino({ level: "silent" }) },
        );

        if (!buffer) throw new Error("فشل التحميل");

        await sock.sendMessage(chatId, { edit: waitMsg.key, text: "📤 جاري رفع الصورة..." });

        const up = await ImgEditor.getUploadUrl(buffer);
        if (!up || !up.uploadUrl || !up.publicUrl) throw new Error("فشل الحصول على رابط الرفع");

        await ImgEditor.upload(up.uploadUrl, buffer);

        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: "🎨 جاري التعديل بالذكاء الاصطناعي (قد يستغرق 20-50 ثانية)..."
        });

        const task = await ImgEditor.generate(text, up.publicUrl);
        if (!task || !task.taskId) throw new Error("فشل بدء مهمة التعديل");

        const resultUrl = await ImgEditor.check(task.taskId);

        if (!resultUrl) throw new Error("فشل الحصول على النتيجة");

        await sock.sendMessage(chatId, { delete: waitMsg.key });
        await sock.sendMessage(chatId, {
            image: { url: resultUrl },
            caption: `✨ *تـم الـتـعـديـل بـنـجـاح!* ✨\n\n📝 *الوصف:* ${text}\n\n*🚀 ImgEditor AI*`
        }, { quoted: msg });

    } catch (e) {
        console.error("ImgEditor Error:", e);
        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: "❌ فشلت العملية. يرجى المحاولة لاحقاً."
        });
    }
};
