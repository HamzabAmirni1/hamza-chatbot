const axios = require('axios');
const { getSurahNumber } = require('../../lib/quranUtils');
const { setSession } = require('../../lib/quranSession');
const { sendWithChannelButton } = require('../lib/utils');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const arg = args.join(' ').trim();
    const surahNumber = getSurahNumber(arg);

    if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
        return await sock.sendMessage(chatId, { text: "❌ رقم السورة غير صحيح." }, { quoted: msg });
    }

    await sock.sendMessage(chatId, {
        react: { text: "📖", key: msg.key },
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
                // Persistent session
                setSession(chatId, {
                    surahNumber,
                    name: surah.name,
                    lastIndex: max,
                    totalAyahs: ayahs.length,
                });
            }

            await sendWithChannelButton(
                sock,
                chatId,
                textParts.join("\n"),
                msg,
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
