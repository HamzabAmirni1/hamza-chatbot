const { generateWAMessageFromContent, proto, generateWAMessageContent } = require('@whiskeysockets/baileys');
const settings = require('../settings');

async function quranSuraCommand(sock, chatId, msg, args, commands, userLang) {
    const surahId = args[0];

    if (!surahId) {
        return await sock.sendMessage(chatId, { text: "❌ تفاصيل السورة غير متاح." });
    }

    const surahNames = [
        "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس",
        "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه",
        "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
        "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر",
        "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق",
        "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة",
        "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج",
        "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس",
        "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
        "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات",
        "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر",
        "المسد", "الإخلاص", "الفلق", "الناس"
    ];

    const sName = surahNames[parseInt(surahId) - 1] || "سورة";

    // Header Image (Unified Style)
    const imageUrl = 'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?q=80&w=1000&auto=format&fit=crop';
    let imageMessage = null;
    try {
        const gen = await generateWAMessageContent({ image: { url: imageUrl } }, { upload: sock.waUploadToServer });
        imageMessage = gen.imageMessage;
    } catch (e) { }


    const msgContent = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: `📖 *سورة ${sName}*\n\nكيف تريد عرض هذه السورة؟\n\n🎧 *صوت:* استماع وتحميل (MP3)\n📖 *قراءة:* نص مكتوب\n📄 *ملف:* تحميل كملف (Document)`
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: `乂 ${settings.botName}`
                    }),
                    header: proto.Message.InteractiveMessage.Header.create({
                        title: `📖 سورة ${sName}`,
                        subtitle: "اختر نوع العرض",
                        hasMediaAttachment: !!imageMessage,
                        imageMessage: imageMessage
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                        buttons: [
                            {
                                "name": "quick_reply",
                                "buttonParamsJson": JSON.stringify({
                                    display_text: "🎧 استماع (Audio)",
                                    id: `${settings.prefix}quranmp3 ${surahId} --audio`
                                })
                            },
                            {
                                "name": "quick_reply",
                                "buttonParamsJson": JSON.stringify({
                                    display_text: "📖 قراءة (Text)",
                                    id: `${settings.prefix}quranread ${surahId}`
                                })
                            },
                            {
                                "name": "cta_url",
                                "buttonParamsJson": JSON.stringify({
                                    display_text: "📄 ملف (Official Site)",
                                    url: `https://quran.com/${surahId}`
                                })
                            }
                        ]
                    })
                })
            }
        }
    }, { quoted: msg });

    await sock.relayMessage(chatId, msgContent.message, { messageId: msgContent.key.id });
}

module.exports = quranSuraCommand;
