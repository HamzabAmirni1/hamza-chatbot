const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const fs = require('fs-extra');
const path = require('path');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;
    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");
    let imageMessage;

    // Compact Menu Text
    const menuText = `🤖 *${settings.botName.toUpperCase()}*
⚡ *Dev:* ${settings.botOwner}

━━━━━━━━━━━━━━━━
🎨 *AI & IMAGE*
.gen | .deepimg | .draw | .nano
.imgedit | .hd | .upscale | .colorize
.brat | .img2video | .sketch | .blur

🖼️ *PHOTO SEARCH*
.wallpaper | .googleimg | .4kwallpaper
.toimg | .style | .gimage

📥 *DOWNLOADER*
.play | .video | .fb | .ig | .ytmp4
.tiktok | .pinterest | .lyrics | .capcut

🌙 *ISLAMIC*
.quranmp3 | .qdl | .ad3iya | .ayah | .tafsir

🛠️ *TOOLS*
.sticker | .ping | .weather | .yts
.ffnews | .alloschool | .tempnum
━━━━━━━━━━━━━━━━
`;

    if (isTelegram) {
        const photo = fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg";

        return await sock.sendMessage(chatId, {
            image: photo,
            caption: menuText,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📸 Instagram", url: settings.instagram },
                        { text: "🎥 YouTube", url: settings.youtube }
                    ],
                    [
                        { text: "📢 WhatsApp Channel", url: settings.officialChannel },
                        { text: "👤 Contact Owner", callback_data: ".owner" }
                    ]
                ]
            }
        });
    }

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

    const cards = [
        {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: menuText
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: `👋 Hlan, @${msg.pushName || 'User'}`,
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
                            display_text: "👤 Contact Owner",
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
                        text: "Hamza Amirni Bot"
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
    await sock.sendMessage(chatId, { react: { text: "⚡", key: msg.key } });
};
