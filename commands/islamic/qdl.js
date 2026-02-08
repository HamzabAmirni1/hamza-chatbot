const axios = require('axios');
const settings = require('../../config');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    if (args.length < 2) {
        return await sock.sendMessage(chatId, {
            text: `📖 *استخدام الأمر:*\n\n.qdl [رقم القارئ] [رقم السورة]\n\n*مثال:*\n.qdl 7 1\n\n💡 للحصول على رقم القارئ، استخدم: .quranmp3`
        }, { quoted: msg });
    }

    const reciterId = args[0];
    const surahId = args[1].padStart(3, '0');

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    try {
        const response = await axios.get(`https://mp3quran.net/api/v3/reciters?language=ar&reciter=${reciterId}`, { timeout: 15000 });
        const reciterData = response.data.reciters[0];

        if (!reciterData) {
            return await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على القارئ." }, { quoted: msg });
        }

        const serverUrl = reciterData.moshaf[0].server;
        const audioUrl = `${serverUrl}${surahId}.mp3`;

        // Send as document for better compatibility
        await sock.sendMessage(chatId, {
            document: { url: audioUrl },
            mimetype: 'audio/mpeg',
            fileName: `سورة_${surahId}_${reciterData.name}.mp3`,
            caption: `🎧 *سورة ${surahId}*\n📖 القارئ: ${reciterData.name}\n\n✅ تم التحميل بنجاح\n\n💡 قم بتحميل الملف للاستماع`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("QDL Error:", e);
        await sock.sendMessage(chatId, { text: "❌ خطأ في تحميل التلاوة. حاول مرة أخرى." }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
