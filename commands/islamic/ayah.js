const axios = require('axios');
const { getSurahNumber } = require('../../lib/quranUtils');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    if (args.length < 2) {
        return await sock.sendMessage(chatId, {
            text: `📜 *البحث عن آية (Ayah)*\n\n📝 *الطريقة:* .ayah [اسم السورة] [رقم الآية]\n*مثال:* .ayah البقرة 255`
        }, { quoted: msg });
    }

    const surah = getSurahNumber(args[0]);
    const ayah = parseInt(args[1]);

    if (!surah || isNaN(ayah)) {
        return await sock.sendMessage(chatId, { text: "❌ تأكد من اسم السورة (مثلا: البقرة) ورقم الآية." }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "📖", key: msg.key } });

    try {
        const { data: res } = await axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy`);
        if (res && res.status === "OK") {
            const d = res.data;
            const caption = `📜 *القرآن الكريم*\n\n🕋 *سورة:* ${d.surah.name}\n🔢 *آية:* ${d.numberInSurah}\n\n✨ ${d.text}\n\n⚔️ ${config.botName}`;

            await sock.sendMessage(chatId, {
                text: caption,
                contextInfo: {
                    externalAdReply: {
                        title: `سورة ${d.surah.name}`,
                        body: `آية رقم ${d.numberInSurah}`,
                        thumbnailUrl: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg",
                        mediaType: 1,
                        sourceUrl: `https://quran.com/${surah}/${ayah}`
                    }
                }
            }, { quoted: msg });

            if (d.audio) {
                await sock.sendMessage(chatId, {
                    audio: { url: d.audio },
                    mimetype: "audio/mpeg",
                    ptt: false,
                }, { quoted: msg });
            }
        } else {
            await sock.sendMessage(chatId, { text: "❌ ما لقيتش هاد الآية." }, { quoted: msg });
        }
    } catch (e) {
        await sock.sendMessage(chatId, { text: "❌ خطأ فجلب الآية. جرب من بعد." }, { quoted: msg });
    }
};
