const config = require('../../config');
const axios = require('axios');

const { translateToEn } = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const prompt_raw = args.join(' ').trim();
    if (!prompt_raw) {
        return await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*📝 يرجى كتابة وصف الصورة*\n\n*مثال:* رسم أسد في غابة\n*✨ ──────────────── ✨*`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, { text: "🎨 جاري رسم تخيلك بذكاء اصطناعي فائق... يرجى الانتظار." }, { quoted: msg });

    try {
        let model = "flux";
        let prompt = prompt_raw;
        if (prompt_raw.includes("|")) {
            const parts = prompt_raw.split("|");
            const potentialModel = parts[0].trim().toLowerCase();
            const models = ["flux", "sdxl", "midjourney", "anime", "realistic", "turbo"];
            if (models.includes(potentialModel)) {
                model = potentialModel;
                prompt = parts.slice(1).join("|").trim();
            }
        }

        const enPrompt = await translateToEn(prompt);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enPrompt)}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true&model=${model}&enhance=true`;

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            image: { url },
            caption: `*✨ ───❪ HAMZA AMIRNI ❫─── ✨*\n\n🎨 *تم رسم الصورة بنجاح*\n\n📝 *الوصف:* ${prompt}\n🎭 *الموديل:* ${model}\n\n*🚀 تـم الـتـولـيـد بـوسـاطـة AI*`,
            contextInfo: {
                externalAdReply: {
                    title: "Image AI Generation",
                    body: config.botName,
                    thumbnailUrl: url,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: "https://pollinations.ai"
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } });

    } catch (error) {
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }
        await sock.sendMessage(chatId, { text: `❌ فشل رسم الصورة: ${error.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
