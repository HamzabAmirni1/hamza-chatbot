const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const fs = require('fs-extra');
const path = require('path');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");

    async function createImage(url) {
        const { imageMessage } = await generateWAMessageContent({
            image: { url }
        }, {
            upload: sock.waUploadToServer
        });
        return imageMessage;
    }

    async function createLocalImage(buffer) {
        const { imageMessage } = await generateWAMessageContent({
            image: buffer
        }, {
            upload: sock.waUploadToServer
        });
        return imageMessage;
    }

    let menuHeaderImage;
    try {
        if (fs.existsSync(imagePath)) {
            menuHeaderImage = await createLocalImage(fs.readFileSync(imagePath));
        } else {
            menuHeaderImage = await createImage("https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg");
        }
    } catch (e) {
        console.error("Menu image error", e);
    }

    const sections = [
        {
            title: "🎨 الذكاء الاصطناعي - صور",
            text: "🖼️ .imagine | .draw — توليد صورة\n⚡ .nano — صورة Nano Banana 4K\n✏️ .nanoedit — تعديل صورة Nano\n🎭 .ai-image — Pollinations Art\n🌸 .miramuse — Miramuse AI Art\n🌿 .ghibli — فن Studio Ghibli\n🔧 .imgeditor — ImgEditor AI\n✨ .imgedit — تعديل AI Pro\n🔍 .upscale — رفع جودة 4x\n🎨 .colorize — تلوين الصور\n✏️ .sketch | .sketch2 — رسم رصاص\n📸 .gimg — بحث صور Google\n🌆 .wallpaper — خلفيات 4K\n💀 .removebg | .bg — حذف خلفية"
        },
        {
            title: "🎬 الذكاء الاصطناعي - فيديو",
            text: "🤖 .aivideo — توليد فيديو AI\n⚡ .grokvideo — Grok AI Video\n📽️ .img2video — صورة ➜ فيديو AI\n💬 .gpt4o — GPT-4o Chat\n👁️ .hl — تحليل الصور"
        },
        {
            title: "📥 قسم التحميل",
            text: "▶️ .play | .song — تحميل أغنية YT\n🎬 .video | .vid — فيديو YouTube\n⬇️ .ytdl | .ytmp4 — YouTube DL\n📘 .fb — Facebook\n📸 .ig — Instagram\n🎵 .tiktok — TikTok\n📌 .pinterest — Pinterest\n🎬 .capcut — CapCut\n🎵 .tomp3 — فيديو ➜ MP3"
        },
        {
            title: "🕋 الخدمات الإسلامية",
            text: "📖 .quran — قراءة سورة\n🎙️ .quranmp3 — تلاوة mp3\n📄 .quranpdf — تحميل PDF\n🔊 .quransura — سورة صوت\n📝 .ayah — آية عشوائية\n📚 .tafsir — تفسير آية\n🙏 .ad3iya — أدعية\n🌙 .ramadan — دعاء رمضان\n✅ .khatm — متابعة ختمة"
        },
        {
            title: "🇲🇦 المغرب & أخرى",
            text: "📰 .hespress — أخبار هسبريس\n💼 .alwadifa — وظائف المغرب\n🏫 .alloschool — دروس مدرسية\n🌤️ .weather — حالة الطقس\n📶 .ping — حالة البوت\n🎮 .ffnews — أخبار فري فاير\n✨ .style — تزيين النصوص"
        }
    ];

    const cards = sections.map((sec, idx) => ({
        body: proto.Message.InteractiveMessage.Body.fromObject({
            text: sec.text
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
            title: sec.title,
            hasMediaAttachment: idx === 0,
            imageMessage: idx === 0 ? menuHeaderImage : undefined
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
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({
                        display_text: "👤 Owner",
                        id: ".owner"
                    })
                }
            ]
        })
    }));

    const message = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: `🤖 *${settings.botName.toUpperCase()} PREMIUM*`
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: `乂 ${settings.botName} 2026`
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
