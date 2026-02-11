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

        const serverUrl = response.data.reciters[0].moshaf[0].server;
        const formattedSurahId = args[1].toString().padStart(3, '0');
        const audioUrl = `${serverUrl}${formattedSurahId}.mp3`;

        // Send as audio (like music) with external metadata
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: false, // Send as music file
            fileName: `${reciterData.name}_${surahId}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: `سورة رقم ${surahId}`,
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
        console.error("QDL Error:", e);
        await sock.sendMessage(chatId, { text: "❌ خطأ في تحميل التلاوة. حاول مرة أخرى." }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
