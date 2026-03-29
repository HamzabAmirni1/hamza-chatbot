const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const fs = require('fs-extra');
const path = require('path');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;
    const isFacebook = helpers && helpers.isFacebook;
    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");
    let imageMessage;

    // Compact Menu Text
    const menuText = `🤖 *${settings.botName.toUpperCase()}*
⚡ *Dev:* ${settings.botOwner}
📅 *Date:* ${new Date().toLocaleDateString('ar-MA')}

━━━━━━━━━━━━━━━━
🎨 *AI IMAGE*
.gen | .imagine | .deepimg | .draw
.airbrush | .removebg | .hd | .upscale
.colorize | .brat | .img2video | .sketch
.blur | .style | .hl | .wallpaper
.hdv3 | .aiedit

🖼️ *STABLE DIFFUSION (SD)*
.sd | .sdimg | .sdface | .sdprompt
.sdinpaint | .txt2img | .img2img
.gfpgan | .inpaint | .clip

🧠 *SMART AI*
.deepseek | .gpt4o | .analyze | .vision

📥 *DOWNLOADER*
.play | .video | .fb | .ig | .ytmp4
.tiktok | .pinterest | .lyrics | .capcut
.yts | .tomp3 | .ytdl | .ytv | .yta

🕋 *ISLAMIC & RAMADAN*
.quran | .quranmp3 | .qdl | .qurancard
.ramadan on/off | .ad3iya30 | .khatm
.salat on/off | .ayah | .tafsir | .dua

🛡️ *GROUP ADMIN (TG)*
.kick | .ban | .promote | .tagall
.antilink on/off

🛠️ *TOOLS & INFOS*
.sticker | .ping | .weather | .status
.tempnum | .alloschool | .owner
━━━━━━━━━━━━━━━━
`;

    if (isTelegram || isFacebook) {
        const photo = fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg";

        return await sock.sendMessage(chatId, {
            image: photo,
            caption: menuText,
            ...(isTelegram ? {
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
            } : {})
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
