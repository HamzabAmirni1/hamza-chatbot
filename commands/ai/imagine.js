const config = require('../../config');
const axios = require('axios');
const { translateToEn } = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    try {
        const text = args.join(' ');

        if (!text) {
            return sock.sendMessage(chatId, { text: "📝 يرجى كتابة وصف الصورة التي تريد رسمها.\n\nمثال: .imagine a cat in space" }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
        const waitMsg = await sock.sendMessage(chatId, { text: "🎨 جاري تخيل صورتك... المرجو الانتظار." }, { quoted: msg });

        const enPrompt = await translateToEn(text);
        const prompt = encodeURIComponent(enPrompt + ", ultra realistic, 8k resolution, cinematic lighting");
        const url = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}&nologo=true&model=flux`;

        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
        const buffer = Buffer.from(response.data, 'binary');

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            image: buffer,
            caption: `⚔️ *Imagine AI* ✨\n\n📝 *الطلب:* ${text}\n👤 *بواسطة:* Hamza Amirni\n🔥 *الدقة:* 4K Ultra HD`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } });

    } catch (err) {
        console.error('Imagine Error:', err);
        await sock.sendMessage(chatId, { text: "❌ فشل رسم الصورة، جرب لاحقاً." }, { quoted: msg });
    }
}
