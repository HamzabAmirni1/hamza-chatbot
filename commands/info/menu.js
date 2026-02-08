const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const { getUptime } = require('../lib/utils');
const fs = require('fs-extra');
const path = require('path');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    // Determine image
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

    const menuText = `✨ *───❪ ${settings.botName.toUpperCase()} ❫───* ✨

🤖 *BOT IDENTITY:*
أنا الذكاء الاصطناعي المطور من طرف *حمزة اعمرني*.
أنا خدام أوتوماتيك (Auto-Reply) بلا ما تحتاج تدير نقطة، غير سولني وغادي نجاوبك فالحين! 🧠⚡

┏━━━━━━━━━━━━━━━━━━┓
┃  🛠️ *AI IMAGE TOOLS*
┃ ├ 🪄 *.nano* ┈ تعديل سحري
┃ ├ ✨ *.hd* ┈ تحسين الجودة
┃ ├ 🖼️ *.bg* ┈ إزالة الخلفية
┃ ├ 🎨 *.draw* ┈ الرسم الذكي
┃ └ 🧠 *.hl* ┈ تحليل الصور
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  🤖 *AI CHAT MODELS*
┃ ├ 🤖 *.gpt4o* ┈ GPT-4o
┃ ├ ⚡ *.gpt4om* ┈ 4o Mini
┃ ├ 🧠 *.o1* ┈ OpenAI O1
┃ └ 💬 *Auto-Reply*
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  📡 *ADDITIONAL SERVICES*
┃ ├ 📱 *.tempnum* ┈ أرقام وهمية
┃ ├ 🔍 *.yts* ┈ بحث يوتيوب
┃ ├ 🌡️ *.weather* ┈ حالة الطقس
┃ └ 🏓 *.ping* ┈ سرعة البوت
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  🕋 *ISLAMIC FEATURES*
┃ ├ 🤲 *.ad3iya* ┈ أدعية وأذكار
┃ ├ 📖 *.ayah* ┈ آية من القرآن
┃ ├ 🕋 *.quran* ┈ سورة كاملة
┃ └ 📚 *.tafsir* ┈ تفسير الآيات
┗━━━━━━━━━━━━━━━━━━┛

👑 *Developer:* ${settings.botOwner}
📌 *Uptime:* ${getUptime()}
✨ *Active 24/7 on Koyeb* ✨`;

    const cards = [
        {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: menuText
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: `👋 مرحبًا @${msg.pushName || 'User'}`,
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
                            display_text: "Chaine Whatsapp",
                            url: settings.officialChannel
                        })
                    },
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "Owner",
                            url: `https://wa.me/${settings.ownerNumber[0]}`
                        })
                    },
                    {
                        "name": "cta_url",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "Facebook",
                            url: settings.facebook
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
                        text: "Bot Commands Menu"
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: settings.botName
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
    await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
};
