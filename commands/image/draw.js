const config = require('../../config');
const axios = require('axios');
const { translateToEn } = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    let prompt_raw = args.join(' ').trim();
    if (!prompt_raw) {
        return await sock.sendMessage(chatId, {
            text: `*✨ ──────────────── ✨*\n*📝 يرجى كتابة وصف الصورة*\n\n*مثال:* رسم أسد في غابة\n*✨ ──────────────── ✨*`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, { text: "🎨 جاري رسم تخيلك... المرجو الانتظار." }, { quoted: msg });

    try {
        let model = "flux";
        let prompt = prompt_raw;

        const models = ["flux", "sdxl", "midjourney", "anime", "realistic", "turbo", "obitch"];
        if (prompt_raw.includes("|")) {
            const parts = prompt_raw.split("|");
            const potentialModel = parts[0].trim().toLowerCase();
            if (models.includes(potentialModel)) {
                model = potentialModel;
                prompt = parts.slice(1).join("|").trim();
            }
        }

        const enPrompt = await translateToEn(prompt);
        const seed = Math.floor(Math.random() * 9999999);
        const url = `https://pollinations.ai/prompt/${encodeURIComponent(enPrompt)}?width=1024&height=1024&seed=${seed}&nologo=true&model=${model}&enhance=true`;

        // Check if image actually loads (to handle 530/500 gracefully before sending)
        try {
            await axios.head(url, { timeout: 15000 });
        } catch (e) {
            // If flux fails, try standard model
            model = "turbo";
            const fallbackUrl = `https://pollinations.ai/prompt/${encodeURIComponent(enPrompt)}?width=768&height=1024&seed=${seed}&nologo=true&model=turbo`;
            await axios.head(fallbackUrl, { timeout: 15000 });
            // If this works, update URL
            // (If it fails again, it will go to main catch)
        }

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            image: { url },
            caption: `*✨ ───❪ HAMZA AMIRNI AI ❫─── ✨*\n\n🎨 *تم رسم الصورة بنجاح*\n\n📝 *الوصف:* ${prompt}\n🎭 *الموديل:* ${model}\n\n*🚀 تـم الـتـولـيـد بـوسـاطـة AI*`,
            contextInfo: {
                externalAdReply: {
                    title: "Hamza AI Art Generation",
                    body: config.botName,
                    thumbnailUrl: url,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: "https://t.me/hamzapro11"
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } });

    } catch (error) {
        console.error("Draw Error:", error.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }
        await sock.sendMessage(chatId, { text: `❌ فشل رسم الصورة.\n⚠️ السبب: ${error.message || 'خطأ في السيرفر'}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
