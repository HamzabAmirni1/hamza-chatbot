const axios = require('axios');
const settings = require('../../config');
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const { getBuffer } = require('../../lib/ytdl');

function getSurahName(number) {
    const s = [
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
    return s[parseInt(number) - 1] || `سورة رقم ${number}`;
}

// Quran thumbnails for the card
const quranThumbnails = [
    'https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg',
    'https://i.pinimg.com/564x/e1/9f/c6/e19fc638153400e9a7e6ea3e0ce1d111.jpg',
    'https://i.pinimg.com/564x/44/1a/7f/441a7f0e3fb8c8b4b7f8f9e684033b93.jpg',
    'https://i.pinimg.com/564x/6c/dc/1e/6cdc1e37583685f0ef32230353408f61.jpg'
];

async function sendQuranCard(sock, chatId, msg, surahName, surahId, reciterName, audioUrl) {
    try {
        const thumbUrl = quranThumbnails[surahId % quranThumbnails.length];
        const { imageMessage } = await generateWAMessageContent(
            { image: { url: thumbUrl } },
            { upload: sock.waUploadToServer }
        );

        const card = {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `📖 *سورة ${surahName}*\n\n👤 *القارئ:* ${reciterName}\n🎵 *جودة الصوت:* 128 kbps\n\n╭━━━━━━━━━━━━━━━━╮\n┃ 🔊 *اضغط لتشغيل التلاوة*\n╰━━━━━━━━━━━━━━━━╯`
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: `🕌 سورة ${surahName}`,
                hasMediaAttachment: true,
                imageMessage
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: [
                    {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: `🎧 استماع (Audio)`,
                            id: `qdl_play_${surahId}_${audioUrl}`
                        })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                            display_text: `🔔 قناتي الرسمية`,
                            url: settings.officialChannel || 'https://whatsapp.com/channel/0029VaFUbgT3GJOwT1wI3q0w'
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
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `🕌 *القرآن الكريم*\n\n✨ تلاوة سورة ${surahName}`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: `⚔️ ${settings.botName}`
                        }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards: [card] })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
    } catch (e) {
        console.log("Card send failed, skipping card:", e.message);
    }
}

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    if (args.length < 2) {
        return await sock.sendMessage(chatId, {
            text: `📖 *استخدام الأمر:*\n\n.qdl [رقم القارئ] [رقم السورة]\n\n*مثال:*\n.qdl 7 1\n\n💡 للحصول على رقم القارئ، استخدم: .quranmp3`
        }, { quoted: msg });
    }

    const reciterId = args[0];
    const rawSurahId = parseInt(args[1]);
    const formattedSurahId = rawSurahId.toString().padStart(3, '0');
    const surahName = getSurahName(rawSurahId);

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    let reciterName = "مشاري العفاسي";
    let audioUrl = null;

    try {
        // Primary: mp3quran.net API
        const response = await axios.get(
            `https://mp3quran.net/api/v3/reciters?language=ar&reciter=${reciterId}`,
            { timeout: 10000 }
        );
        const reciterData = response.data.reciters?.[0];

        if (reciterData) {
            reciterName = reciterData.name;
            const serverUrl = reciterData.moshaf[0].server;
            audioUrl = `${serverUrl}${formattedSurahId}.mp3`;
        }
    } catch (e) {
        console.log("mp3quran API failed:", e.message);
    }

    // CDN fallback map if API fails or audio URL doesn't work
    const cdnMap = {
        '1': 'ar.alafasy', '2': 'ar.abdulbasitmurattal', '3': 'ar.mahermuaiqly',
        '6': 'ar.husarymujawwad', '7': 'ar.minshawi', '8': 'ar.hudhaify',
        '9': 'ar.saoodshuraym', '10': 'ar.abdurrahmaansudais'
    };
    const cdnReciter = cdnMap[reciterId] || 'ar.alafasy';
    const cdnFallbackUrl = `https://cdn.islamic.network/quran/audio-surah/128/${cdnReciter}/${rawSurahId}.mp3`;

    // Use CDN fallback URL if API failed
    if (!audioUrl) {
        audioUrl = cdnFallbackUrl;
    }

    // 1️⃣ Send the carousel card first (like yts)
    await sendQuranCard(sock, chatId, msg, surahName, rawSurahId, reciterName, audioUrl);

    // 2️⃣ Send the actual audio
    try {
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `سورة ${surahName} - ${reciterName}.mp3`
        });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
    } catch (e) {
        console.log("Primary audio failed, trying cdn fallback...", e.message);
        try {
            await sock.sendMessage(chatId, {
                audio: { url: cdnFallbackUrl },
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `سورة ${surahName}.mp3`
            });
            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
        } catch (err2) {
            console.log("CDN audio failed, trying buffer fallback...", err2.message);
            const buffer = await getBuffer(audioUrl);
            if (buffer) {
                try {
                    await sock.sendMessage(chatId, {
                        audio: buffer,
                        mimetype: 'audio/mpeg',
                        fileName: `سورة ${surahName}.mp3`
                    });
                    return await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
                } catch (e3) { }
            }

            console.error("All audio methods failed:", err2.message);
            await sock.sendMessage(chatId, {
                text: `❌ تعذر إرسال الصوت. حاول مرة أخرى أو اختر قارئ آخر.\n💡 .quranmp3`
            }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
        }
    }
};
