const axios = require('axios');
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const { getSurahNumber } = require('../../lib/quranUtils');
const fs = require('fs');
const path = require('path');

const surahList = [
    { number: 1, name: "الفاتحة" }, { number: 2, name: "البقرة" }, { number: 3, name: "آل عمران" }, { number: 4, name: "النساء" },
    { number: 5, name: "المائدة" }, { number: 6, name: "الأنعام" }, { number: 7, name: "الأعراف" }, { number: 8, name: "الأنفال" },
    { number: 9, name: "التوبة" }, { number: 10, name: "يونس" }, { number: 11, name: "هود" }, { number: 12, name: "يوسف" },
    { number: 13, name: "الرعد" }, { number: 14, name: "إبراهيم" }, { number: 15, name: "الحجر" }, { number: 16, name: "النحل" },
    { number: 17, name: "الإسراء" }, { number: 18, name: "الكهف" }, { number: 19, name: "مريم" }, { number: 20, name: "طه" },
    { number: 21, name: "الأنبياء" }, { number: 22, name: "الحج" }, { number: 23, name: "المؤمنون" }, { number: 24, name: "النور" },
    { number: 25, name: "الفرقان" }, { number: 26, name: "الشعراء" }, { number: 27, name: "النمل" }, { number: 28, name: "القصص" },
    { number: 29, name: "العنكبوت" }, { number: 30, name: "الروم" }, { number: 31, name: "لقمان" }, { number: 32, name: "السجدة" },
    { number: 33, name: "الأحزاب" }, { number: 34, name: "سبأ" }, { number: 35, name: "فاطر" }, { number: 36, name: "يس" },
    { number: 37, name: "الصافات" }, { number: 38, name: "ص" }, { number: 39, name: "الزمر" }, { number: 40, name: "غافر" },
    { number: 41, name: "فصلت" }, { number: 42, name: "الشورى" }, { number: 43, name: "الزخرف" }, { number: 44, name: "الدخان" },
    { number: 45, name: "الجاثية" }, { number: 46, name: "الأحقاف" }, { number: 47, name: "محمد" }, { number: 48, name: "الفتح" },
    { number: 49, name: "الحجرات" }, { number: 50, name: "ق" }, { number: 51, name: "الذاريات" }, { number: 52, name: "الطور" },
    { number: 53, name: "النجم" }, { number: 54, name: "القمر" }, { number: 55, name: "الرحمن" }, { number: 56, name: "الواقعة" },
    { number: 57, name: "الحديد" }, { number: 58, name: "المجادلة" }, { number: 59, name: "الحشر" }, { number: 60, name: "الممتحنة" },
    { number: 61, name: "الصف" }, { number: 62, name: "الجمعة" }, { number: 63, name: "المنافقون" }, { number: 64, name: "التغابن" },
    { number: 65, name: "الطلاق" }, { number: 66, name: "التحريم" }, { number: 67, name: "الملك" }, { number: 68, name: "القلم" },
    { number: 69, name: "الحاقة" }, { number: 70, name: "المعارج" }, { number: 71, name: "نوح" }, { number: 72, name: "الجن" },
    { number: 73, name: "المزمل" }, { number: 74, name: "المدثر" }, { number: 75, name: "القيامة" }, { number: 76, name: "الإنسان" },
    { number: 77, name: "المرسلات" }, { number: 78, name: "النبأ" }, { number: 79, name: "النازعات" }, { number: 80, name: "عبس" },
    { number: 81, name: "التكوير" }, { number: 82, name: "الانفطار" }, { number: 83, name: "المطففين" }, { number: 84, name: "الانشقاق" },
    { number: 85, name: "البروج" }, { number: 86, name: "الطارق" }, { number: 87, name: "الأعلى" }, { number: 88, name: "الغاشية" },
    { number: 89, name: "الفجر" }, { number: 90, name: "البلد" }, { number: 91, name: "الشمس" }, { number: 92, name: "الليل" },
    { number: 93, name: "الضحى" }, { number: 94, name: "الشرح" }, { number: 95, name: "التين" }, { number: 96, name: "العلق" },
    { number: 97, name: "القدر" }, { number: 98, name: "البينة" }, { number: 99, name: "الزلزلة" }, { number: 100, name: "العاديات" },
    { number: 101, name: "القارعة" }, { number: 102, name: "التكاثر" }, { number: 103, name: "العصر" }, { number: 104, name: "الهمزة" },
    { number: 105, name: "الفيل" }, { number: 106, name: "قريش" }, { number: 107, name: "الماعون" }, { number: 108, name: "الكوثر" },
    { number: 109, name: "الكافرون" }, { number: 110, name: "النصر" }, { number: 111, name: "المسد" }, { number: 112, name: "الإخلاص" },
    { number: 113, name: "الفلق" }, { number: 114, name: "الناس" }
];

