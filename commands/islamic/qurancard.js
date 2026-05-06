const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const axios = require('axios');
const settings = require('../settings');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    try {
        await sock.sendMessage(chatId, { react: { text: "📖", key: msg.key } });

        // Fetch a random ayah
        const randomAyahId = Math.floor(Math.random() * 6236) + 1;
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${randomAyahId}/ar.alafasy`);

        if (!response.data || response.data.status !== 'OK') {
            throw new Error("Failed to fetch ayah");
        }

        const data = response.data.data;
        const text = data.text;
        const surahName = data.surah.name;
        const ayahNumber = data.numberInSurah;
        const audioUrl = data.audio;

        // Image options (Beautiful Islamic backgrounds)
        const images = [
            "https://images.unsplash.com/photo-1597933534024-161304f4407b?q=80&w=1000&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1542834759-42935210967a?q=80&w=1000&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1519817650390-64a93db51149?q=80&w=1000&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1564121211835-e88c852648fb?q=80&w=1000&auto=format&fit=crop"
        ];
        const randomImage = images[Math.floor(Math.random() * images.length)];

        // Generate Header Image
        const genImage = await generateWAMessageContent(
            { image: { url: randomImage } },
            { upload: sock.waUploadToServer }
        );

        const interactiveMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: `✨ *"${text}"*\n\n🕋 *سورة:* ${surahName}\n🔢 *الآية:* ${ayahNumber}` }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName} | آية اليوم` }),
                        header: proto.Message.InteractiveMessage.Header.create({ title: `📖 آية من ذكر الحكيم`, hasMediaAttachment: true, imageMessage: genImage.imageMessage }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                            buttons: [
                                {
                                    "name": "quick_reply",
                                    "buttonParamsJson": JSON.stringify({
                                        display_text: "💡 آية أخرى",
                                        id: ".qurancard"
                                    })
                                },
                                {
                                    "name": "quick_reply",
                                    "buttonParamsJson": JSON.stringify({
                                        display_text: "🕌 قائمة القراء",
                                        id: ".quranmp3"
                                    })
                                },
                                {
                                    "name": "cta_url",
                                    "buttonParamsJson": JSON.stringify({
                                        display_text: "📖 قراءة السورة كاملة",
                                        url: `https://quran.com/${data.surah.number}`
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, interactiveMsg.message, { messageId: interactiveMsg.key.id });

        // Send audio separately
        if (audioUrl) {
            await sock.sendMessage(chatId, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                ptt: false
            }, { quoted: interactiveMsg });
        }

    } catch (e) {
        console.error("Quran Card Error:", e);
        await sock.sendMessage(chatId, { text: "❌ فشل في إنشاء بطاقة القرآن." }, { quoted: msg });
    }
};
