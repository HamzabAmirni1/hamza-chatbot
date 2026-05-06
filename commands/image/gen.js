/**
 * .gen - AI Image Generation
 * API: getimg-x4mrsuupda-uc.a.run.app
 * المطور: حمزة اعمرني
 */

const axios = require('axios');
const config = require('../../config');

const API_KEY = "E64FUZgN4AGZ8yZr";
const IMAGE_API_ENDPOINT = "https://getimg-x4mrsuupda-uc.a.run.app/api-premium";

async function translateToEn(text) {
    try {
        const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=" + encodeURIComponent(text);
        const res = await axios.get(url, { timeout: 10000 });
        return res.data[0].map(t => t[0]).join("");
    } catch (e) {
        return text; // fallback to original
    }
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const originalPrompt = args.join(" ").trim();

    if (!originalPrompt) {
        return await sock.sendMessage(chatId, {
            text: `🎨 *Gen AI Image*\n\n` +
                `المرجو كتابة وصف الصورة.\n\n` +
                `📌 *مثال:*\n` +
                `.gen مدينة مستقبلية فالغروب\n` +
                `.gen sunset over futuristic city\n\n` +
                `🔥 يدعم العربية والدارجة والإنجليزية والفرنسية!`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, {
        text: `⏳ *جاري توليد الصورة...*\n\n📝 *الوصف:* ${originalPrompt}\n\n_يرجى الانتظار 10-30 ثانية..._`
    }, { quoted: msg });

    try {
        // Translate to English for better AI results
        const prompt = await translateToEn(originalPrompt);

        const requestBody = new URLSearchParams({
            prompt: prompt,
            width: 512,
            height: 512,
            num_inference_steps: 20
        }).toString();

        const res = await axios({
            method: "POST",
            url: IMAGE_API_ENDPOINT,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Dzine-Media-API": API_KEY,
            },
            data: requestBody,
            timeout: 60000
        });

        const data = res.data;

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        if (!data?.url) {
            return await sock.sendMessage(chatId, {
                text: "❌ فشل توليد الصورة. لم تُرجع API رابطاً للصورة."
            }, { quoted: msg });
        }

        const caption =
            `*✨ ───❪ GEN AI IMAGE ❫─── ✨*\n\n` +
            `✅ *تم التوليد بنجاح!*\n\n` +
            `📝 *الوصف (عربي):* ${originalPrompt}\n` +
            `📝 *الوصف (إنجليزي):* ${prompt}\n\n` +
            `*⚔️ ${config.botName}*`;

        // Download as buffer then send
        const imgRes = await axios.get(data.url, { responseType: 'arraybuffer', timeout: 30000 });
        const imgBuffer = Buffer.from(imgRes.data, 'binary');

        await sock.sendMessage(chatId, {
            image: imgBuffer,
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    title: "Gen AI Image",
                    body: config.botName,
                    thumbnailUrl: data.url,
                    sourceUrl: config.instagram,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Gen Image Error:", e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشل توليد الصورة*\n\n⚠️ ${e.message}`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