async function quranMp3Command(sock, chatId, msg, args, helpers, userLang) {
    let query = args.join(' ').trim();
    const isMoreRequest = query.includes('--more');
    if (isMoreRequest) query = query.replace('--more', '').trim();

    await sock.sendMessage(chatId, { react: { text: "🕌", key: msg.key } });

    // Helper for images (matched to pinterest.js)
    async function createImage(url) {
        const { imageMessage } = await generateWAMessageContent({
            image: { url }
        }, {
            upload: sock.waUploadToServer
        });
        return imageMessage;
    }

    const directSurahId = getSurahNumber(query);
    const isTelegram = helpers && helpers.isTelegram;

    try {
        const response = await axios.get('https://mp3quran.net/api/v3/reciters?language=ar', { timeout: 15000 });
        let reciters = response.data.reciters;
        if (!reciters) throw new Error("No data");

        let targetSurahId = null;
        let reciterQuery = "";

        if (directSurahId) {
            targetSurahId = directSurahId;
        } else if (args.length > 1) {
            const firstArgSurahId = getSurahNumber(args[0]);
            if (firstArgSurahId) {
                targetSurahId = firstArgSurahId;
                reciterQuery = args.slice(1).join(" ").replace('--more', '').trim();
            }
        }

        // --- Famous/High-Quality Selection (Matched to Pinterest's slice logic) ---
        const highlightReciters = [
            'مشاري العفاسي', 'عبد الباسط عبد الصمد', 'ماهر المعيقلي', 'ياسر الدوسري',
            'سعد الغامدي', 'عمر القزابري', 'العيون الكوشي', 'إسلام صبحي'
        ];

        let filteredReciters = reciters.filter(r => highlightReciters.some(p => r.name.includes(p)));

        // Fix for filtering when tags like --audio are present
        const cleanReciterQuery = reciterQuery.replace(/--(audio|more)/g, '').trim();
        if (cleanReciterQuery) {
            filteredReciters = reciters.filter(r => r.name.includes(cleanReciterQuery));
        }

        const topReciters = filteredReciters.slice(0, 10);
        const imageUrl = "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg";

        const isFacebook = helpers && helpers.isFacebook;

        if (isTelegram || isFacebook) {
            let text = `👤 *دليل القراء* 👤\n\n`;
            let buttons = [];

            topReciters.forEach((r, i) => {
                text += `${i + 1}. *${r.name}*\n📜 ${r.moshaf[0]?.name || "مصحف كامل"}\n`;
                if (isFacebook) text += `🔗 ${settings.prefix}qdl ${r.id} ${targetSurahId || '1'}\n\n`;
                else if (isTelegram) {
                    if (targetSurahId) {
                        buttons.push([{ text: `🎧 استماع سورة ${targetSurahId} - ${r.name}`, callback_data: `${settings.prefix}qdl ${r.id} ${targetSurahId}` }]);
                    } else {
                        buttons.push([{ text: `📖 قائمة السور - ${r.name}`, callback_data: `${settings.prefix}quransura ${r.id}` }]);
                    }
                }
            });

            return await sock.sendMessage(chatId, {
                text: text,
                ...(isTelegram ? { reply_markup: { inline_keyboard: buttons } } : {})
            });
        }

        let push = [];
        for (let r of topReciters) {
            const moshafName = r.moshaf[0]?.name || "مصحف كامل";

            const buttons = targetSurahId ? [
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({
                        display_text: `🎧 استماع لـ سورة ${targetSurahId}`,
                        id: `${settings.prefix}qdl ${r.id} ${targetSurahId}`
                    })
                }
            ] : [
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({ display_text: " قائمة السور", id: `${settings.prefix}quransurah ${r.id}` })
                }
            ];

            // Add standard links (matched to menu/pinterest)
            buttons.push(
                {
                    "name": "cta_url",
                    "buttonParamsJson": JSON.stringify({ display_text: "📢 Channel", url: settings.officialChannel })
                },
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({ display_text: " Owner", id: ".owner" })
                }
            );

            push.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `👤 *القــارئ:* ${r.name}\n📜 *الرواية:* ${moshafName}\n🕋 *المصدر:* mp3quran.net`
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: r.name,
                    hasMediaAttachment: true,
                    imageMessage: await createImage(imageUrl)
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: buttons
                })
            });
        }

        const botMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: targetSurahId ? `🕋 سورة ${targetSurahId}` : "🕋 دليل القراء"
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: `乂 ${settings.botName} 2026`
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            hasMediaAttachment: false
                        }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                            cards: push
                        })
                    })
                }
            }
        }, {});

        await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });

    } catch (e) {
        console.error("QuranMP3 Error:", e);
        await sock.sendMessage(chatId, { text: "❌ فشل جلب البيانات." }, { quoted: msg });
    }
}

