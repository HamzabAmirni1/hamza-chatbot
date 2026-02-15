const axios = require('axios');
const settings = require('../../config');

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

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    if (args.length < 2) {
        return await sock.sendMessage(chatId, {
            text: `📖 *استخدام الأمر:*\n\n.qdl [رقم القارئ] [رقم السورة]\n\n*مثال:*\n.qdl 7 1\n\n💡 للحصول على رقم القارئ، استخدم: .quranmp3`
        }, { quoted: msg });
    }

    const reciterId = args[0];
    const rawSurahId = args[1];
    const formattedSurahId = rawSurahId.toString().padStart(3, '0');
    const surahName = getSurahName(rawSurahId);

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    try {
        const response = await axios.get(`https://mp3quran.net/api/v3/reciters?language=ar&reciter=${reciterId}`, { timeout: 15000 });
        const reciterData = response.data.reciters[0];

        if (!reciterData) {
            throw new Error("Reciter not found on mp3quran");
        }

        const serverUrl = reciterData.moshaf[0].server;
        const audioUrl = `${serverUrl}${formattedSurahId}.mp3`;

        // Download the audio
        const { data: audioBuffer } = await axios.get(audioUrl, { responseType: 'arraybuffer' });

        // Send as audio file (Music file)
        await sock.sendMessage(chatId, {
            audio: Buffer.from(audioBuffer),
            mimetype: 'audio/mpeg',
            ptt: false, // Normal audio file (Audio 3adi)
            fileName: `سورة ${surahName} - ${reciterData.name}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: `سورة ${surahName}`,
                    body: `القارئ: ${reciterData.name}`,
                    thumbnailUrl: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg",
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: "https://mp3quran.net/ar"
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.log("MP3Quran failed, trying Assabile fallback...", e.message);
        try {
            const QuranAssabile = require('../../lib/quranAssabile');
            const searchResults = await QuranAssabile.search(rawSurahId);
            if (searchResults.length > 0) {
                const audioUrl = await QuranAssabile.audio(searchResults[0]);
                if (audioUrl) {
                    await sock.sendMessage(chatId, {
                        audio: { url: audioUrl },
                        mimetype: 'audio/mpeg',
                        fileName: `سورة ${surahName}.mp3`,
                        contextInfo: {
                            externalAdReply: {
                                title: `سورة ${surahName}`,
                                body: "مصدر بديل: Assabile",
                                thumbnailUrl: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg",
                                mediaType: 1
                            }
                        }
                    }, { quoted: msg });
                    return await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
                }
            }
        } catch (err) {
            console.error("Assabile Fallback Error:", err);
        }

        console.error("QDL Error:", e);
        await sock.sendMessage(chatId, { text: "❌ خطأ في تحميل التلاوة. حاول مرة أخرى." }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
