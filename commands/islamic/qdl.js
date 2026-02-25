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

// CDN fallback map: reciterId → cdn slug
const reciterCdnMap = {
    '1': 'ar.alafasy',
    '2': 'ar.abdulbasitmurattal',
    '3': 'ar.mahermuaiqly',
    '6': 'ar.husarymujawwad',
    '7': 'ar.minshawi',
    '8': 'ar.hudhaify',
    '9': 'ar.saoodshuraym',
    '10': 'ar.abdurrahmaansudais'
};

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

    // Send notification first
    await sock.sendMessage(chatId, {
        text: `🎧 *📖 سورة ${surahName}*\n\n🔊 جاري إرسال التلاوة...\n\n⚔️ ${settings.botName}`
    }, { quoted: msg });

    try {
        // Primary: mp3quran.net API
        const response = await axios.get(
            `https://mp3quran.net/api/v3/reciters?language=ar&reciter=${reciterId}`,
            { timeout: 15000 }
        );
        const reciterData = response.data.reciters?.[0];

        if (!reciterData) throw new Error("Reciter not found");

        const serverUrl = reciterData.moshaf[0].server;
        const audioUrl = `${serverUrl}${formattedSurahId}.mp3`;

        // Stream audio via URL (never buffer large files)
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `سورة ${surahName} - ${reciterData.name}.mp3`
        });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.log("MP3Quran primary failed, trying CDN fallback...", e.message);

        try {
            // CDN Fallback: cdn.islamic.network (free, reliable)
            const cdnReciter = reciterCdnMap[reciterId] || 'ar.alafasy';
            const cdnUrl = `https://cdn.islamic.network/quran/audio-surah/128/${cdnReciter}/${rawSurahId}.mp3`;

            await sock.sendMessage(chatId, {
                audio: { url: cdnUrl },
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `سورة ${surahName}.mp3`
            });

            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

        } catch (err2) {
            console.log("CDN fallback failed, trying Assabile...", err2.message);

            try {
                // Last fallback: Assabile library
                const QuranAssabile = require('../../lib/quranAssabile');
                const searchResults = await QuranAssabile.search(rawSurahId);

                if (searchResults?.length > 0) {
                    const audioUrl = await QuranAssabile.audio(searchResults[0]);
                    if (audioUrl) {
                        await sock.sendMessage(chatId, {
                            audio: { url: audioUrl },
                            mimetype: 'audio/mpeg',
                            ptt: false,
                            fileName: `سورة ${surahName}.mp3`
                        });
                        return await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
                    }
                }
                throw new Error("Assabile no results");
            } catch (err3) {
                console.error("QDL All fallbacks failed:", err3.message);
                await sock.sendMessage(chatId, {
                    text: `❌ *فشل تحميل سورة ${surahName}*\n\nحاول مرة أخرى أو جرب قارئ آخر.\n\n💡 استخدم: .quranmp3 للاختيار`
                }, { quoted: msg });
                await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
            }
        }
    }
};
