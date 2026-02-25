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
            const content = await generateWAMessageContent({ image: { url: "https://pollinations.ai/p/cool-robot-assistant" } }, { upload: sock.waUploadToServer });
            imageMessage = content.imageMessage;
        }
    } catch (e) {
        console.error("Menu image error", e);
    }

    // AI & Creative Card
    const textAI = `🤖 *${settings.botName.toUpperCase()} AI*
⚡ *Dev:* ${settings.botOwner}

━━━━━━━━━━━━━━━━
🎨 *AI & IMAGE*
.imagine | .draw | .nano | .hd
.upscale | .colorize | .imgedit
.sketch | .sketch2 | .blur | .brat
.gimg | .wallpaper | .bg | .ghibli

🎬 *AI VIDEO & CHAT*
.img2video | .aivideo | .grok
.gpt4o | .hl (Vision)
━━━━━━━━━━━━━━━━
`;

    // Tools & More Card
    const textOther = `📁 *EXTRA FEATURES*
━━━━━━━━━━━━━━━━
📥 *DOWNLOADER*
.play | .video | .fb | .ig
.tiktok | .pin | .ytdl | .capcut
.tomp3

🌙 *ISLAMIC*
.quran | .qmp3 | .ad3iya | .ayah

🇲🇦 *MAROC & TOOLS*
.hespress | .alwadifa | .ffnews
.weather | .ping | .style | .font
.alloschool | .tempnum
━━━━━━━━━━━━━━━━
`;

    const cards = [
        {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: textAI
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
                            display_text: "Instagram",
                            url: settings.instagram
                        })
                    },
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "WhatsApp Channel",
                            url: settings.officialChannel
                        })
                    },
                    {
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "Contact Owner 👤",
                            id: ".owner"
                        })
                    }
                ]
            })
        },
        {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: textOther
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: `🛠️ Download & Tools`,
                hasMediaAttachment: false
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "YouTube",
                            url: settings.youtube
                        })
                    },
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "Facebook Page",
                            url: settings.facebookPage || settings.facebook
                        })
                    },
                    {
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "Show Menu 📜",
                            id: ".menu"
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
                        text: "Simple & Fast Bot"
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: "Hamza Bot 2026"
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
