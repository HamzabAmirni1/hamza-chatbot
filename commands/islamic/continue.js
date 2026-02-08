const axios = require('axios');
const { quranSessions } = require('../../lib/islamic');
const { sendWithChannelButton } = require('../lib/utils');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const session = quranSessions[chatId];
    if (!session) {
        return await sock.sendMessage(
            chatId,
            { text: "❌ ما عندك حتى جلسة قراءة مفتوحة حالياً." },
            { quoted: msg },
        );
    }

    try {
        const { data: res } = await axios.get(
            `https://api.alquran.cloud/v1/surah/${session.surahNumber}`,
        );
        if (res && res.status === "OK") {
            const ayahs = res.data.ayahs || [];
            const start = session.lastIndex;
            const end = Math.min(start + 30, ayahs.length);

            let textParts = [
                `📜 *تابع سورة ${session.name}* (الآية ${start + 1} إلى ${end})\n━━━━━━━━━━━━━━━━━━━━\n`,
            ];
            for (let i = start; i < end; i++) {
                textParts.push(`${ayahs[i].numberInSurah}. ${ayahs[i].text}`);
            }

            if (end < ayahs.length) {
                textParts.push(
                    `\n━━━━━━━━━━━━━━━━━━━━\n💡 اكتب *.continue* لمتابعة القراءة.`,
                );
                session.lastIndex = end;
            } else {
                textParts.push(
                    `\n━━━━━━━━━━━━━━━━━━━━\n✅ *تمت السورة بحمد الله.*`,
                );
                delete quranSessions[chatId];
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
            { text: "❌ خطأ فالمتابعة." },
            { quoted: msg },
        );
    }
};
