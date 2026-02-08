const axios = require('axios');
const { getSurahNumber } = require('../../lib/quranUtils');
const { quranSessions } = require('../../lib/islamic');
const { sendWithChannelButton } = require('../lib/utils');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const arg = args.join(' ').trim();
    const surahNumber = getSurahNumber(arg);

    if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
        return await sendWithChannelButton(
            sock,
            chatId,
            `🕋 *قراءة سورة كاملة*\n\n📝 *الطريقة:* .quran [اسم السورة]\n*مثال:* .quran الكهف`,
            msg,
        );
    }

    await sock.sendMessage(chatId, {
        react: { text: "🕋", key: msg.key },
    });

    try {
        const { data: res } = await axios.get(
            `https://api.alquran.cloud/v1/surah/${surahNumber}`,
        );
        if (res && res.status === "OK") {
            const surah = res.data;
            const ayahs = surah.ayahs || [];
            const ayahsPerPage = 30;
            const max = Math.min(ayahs.length, ayahsPerPage);

            let textParts = [
                `📜 *سورة ${surah.name}* (${surah.englishName})\n🔢 *عدد الآيات:* ${ayahs.length}\n━━━━━━━━━━━━━━━━━━━━\n`,
            ];
            for (let i = 0; i < max; i++) {
                textParts.push(`${ayahs[i].numberInSurah}. ${ayahs[i].text}`);
            }

            if (ayahs.length > max) {
                textParts.push(
                    `\n━━━━━━━━━━━━━━━━━━━━\n⚠️ *باقي الآيات مخفية لطول السورة.*\n💡 اكتب *.continue* لمتابعة القراءة.`,
                );
                quranSessions[chatId] = {
                    surahNumber,
                    name: surah.name,
                    lastIndex: max,
                    totalAyahs: ayahs.length,
                };
            }

            textParts.push(
                `\n━━━━━━━━━━━━━━━━━━━━\n🎧 *جاري إرسال التلاوة بصوت العفاسي...*`,
            );
            await sendWithChannelButton(
                sock,
                chatId,
                textParts.join("\n"),
                msg,
            );

            const audioUrl = `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${surahNumber}.mp3`;
            await sock.sendMessage(
                chatId,
                {
                    audio: { url: audioUrl },
                    mimetype: "audio/mpeg",
                    ptt: false,
                },
                { quoted: msg },
            );
        }
    } catch (e) {
        await sock.sendMessage(
            chatId,
            { text: "❌ خطأ فجلب السورة." },
            { quoted: msg },
        );
    }
};
