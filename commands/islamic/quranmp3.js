const axios = require('axios');
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const { t } = require('../lib/language');
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

async function quranMp3Command(sock, chatId, msg, args, commands, userLang) {
    let query = args.join(' ').trim();
    const isAudioRequest = query.includes('--audio');
    const isMoreRequest = query.includes('--more');

    // Clean query
    if (isAudioRequest) query = query.replace('--audio', '').trim();
    if (isMoreRequest) query = query.replace('--more', '').trim();

    await sock.sendMessage(chatId, { react: { text: "🕌", key: msg.key } });

    // Check if it's a Surah Request - but DON'T show format card, proceed to reciters
    const directSurahId = getSurahNumber(query);

    try {
        const response = await axios.get('https://mp3quran.net/api/v3/reciters?language=ar', { timeout: 10000 });
        let reciters = response.data.reciters;
        if (!reciters) throw new Error("No data");

        // Determine target Surah
        let targetSurahId = null;
        let reciterQuery = "";

        if (directSurahId) {
            targetSurahId = directSurahId;
        } else if (args.length > 1) {
            const firstArgSurahId = getSurahNumber(args[0]);
            if (firstArgSurahId) {
                targetSurahId = firstArgSurahId;
                reciterQuery = args.slice(1).join(" ").replace('--audio', '').replace('--more', '').trim();
            }
        }

        // --- Handle List Request (Show ALL Reciters) ---
        if (isMoreRequest && targetSurahId) {
            // Sort reciters alphabetically
            reciters.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

            // Limit to avoid limits (e.g. 100)
            const listReciters = reciters.slice(0, 50);
            // Note: WA List Messages have limits. We'll show top 50 alphabetical.

            const sections = [{
                title: "اختر القارئ",
                rows: listReciters.map(r => ({
                    header: r.name,
                    title: r.name,
                    description: r.moshaf[0]?.name || "مصحف",
                    id: `${settings.prefix}qdl ${r.id} ${targetSurahId}`
                }))
            }];

            const listMsg = generateWAMessageFromContent(chatId, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2
                        },
                        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                            body: proto.Message.InteractiveMessage.Body.create({
                                text: `🎧 *قائمة القراء المتاحة لسورة ${targetSurahId}* (أ-ي)\n⬇️ اختر قارئًا للتحميل:`
                            }),
                            footer: proto.Message.InteractiveMessage.Footer.create({
                                text: `乂 ${settings.botName}`
                            }),
                            header: proto.Message.InteractiveMessage.Header.create({
                                title: "📜 قائمة القراء الكاملة",
                                subtitle: "اختر القارئ",
                                hasMediaAttachment: false
                            }),
                            listMessage: proto.Message.InteractiveMessage.ListMessage.fromObject({
                                buttonText: "اضغط لاختيار القارئ",
                                description: "قائمة القراء",
                                sections: sections
                            })
                        })
                    }
                }
            }, { quoted: msg });

            return await sock.relayMessage(chatId, listMsg.message, { messageId: listMsg.key.id });
        }


        // Normal Carousel Logic (Popular & Moroccan Reciters)
        if (reciterQuery) {
            reciters = reciters.filter(r => r.name.toLowerCase().includes(reciterQuery.toLowerCase()));
        } else if (!targetSurahId && query && !directSurahId) {
            reciters = reciters.filter(r => r.name.toLowerCase().includes(query.toLowerCase()));
        } else {
            // Expanded Famous & Moroccan Selection
            const highlightReciters = [
                'مشاري العفاسي', 'عبد الباسط عبد الصمد', 'ماهر المعيقلي', 'ياسر الدوسري',
                'سعد الغامدي', 'عمر القزابري', 'العيون الكوشي', 'إسلام صبحي',
                'أحمد العجمي', 'فارس عباد', 'منصور السالمي', 'أبو بكر الشاطري'
            ];
            reciters = reciters.filter(r => highlightReciters.some(p => r.name.includes(p)));

            // Re-order to match priority
            reciters.sort((a, b) => {
                const aIdx = highlightReciters.findIndex(p => a.name.includes(p));
                const bIdx = highlightReciters.findIndex(p => b.name.includes(p));
                return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
            });
        }

        if (!reciters.length) {
            return await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على قارئ." }, { quoted: msg });
        }

        // Limit for carousel
        const topReciters = reciters.slice(0, 12);

        // Helper for different thumbnails to make it look non-repetitive
        const thumbnails = [
            'https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg',
            'https://i.pinimg.com/564x/e1/9f/c6/e19fc638153400e9a7e6ea3e0ce1d111.jpg',
            'https://i.pinimg.com/564x/44/1a/7f/441a7f0e3fb8c8b4b7f8f9e684033b93.jpg',
            'https://i.pinimg.com/564x/6c/dc/1e/6cdc1e37583685f0ef32230353408f61.jpg'
        ];

        async function createHeaderImage(index) {
            try {
                const url = thumbnails[index % thumbnails.length];
                const { imageMessage } = await generateWAMessageContent({ image: { url } }, { upload: sock.waUploadToServer });
                return imageMessage;
            } catch (e) { return null; }
        }

        const cards = [];
        for (let i = 0; i < topReciters.length; i++) {
            const r = topReciters[i];
            const moshafName = r.moshaf[0]?.name || "مصحف";
            const imgMsg = await createHeaderImage(i);

            const buttons = targetSurahId ?
                [
                    {
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({
                            display_text: `🎧 تحميل التلاوة`,
                            id: `${settings.prefix}qdl ${r.id} ${targetSurahId}`
                        })
                    }
                ] :
                [{
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({ display_text: "📜 قائمة السور", id: `${settings.prefix}quransurah ${r.id}` })
                }];

            cards.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `👤 *القارئ:* ${r.name}\n📖 *الرواية:* ${moshafName}\n🔢 *عدد السور:* ${r.moshaf[0]?.surah_total || '114'}`
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: r.name,
                    hasMediaAttachment: !!imgMsg,
                    imageMessage: imgMsg
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons })
            });
        }

        // Add "More Reciters" Card ONLY if targetSurahId is set
        if (targetSurahId) {
            const moreImgMsg = await createHeaderImage(topReciters.length);
            cards.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `🔍 *هل تبحث عن قارئ آخر؟*\n\nاضغط أدناه لعرض قائمة بجميع القراء المتوفرين.`
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: "🔍 المزيد من القراء",
                    hasMediaAttachment: !!moreImgMsg,
                    imageMessage: moreImgMsg
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [{
                        "name": "quick_reply",
                        "buttonParamsJson": JSON.stringify({
                            display_text: "📜 عرض كل القراء",
                            id: `${settings.prefix}quranmp3 ${targetSurahId} --more`
                        })
                    }]
                })
            });
        }

        const title = targetSurahId ? `🎧 *اختر القارئ لسورة ${targetSurahId}*` : "🕌 *قائمة القراء*";
        const botMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: title }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("QuranMP3 Error:", e);
        await sock.sendMessage(chatId, { text: "❌ Error fetching reciters." }, { quoted: msg });
    }
}

