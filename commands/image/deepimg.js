/**
 * .deepimg - توليد صور بالذكاء الاصطناعي
 * API: deepimg.ai (Flux 1 Dev)
 * الاستخدام: .deepimg وصف الصورة | الأسلوب
 */

const axios = require('axios');
const config = require('../../config');

async function translateToEn(text) {
    try {
        const res = await axios.get(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`,
            { timeout: 8000 }
        );
        return res.data[0][0][0];
    } catch (e) {
        return text;
    }
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const input = args.join(' ').trim();

    if (!input) {
        return await sock.sendMessage(chatId, {
            text: `🎨 *Deep Image Generator*\n\n` +
                `📌 *الاستخدام:*\n` +
                `\`.deepimg [الوصف] | [الأسلوب]\`\n\n` +
                `🖌️ *أمثلة:*\n` +
                `• \`.deepimg مدينة مستقبلية | Cyberpunk\`\n` +
                `• \`.deepimg city at night | realistic\`\n` +
                `• \`.deepimg قرية مغربية | oil painting\`\n\n` +
                `🎭 *أساليب شائعة:*\n` +
                `realistic • cyberpunk • anime • oil painting • watercolor • 3D render`
        }, { quoted: msg });
    }

    const [promptRaw, styleRaw] = input.split('|').map(s => s.trim());
    const style = styleRaw || 'realistic';

    await sock.sendMessage(chatId, { react: { text: '🎨', key: msg.key } });
    await sock.sendMessage(chatId, {
        text: `⏳ *جاري توليد الصورة...*\n\n📝 *الوصف:* ${promptRaw}\n🎭 *الأسلوب:* ${style}\n\n_يرجى الانتظار 15-30 ثانية..._`
    }, { quoted: msg });

    try {
        const prompt = await translateToEn(promptRaw);
        const translatedStyle = await translateToEn(style);
        const deviceId = `dev-${Math.floor(Math.random() * 1000000)}`;

        const res = await axios.post('https://api-preview.chatgot.io/api/v1/deepimg/flux-1-dev', {
            prompt: `${prompt} -style ${translatedStyle}`,
            size: '1024x1024',
            device_id: deviceId
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://deepimg.ai',
                'Referer': 'https://deepimg.ai/'
            },
            timeout: 60000
        });

        const data = res.data;
        if (!data?.data?.images?.length) {
            return await sock.sendMessage(chatId, {
                text: '❌ فشل توليد الصورة. حاول مرة أخرى.'
            }, { quoted: msg });
        }

        const imgUrl = data.data.images[0].url;
        const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const buffer = Buffer.from(imgRes.data, 'binary');

        await sock.sendMessage(chatId, {
            image: buffer,
            caption: `*🤖 ───❪ DEEP IMAGE AI ❫─── 🤖*\n\n` +
                `✅ *تم التوليد بنجاح!*\n\n` +
                `📝 *الوصف:* ${promptRaw}\n` +
                `🎭 *الأسلوب:* ${style}\n\n` +
                `*⚔️ ${config.botName}*`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('DeepImg error:', e.message);
        await sock.sendMessage(chatId, {
            text: `❌ *فشل توليد الصورة*\n\n⚠️ ${e.message}`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
