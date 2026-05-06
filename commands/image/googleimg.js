/**
 * .googleimg - بحث صور Google
 */

const axios = require('axios');
const config = require('../../config');

async function searchGoogleImages(query) {
    // Using a reliable alternative scraper API
    const apis = [
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/s/google-images?q=${encodeURIComponent(query)}`, { timeout: 10000 });
            if (res.data?.data?.length) return res.data.data.slice(0, 5).map(i => i.url || i.image || i);
            return null;
        },
        async () => {
            const res = await axios.get(`https://ddg-api.herokuapp.com/images?q=${encodeURIComponent(query)}&limit=5`, { timeout: 10000 });
            if (res.data?.results?.length) return res.data.results.map(i => i.image);
            return null;
        },
        async () => {
            // DuckDuckGo image search via scraper
            const res = await axios.get(
                `https://api-dudu1234.vercel.app/google/image?q=${encodeURIComponent(query)}`,
                { timeout: 10000 }
            );
            if (res.data?.result?.length) return res.data.result.slice(0, 5);
            return null;
        }
    ];

    for (const api of apis) {
        try {
            const result = await api();
            if (result && result.length > 0) return result;
        } catch (e) { }
    }
    return null;
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const query = args.join(' ').trim();

    if (!query) {
        return await sock.sendMessage(chatId, {
            text: `🔍 *Google Image Search*\n\n📌 *الاستخدام:*\n\`.googleimg [الكلمة]\`\n\n*أمثلة:*\n• \`.googleimg مدينة ليلاً\`\n• \`.googleimg Morocco landscape\`\n• \`.googleimg anime wallpaper\``
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🔍', key: msg.key } });
    await sock.sendMessage(chatId, {
        text: `🔍 *جاري البحث عن:* "${query}"\n_يرجى الانتظار..._`
    }, { quoted: msg });

    try {
        const images = await searchGoogleImages(query);

        if (!images || images.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '❌ لم يتم العثور على صور. جرب كلمة مختلفة.'
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, {
            text: `✅ *وجدت ${images.length} صورة* لـ "${query}"\nجاري الإرسال...`
        }, { quoted: msg });

        let sentCount = 0;
        for (let i = 0; i < Math.min(images.length, 5); i++) {
            const imgUrl = typeof images[i] === 'string' ? images[i] : images[i].url || images[i].image;
            if (!imgUrl) continue;
            try {
                const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
                const buffer = Buffer.from(imgRes.data, 'binary');
                await sock.sendMessage(chatId, {
                    image: buffer,
                    caption: i === 0 ? `🔍 *${query}*\n\n*⚔️ ${config.botName}*` : ''
                }, { quoted: i === 0 ? msg : undefined });
                sentCount++;
                await new Promise(r => setTimeout(r, 500));
            } catch (e) { }
        }

        if (sentCount === 0) {
            await sock.sendMessage(chatId, { text: '❌ تعذر تحميل الصور. جرب مرة أخرى.' }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
        }
    } catch (e) {
        console.error('GoogleImg error:', e.message);
        await sock.sendMessage(chatId, {
            text: `❌ *فشل البحث*\n⚠️ ${e.message}`
        }, { quoted: msg });
    }
};