// 🆕 Function to show Surah Format Selection (ONE card with 3 buttons)
async function showSurahFormatCard(sock, chatId, msg, surahId) {
    const surahNameObj = surahList.find(s => s.number == parseInt(surahId));
    const surahName = surahNameObj ? surahNameObj.name : `Surah ${surahId}`;

    // Get image from menu religion category if available
    const religionImagePath = path.join(process.cwd(), 'media/menu/bot_2.png');
    let imageMessage = null;
    try {
        if (fs.existsSync(religionImagePath)) {
            const gen = await generateWAMessageContent({ image: fs.readFileSync(religionImagePath) }, { upload: sock.waUploadToServer });
            imageMessage = gen.imageMessage;
        } else {
            const imageUrl = 'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?q=80&w=1000&auto=format&fit=crop';
            const gen = await generateWAMessageContent({ image: { url: imageUrl } }, { upload: sock.waUploadToServer });
            imageMessage = gen.imageMessage;
        }
    } catch (e) { }

    // Single card with buttons
    const card = {
        body: proto.Message.InteractiveMessage.Body.fromObject({
            text: `📖 *سورة ${surahName}*\n\nيرجى اختيار الطريقة التي تود بها عرض السورة:\n\n🎧 *صوت:* استماع وتحميل بصوت القارئ الذي تفضله\n📖 *قراءة:* عرض نص السورة كاملاً للقراءة`
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
            title: `🌟 سورة ${surahName}`,
            hasMediaAttachment: !!imageMessage,
            imageMessage: imageMessage
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
            buttons: [
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({
                        display_text: "↩️ 🎧 استماع (Audio)",
                        id: `${settings.prefix}quranmp3 ${surahId} --audio`
                    })
                },
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({
                        display_text: "↩️ 📖 قراءة (Text)",
                        id: `${settings.prefix}quranread ${surahId}`
                    })
                },
                {
                    "name": "cta_url",
                    "buttonParamsJson": JSON.stringify({
                        display_text: "↗️ 🔔 قناتي الرسمية",
                        url: settings.officialChannel
                    })
                },
                {
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({
                        display_text: "↩️ 👑 المطور",
                        id: ".owner"
                    })
                }
            ]
        })
    };

    const botMsg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({ text: `🕌 *قسم القرآن الكريم*\n\nسورة ${surahName}` }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards: [card] })
                })
            }
        }
    }, { quoted: msg });

    await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
    await sock.sendMessage(chatId, { react: { text: "❤️", key: msg.key } });
}

quranMp3Command.command = ['quranmp3', 'القرآن', 'قراء'];
quranMp3Command.tags = ['islamic'];
quranMp3Command.desc = 'البحث عن قراء القرآن والاستماع MP3';

module.exports = quranMp3Command;
module.exports.showSurahFormatCard = showSurahFormatCard;  
