const axios = require('axios');
const cheerio = require('cheerio');

async function fetchFFNews() {
    try {
        const { data } = await axios.get('https://www.freefiremania.com.br/noticias', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        const $ = cheerio.load(data);
        const articles = [];
        $('.noticias-item').each((i, el) => {
            if (i >= 8) return false;
            const title = $(el).find('h2').text().trim();
            const link = $(el).find('a').attr('href');
            const date = $(el).find('.data').text().trim();
            const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
            if (title && link) {
                articles.push({ title, link, date, img });
            }
        });
        return articles;
    } catch (err) {
        throw new Error('فشل جلب أخبار فري فاير');
    }
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    await sock.sendMessage(chatId, { react: { text: '🎮', key: msg.key } });

    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════╗\n║  🎮 *FREE FIRE NEWS* ║\n╚══════════════════╝\n\n⏳ *جاري جلب آخر الأخبار...*`,
    }, { quoted: msg });

    try {
        const news = await fetchFFNews();
        if (!news.length) throw new Error('لا توجد أخبار حالياً');

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        let responseText = `╔══════════════════╗\n║  🎮 *FREE FIRE NEWS* ║\n╚══════════════════╝\n\n🔥 *آخر أخبار Free Fire:*\n─────────────────────\n\n`;

        news.forEach((item, i) => {
            responseText += `*${i + 1}.* ${item.title}\n📅 ${item.date}\n🔗 ${item.link}\n\n`;
        });

        responseText += `─────────────────────\n🚀 *Hamza Amirni Bot*`;

        const topNews = news[0];
        if (topNews.img) {
            await sock.sendMessage(chatId, {
                image: { url: topNews.img },
                caption: responseText,
            }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, { text: responseText }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: '🔥', key: msg.key } });

    } catch (e) {
        console.error('FFNews Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ فشل جلب الأخبار: ${e.message}` }, { quoted: msg });
    }
};
