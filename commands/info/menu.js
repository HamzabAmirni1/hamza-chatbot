const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const fs = require('fs-extra');
const path = require('path');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");
    let imageMessage;

    try {
        if (fs.existsSync(imagePath)) {
            const buffer = fs.readFileSync(imagePath);
            const content = await generateWAMessageContent({ image: buffer }, { upload: sock.waUploadToServer });
            imageMessage = content.imageMessage;
        } else {
            const content = await generateWAMessageContent({ image: { url: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg" } }, { upload: sock.waUploadToServer });
            imageMessage = content.imageMessage;
        }
    } catch (e) {
        console.error("Menu image error", e);
    }

    // High-End Premium Menu Text
    const menuText = `🌟 *${settings.botName.toUpperCase()} PREMIUM*
👤 *المطور:* ${settings.botOwner}

━━━━━━━━━━━━━━━━
🎨 *الذكاء الاصطناعي والإبداع*
.nano | .hd | .draw | .sketch | .blur
.gpt4o | .hl | .img2video | .brat
━━━━━━━━━━━━━━━━

📥 *قسم التحميل (Downloaders)*
.play (Spotify) | .ytdl (YouTube HD)
.video | .fb | .ig | .tiktok | .ytmp4
━━━━━━━━━━━━━━━━

🕋 *الخدمات الإسلامية*
.quran | .quranmp3 | .ad3iya | .ayah
.tafsir | .qdl (تنزيل مباشر)
━━━━━━━━━━━━━━━━

🛠️ *الأدوات والخدمات*
.tomp3 (فيديو ➔ صوت)
.sticker | .weather | .ping | .tempnum
━━━━━━━━━━━━━━━━

📚 *التعليم*
.alloschool (Morocco)
━━━━━━━━━━━━━━━━

💡 *ملاحظة:* البوت يفهم لغتك تلقائياً! حاول التكلم معه بدون أوامر.
`;

    const cards = [
        {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: menuText
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: `👋 مرحباً، ${msg.pushName || 'مستخدمنا العزيز'}`,
                hasMediaAttachment: !!imageMessage,
                imageMessage: imageMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "📸 Instagram",
                            url: settings.instagram
                        })
                    },
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "📢 WhatsApp Channel",
                            url: settings.officialChannel
                        })
                    },
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "🎥 YouTube",
                            url: settings.youtube
                        })
                    },
                    {
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "👤 المطور (Owner)",
                            id: ".owner"
                        })
                    }
                ]
            })
        }
    ];

    const message = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: "تميز مع أفضل تجربة ذكاء اصطناعي"
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: `乂 ${settings.botName} 2026`
                    }),
                    header: proto.Message.InteractiveMessage.Header.create({
                        hasMediaAttachment: false
                    }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                        cards: cards
                    })
                })
            }
        }
    }, { quoted: msg });

    await sock.relayMessage(chatId, message.message, { messageId: message.key.id });
    await sock.sendMessage(chatId, { react: { text: "📜", key: msg.key } });
};
