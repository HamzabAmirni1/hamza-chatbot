const MiraMuseAI = require('../../lib/miraMuseAI');
const config = require('../../config');
const { translateToEn } = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const text = args.join(' ').trim();

    if (!text) {
        const helpMsg = `🖼️ *مولد الصور MiraMuse AI* 🖼️

أنشئ صوراً احترافية عالية الجودة باستخدام نماذج وأحجام مختلفة.

🔧 *كيفية الاستخدام:*
.miramuse [الوصف] | [الموديل] | [المقاس]

📝 *مثال:*
.miramuse beautiful cyberpunk girl | anime | 3:4

📌 *الموديلات المتاحة:*
flux, tamarin, superAnime, visiCanvas, realistic, oldRealistic, anime, 3danime

📌 *المقاسات المتاحة:*
1:2, 9:16, 3:4, 1:1, 4:3, 16:9, 2:1

⚔️ ${config.botName}`;
        return await sock.sendMessage(chatId, { text: helpMsg }, { quoted: msg });
    }

    // Split user text
    let [prompt, model, size] = text.split("|").map(v => v?.trim());

    try {
        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
        const waitMsg = await sock.sendMessage(chatId, { text: "🎨 جاري رسم صورتك بذكاء MiraMuse... المرجو الانتظار." }, { quoted: msg });

        const api = new MiraMuseAI();
        const enPrompt = await translateToEn(prompt);
        const result = await api.generate({
            prompt: enPrompt,
            model,
            size
        });

        if (result.result && result.result.length > 0) {
            try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }
            for (let url of result.result) {
                await sock.sendMessage(chatId, {
                    image: { url: url },
                    caption: `✨ *نتيجة MiraMuse AI* ✨\n\n📝 *الوصف:* ${prompt}\n🎭 *الموديل:* ${model || 'default'}\n📐 *المقاس:* ${size || 'default'}\n\n⚔️ ${config.botName}`
                }, { quoted: msg });
            }
            await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
        } else {
            throw new Error("لم يتم استلام أي رابط للصورة من الخادم.");
        }

    } catch (err) {
        console.error('Error in MiraMuse AI:', err);
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
        await sock.sendMessage(chatId, { text: `❌ فشل رسم الصورة: ${err.message || 'خطأ غير معروف'}` }, { quoted: msg });
    }
};
