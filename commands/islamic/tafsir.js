const axios = require('axios');
const { getSurahNumber } = require('../../lib/quranUtils');
const { sendWithChannelButton } = require('../lib/utils');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    if (args.length < 2) {
        return await sendWithChannelButton(
            sock,
            chatId,
            `📖 *تفسير القرآن (Tafsir)*\n\n📝 *الطريقة:* .tafsir [اسم السورة] [رقم الآية]\n*مثال:* .tafsir الفاتحة 1\n\n⚔️ ${config.botName}`,
            msg,
        );
    }

    const surah = getSurahNumber(args[0]);
    const ayah = parseInt(args[1]);

    if (!surah || isNaN(ayah)) {
        return await sock.sendMessage(
            chatId,
            { text: "❌ يرجى التأكد من اسم السورة (أو الرقم) ورقم الآية." },
            { quoted: msg },
        );
    }

    await sock.sendMessage(chatId, {
        react: { text: "📖", key: msg.key },
    });

    try {
        const url = `https://quranenc.com/api/v1/translation/aya/arabic_moyassar/${surah}/${ayah}`;
        const { data } = await axios.get(url);

        if (data && data.result) {
            const info = data.result;
            const text = `📖 *تفسير الميسر*\n\n🕋 *سورة:* ${info.sura} - آية: ${info.aya}\n📜 *الآية:* ${info.arabic_text}\n\n📝 *التفسير:*\n${info.translation}\n\n⚔️ ${config.botName}`;
            await sendWithChannelButton(sock, chatId, text, msg);
        } else {
            await sock.sendMessage(
                chatId,
                { text: "❌ لم يتم العثور على تفسير لهذه الآية." },
                { quoted: msg },
            );
        }
    } catch (e) {
        await sock.sendMessage(
            chatId,
            { text: "❌ خطأ في جلب التفسير. جرب لاحقاً." },
            { quoted: msg },
        );
    }
};
