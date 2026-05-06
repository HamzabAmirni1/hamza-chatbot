const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const path = require('path');
const fs = require('fs-extra');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;
    const isFacebook = helpers && helpers.isFacebook;
    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");

    const menuText = `🚀 *MEGA AUTOMATION TOOLS* 🦾
━━━━━━━━━━━━━━━━
هذه الأدوات مستوحاة من أضخم سكربتات n8n العالمية للأتمتة والذكاء الاصطناعي.

🛠️ *CONTENT & SOCIAL*
.autopost [نص] - نشر تلقائي (FB + TG)
.news - آخر الأخبار العاجلة (RSS)
.summarize [رابط] - تلخيص مقال طويل

🧠 *AI AGENTS*
.expert [مهمة] - فريق خبراء AI للحلول
.market [منتج] - دراسة سوق سريعة
.code [طلب] - توليد أكواد برمجية معقدة

🔍 *EXTRACTION & TOOLS*
.price [رابط] - جلب سعر منتج من أي موقع
.ocr - استخراج النص من الصور (Reply)
.pdf - تحويل صورة لمستند PDF
.short [رابط] - اختصار روابط طويلة

━━━━━━━━━━━━━━━━
⚠️ *ملاحظة:* بعض هذه الأدوات تتطلب دقة في الروابط لتعمل بكفاءة.
━━━━━━━━━━━━━━━━`;

    if (isTelegram || isFacebook) {
        const photo = fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg";
        return await sock.sendMessage(chatId, { image: photo, caption: menuText });
    }

    // Interactive WhatsApp Menu
    let imageMessage;
    try {
        if (fs.existsSync(imagePath)) {
            const buffer = fs.readFileSync(imagePath);
            const content = await generateWAMessageContent({ image: buffer }, { upload: sock.waUploadToServer });
            imageMessage = content.imageMessage;
        }
    } catch (e) {}

    const cards = [
        {
            body: proto.Message.InteractiveMessage.Body.fromObject({ text: menuText }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: "🦾 Mega Bot Automation",
                hasMediaAttachment: !!imageMessage,
                imageMessage: imageMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    { "name": "quick_reply", "buttonParamsJson": JSON.stringify({ display_text: "👤 التواصل مع المطور", id: ".owner" }) }
                ]
            })
        }
    ];

    const message = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({ text: "Supercharge your Bot!" }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName} v${settings.version}` }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards: cards })
                })
            }
        }
    }, { quoted: msg });

    await sock.relayMessage(chatId, message.message, { messageId: message.key.id });
};