// Reuse original showSurahFormatCard logic but ensure Pinterest-like structure
async function showSurahFormatCard(sock, chatId, msg, surahId, helpers) {
    const isTelegram = helpers && helpers.isTelegram;
    const surahNameObj = surahList.find(s => s.number == parseInt(surahId));
    const surahName = surahNameObj ? surahNameObj.name : `السورة ${surahId}`;

    const isFacebook = helpers && helpers.isFacebook;

    if (isTelegram || isFacebook) {
        let text = `📖 *سورة ${surahName}*\n\nيرجى اختيار الطريقة التي تود بها عرض السورة:\n\n🎧 *صوت:* استماع وتحميل بصوت القارئ الذي تفضله\n📖 *قراءة:* عرض نص السورة كاملاً للقراءة`;

        if (isFacebook) {
            text += `\n\n🎧 لاستماع: ${settings.prefix}quranmp3 ${surahId}\n📖 لقراءة: ${settings.prefix}quranread ${surahId}`;
        }

        return await sock.sendMessage(chatId, {
            text: text,
            ...(isTelegram ? {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🎧 الكل (Choose)", callback_data: `${settings.prefix}quranmp3 ${surahId} --audio` },
                            { text: "👤 العفاسي (Direct)", callback_data: `${settings.prefix}qdl 8 ${surahId}` }
                        ],
                        [
                            { text: "📖 قراءة (Text)", callback_data: `${settings.prefix}quranread ${surahId}` }
                        ],
                        [{ text: "📢 القناة الرسمية", url: settings.officialChannel }]
                    ]
                }
            } : {})
        });
    }

    async function createImage(url) {
        const { imageMessage } = await generateWAMessageContent({ image: { url } }, { upload: sock.waUploadToServer });
        return imageMessage;
    }

    const card = {
        body: proto.Message.InteractiveMessage.Body.fromObject({
            text: `📖 *سورة ${surahName}*\n\nيرجى اختيار الطريقة التي تود بها عرض السورة:\n\n🎧 *صوت:* استماع وتحميل بصوت القارئ الذي تفضله\n📖 *قراءة:* عرض نص السورة كاملاً للقراءة`
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
            title: `🌟 سورة ${surahName}`,
            hasMediaAttachment: true,
            imageMessage: await createImage('https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg')
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({ display_text: "🎧 استماع (Audio)", id: `${settings.prefix}quranmp3 ${surahId} --audio` })
                },
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({ display_text: "📖 قراءة (Text)", id: `${settings.prefix}quranread ${surahId}` })
                },
                {
                    "name": "cta_url",
                    "buttonParamsJson": JSON.stringify({ display_text: " القناة الرسمية", url: settings.officialChannel })
                }
            ]
        })
    };

    const botMsg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({ text: `🕌 سورة ${surahName}` }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards: [card] })
                })
            }
        }
    }, {});

    await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
}

quranMp3Command.command = ['quranmp3', 'القرآن', 'قراء'];
module.exports = quranMp3Command;
module.exports.showSurahFormatCard = showSurahFormatCard;  
