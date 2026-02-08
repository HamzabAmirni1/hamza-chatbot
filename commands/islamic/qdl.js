const axios = require('axios');
const settings = require('../settings');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    if (args.length < 2) {
        return await sock.sendMessage(chatId, { text: "❌ usage: .qdl [reciterId] [surahId]" }, { quoted: msg });
    }

    const reciterId = args[0];
    const surahId = args[1].padStart(3, '0'); // Ensure 3 digits (e.g., 002)

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    try {
        const response = await axios.get(`https://mp3quran.net/api/v3/reciters?language=ar&reciter=${reciterId}`);
        const reciterData = response.data.reciters[0];

        if (!reciterData) {
            return await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على القارئ." }, { quoted: msg });
        }

        const serverUrl = reciterData.moshaf[0].server;
        const audioUrl = `${serverUrl}${surahId}.mp3`;
        const surahName = surahId; // Could map ID to name if we had the list handy, but ID is sufficient for now

        // Send as document for better compatibility with long audio files
        await sock.sendMessage(chatId, {
            document: { url: audioUrl },
            mimetype: 'audio/mpeg',
            fileName: `سورة_${surahId}_${reciterData.name}.mp3`,
            caption: `🎧 *سورة ${surahId}*\n📖 القارئ: ${reciterData.name}\n\n✅ تم التحميل بنجاح`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("QDL Error:", e);
        await sock.sendMessage(chatId, { text: "❌ خطأ في تحميل التلاوة." }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
