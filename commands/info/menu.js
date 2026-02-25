const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const fs = require('fs-extra');
const path = require('path');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? "🌅 صباح الخير" : hour < 18 ? "☀️ مساء النور" : "🌙 مساء الخير";

    const menuText = `${greeting}، *${msg.pushName || 'صديقي'}* 👋

╔══════════════════════╗
║   🤖 *${settings.botName.toUpperCase()}*
║   *BOT PREMIUM 2026*
╚══════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━
🎨 *[ ذكاء اصطناعي — صور ]*
━━━━━━━━━━━━━━━━━━━━━━
🖼️ *.imagine* | *.draw* — توليد صورة
⚡ *.nano* — صورة Nano Banana 4K
✏️ *.nanoedit* — تعديل صورة Nano
🎭 *.ai-image* — Pollinations Art
🌸 *.miramuse* — Miramuse AI Art
🌿 *.ghibli* — فن Studio Ghibli
🔧 *.imgeditor [وصف]* — ImgEditor AI
✨ *.imgedit [وصف]* — تعديل AI Pro
🔍 *.upscale* — رفع جودة 4x
🎨 *.colorize* — تلوين الصور
✏️ *.sketch* | *.sketch2* — رسم رصاص
📸 *.gimg [كلمة]* — بحث صور Google
🌆 *.wallpaper [نوع]* — خلفيات 4K
🐸 *.brat [نص]* — ستيكر Brat
💀 *.removebg* | *.bg* — حذف خلفية

━━━━━━━━━━━━━━━━━━━━━━
🎬 *[ ذكاء اصطناعي — فيديو ]*
━━━━━━━━━━━━━━━━━━━━━━
🤖 *.aivideo [نص]* — توليد فيديو AI
⚡ *.grokvideo* | *.grok* — Grok AI Video
📽️ *.img2video* — صورة ➜ فيديو AI

━━━━━━━━━━━━━━━━━━━━━━
💬 *[ ذكاء اصطناعي — دردشة ]*
━━━━━━━━━━━━━━━━━━━━━━
🧠 *.gpt4o [سؤال]* — GPT-4o Chat
👁️ *.hl* | *.تحليل* — تحليل الصور
💡 *كلمه مباشرة بدون أمر وهو يرد!*

━━━━━━━━━━━━━━━━━━━━━━
📥 *[ التحميل — Downloaders ]*
━━━━━━━━━━━━━━━━━━━━━━
▶️ *.play* | *.song* — تحميل أغنية YT
🎬 *.video* | *.vid* — فيديو YouTube
⬇️ *.ytdl* | *.ytmp4* — YouTube DL
📘 *.fb [رابط]* — Facebook
📸 *.ig [رابط]* — Instagram
🎵 *.tiktok [رابط]* — TikTok
📌 *.pinterest [رابط]* — Pinterest
🎬 *.capcut [رابط]* — CapCut بدون واترمارك
🎵 *.tomp3* — فيديو ➜ MP3

━━━━━━━━━━━━━━━━━━━━━━
🕋 *[ الخدمات الإسلامية ]*
━━━━━━━━━━━━━━━━━━━━━━
📖 *.quran [سورة]* — قراءة سورة
🎙️ *.quranmp3 [سورة]* — تلاوة mp3
📄 *.quranpdf [سورة]* — تحميل PDF
🔊 *.quransura [سورة]* — سورة صوت
📝 *.ayah* | *.آية* — آية عشوائية
📚 *.tafsir [آية]* — تفسير آية
🙏 *.ad3iya* | *.دعاء* — أدعية يومية
🌙 *.ramadan* — دعاء رمضاني
✅ *.khatm* — متابعة ختمة القرآن

━━━━━━━━━━━━━━━━━━━━━━
🇲🇦 *[ المغرب — Morocco ]*
━━━━━━━━━━━━━━━━━━━━━━
📰 *.hespress* | *.أخبار* — أخبار هسبريس
📖 *.hespressread [رقم]* — قراءة خبر كامل
💼 *.alwadifa* | *.وظائف* — وظائف المغرب
📋 *.wdifaread [رقم]* — تفاصيل وظيفة
🏫 *.alloschool [بحث]* — دروس مدرسية

━━━━━━━━━━━━━━━━━━━━━━
🛠️ *[ الأدوات — Tools ]*
━━━━━━━━━━━━━━━━━━━━━━
🌤️ *.weather [مدينة]* — حالة الطقس
📶 *.ping* | *.status* — حالة البوت
📱 *.tempnum* — رقم هاتف مؤقت مجاني
🌫️ *.blur* — تضبيب صورة

━━━━━━━━━━━━━━━━━━━━━━
ℹ️ *[ المعلومات — Info ]*
━━━━━━━━━━━━━━━━━━━━━━
👤 *.owner* — معلومات المطور
🔗 *.socials* — روابط التواصل
💳 *.credits* — رصيد الاستخدام
📜 *.menu* | *.قائمة* — هذه القائمة

━━━━━━━━━━━━━━━━━━━━━━
乂 *${settings.botName}* Premium 2026
━━━━━━━━━━━━━━━━━━━━━━`;

    // ① إرسال الصورة + المنو الكامل
    try {
        let imageBuffer = null;
        if (fs.existsSync(imagePath)) {
            imageBuffer = fs.readFileSync(imagePath);
        }

        if (imageBuffer) {
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: menuText,
            }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, {
                image: { url: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg" },
                caption: menuText,
            }, { quoted: msg });
        }
    } catch (e) {
        await sock.sendMessage(chatId, { text: menuText }, { quoted: msg });
    }

    // ② إرسال رسالة منفصلة بالـ Buttons
    try {
        const buttonsMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `🔗 *روابط ${settings.botName}*`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: `乂 ${settings.botName} Premium 2026`
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                            buttons: [
                                {
                                    name: "cta_url",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📸 Instagram",
                                        url: settings.instagram
                                    })
                                },
                                {
                                    name: "cta_url",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📢 قناة WhatsApp",
                                        url: settings.officialChannel
                                    })
                                },
                                {
                                    name: "cta_url",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "🎥 YouTube",
                                        url: settings.youtube
                                    })
                                },
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "👤 المطور (Owner)",
                                        id: ".owner"
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        }, {});

        await sock.relayMessage(chatId, buttonsMsg.message, { messageId: buttonsMsg.key.id });
    } catch (e) {
        console.error("Buttons error:", e.message);
    }

    await sock.sendMessage(chatId, { react: { text: "📜", key: msg.key } });
};
