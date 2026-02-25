/**
 * .wallpaper - بحث وتحميل خلفيات 4K
 * المصدر: 4kwallpapers.com
 */

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../../config');

const BASE = 'https://4kwallpapers.com';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
};

async function searchWallpaper(query) {
    const { data } = await axios.get(`${BASE}/search/?text=${encodeURIComponent(query)}`, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const results = [];
    $('div#pics-list .wallpapers__item').each((i, e) => {
        results.push({
            thumbnail: $(e).find('img').attr('src'),
            title: $(e).find('.title2').text().trim(),
            url: $(e).find('a').attr('href')
        });
    });
    return results;
}

async function downloadWallpaper(url) {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const imgUrl = $('img#main-image, img.main-image, #main-pic img').first().attr('src')
        || $('meta[property="og:image"]').attr('content');
    return imgUrl;
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const query = args.join(' ').trim();

    if (!query) {
        return await sock.sendMessage(chatId, {
            text: `🌆 *4K Wallpaper*\n\n` +
                `📌 *الاستخدام:*\n` +
                `• \`.wallpaper طبيعة\` - بحث عن خلفيات الطبيعة\n` +
                `• \`.wallpaper سيارات\` - خلفيات سيارات\n` +
                `• \`.wallpaper space\` - خلفيات الفضاء\n` +
                `• \`.wallpaper anime\` - انيمي\n` +
                `• \`.wallpaper city night\` - مدينة ليلاً\n\n` +
                `🔥 *يرسل أول 3 صور HD من نتائج البحث!*`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🔍', key: msg.key } });
    await sock.sendMessage(chatId, {
        text: `🔍 *جاري البحث عن:* "${query}"\n_يرجى الانتظار..._`
    }, { quoted: msg });

    try {
        const results = await searchWallpaper(query);

        if (!results || results.length === 0) {
            return await sock.sendMessage(chatId, {
                text: `❌ لم يتم العثور على خلفيات بهذا البحث.\nجرب كلمات مختلفة.`
            }, { quoted: msg });
        }

        const toSend = results.slice(0, 3);
        await sock.sendMessage(chatId, {
            text: `✅ *وجدت ${results.length} خلفية!* جاري إرسال أفضل ${toSend.length}...\n\n🔎 *البحث:* ${query}`
        }, { quoted: msg });

        let sentCount = 0;
        for (const item of toSend) {
            try {
                // Try to get direct download URL
                let imgUrl = null;
                if (item.url) {
                    imgUrl = await downloadWallpaper(item.url).catch(() => null);
                }
                if (!imgUrl && item.thumbnail) imgUrl = item.thumbnail;
                if (!imgUrl) continue;

                const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', headers: HEADERS, timeout: 30000 });
                const buffer = Buffer.from(imgRes.data, 'binary');

                await sock.sendMessage(chatId, {
                    image: buffer,
                    caption: `🌆 *${item.title || 'Wallpaper 4K'}*\n\n🔗 ${item.url || ''}\n\n*⚔️ ${config.botName}*`
                }, { quoted: msg });
                sentCount++;

                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                console.error('Wallpaper send error:', e.message);
            }
        }

        if (sentCount === 0) {
            await sock.sendMessage(chatId, { text: '❌ تعذر تحميل الصور، جرب مرة أخرى لاحقاً.' }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
        }

    } catch (e) {
        console.error('Wallpaper error:', e.message);
        await sock.sendMessage(chatId, {
            text: `❌ *خطأ في البحث عن الخلفيات*\n\n⚠️ ${e.message}`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
