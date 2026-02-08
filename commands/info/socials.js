const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const { command, proto, generateWAMessageContent, generateWAMessageFromContent } = helpers;
    const cmd = command;

    switch (cmd) {
        case 'ig':
        case 'instagram':
            await sock.sendMessage(chatId, {
                text: `📸 *Instagram:* ${config.instagram}\n📸 *Instagram 2:* ${config.instagram2}`,
            }, { quoted: msg });
            break;
        case 'tg':
        case 'telegram':
            await sock.sendMessage(chatId, {
                text: `✈️ *Telegram:* ${config.telegram}`,
            }, { quoted: msg });
            break;
        case 'yt':
        case 'youtube':
            await sock.sendMessage(chatId, {
                text: `📺 *YouTube:* ${config.youtube}`,
            }, { quoted: msg });
            break;
        case 'fb':
        case 'facebook':
            await sock.sendMessage(chatId, {
                text: `📘 *Facebook:* ${config.facebook}\n📘 *Page:* ${config.facebookPage}`,
            }, { quoted: msg });
            break;
        case 'channel':
            await sock.sendMessage(chatId, {
                text: `📢 *WhatsApp Channel:* ${config.officialChannel}`,
            }, { quoted: msg });
            break;
        case 'web':
        case 'portfolio':
            await sock.sendMessage(chatId, {
                text: `🌐 *Portfolio:* ${config.portfolio}`,
            }, { quoted: msg });
            break;
        default:
            // This case handles the general info/socials menu
            const ownerInfoText = `🌟 *Hamza Amirni - حمزة اعمرني* 🌟

أنا هو الذكاء الاصطناعي المطور من طرف **حمزة اعمرني**.

🚀 *خدمات المطور (Marketing):*
أنا ماشي غير بوت، حمزة كيقاد بزاف ديال الخدمات التقنية:
✅ تصميم وتطوير المواقع الإلكترونية (Websites)
✅ إنشاء بوتات واتساب
✅ حلول الذكاء الاصطناعي

ايلى بغيتي تصاوب شي بوت بحالي ولا عندك مشروع ويب، تواصل مع حمزة نيشان! ✨`;

            try {
                const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");
                let imageMessage;
                if (fs.existsSync(imagePath)) {
                    const { imageMessage: imgMsg } = await generateWAMessageContent(
                        { image: fs.readFileSync(imagePath) },
                        { upload: sock.waUploadToServer },
                    );
                    imageMessage = imgMsg;
                }

                const buttons = [
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "📢 WhatsApp Channel",
                            url: config.officialChannel,
                        }),
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "📸 Instagram",
                            url: config.instagram,
                        }),
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "📘 Facebook",
                            url: config.facebook,
                        }),
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🌐 Portfolio / Contact",
                            url: config.portfolio,
                        }),
                    },
                ];

                const msgContent = generateWAMessageFromContent(
                    chatId,
                    {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadata: {},
                                    deviceListMetadataVersion: 2,
                                },
                                interactiveMessage:
                                    proto.Message.InteractiveMessage.fromObject({
                                        body: proto.Message.InteractiveMessage.Body.create({
                                            text: ownerInfoText,
                                        }),
                                        footer: proto.Message.InteractiveMessage.Footer.create({
                                            text: `乂 ${config.botName}`,
                                        }),
                                        header: proto.Message.InteractiveMessage.Header.create({
                                            title: "Social Accounts",
                                            subtitle: "حمزة اعمرني",
                                            hasMediaAttachment: !!imageMessage,
                                            imageMessage: imageMessage,
                                        }),
                                        nativeFlowMessage:
                                            proto.Message.InteractiveMessage.NativeFlowMessage.fromObject(
                                                {
                                                    buttons: buttons,
                                                },
                                            ),
                                    }),
                            },
                        },
                    },
                    { quoted: msg },
                );

                await sock.relayMessage(chatId, msgContent.message, {
                    messageId: msgContent.key.id,
                });
            } catch (e) {
                console.error("Error sending social menu:", e);
                // Fallback to text if error
                await sock.sendMessage(
                    chatId,
                    { text: ownerInfoText + "\n\n" + config.instagram },
                    { quoted: msg },
                );
            }
            break;
    }
};
