const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        await sock.sendMessage(chatId, { text: "⏳ جاري جلب آخر الأخبار العاجلة..." }, { quoted: msg });
        
        // Fetch from Al Jazeera Arabic (RSS/Scrape)
        const res = await axios.get("https://www.aljazeera.net/breaking/");
        const $ = cheerio.load(res.data);
        const news = [];

        $('.breaking-news-list-item').each((i, el) => {
            if (i < 5) {
                const title = $(el).find('h3').text().trim();
                const time = $(el).find('.breaking-news-time').text().trim();
                news.push(`🔹 *${time}* - ${title}`);
            }
        });

        if (news.length === 0) {
            // Fallback to simple news API or another source
            const { data } = await axios.get("https://newsdata.io/api/1/news?apikey=pub_3675276e5d590408542da671f65bb1fb287&q=news&language=ar");
            data.results.slice(0, 5).forEach(n => news.push(`🔹 ${n.title}`));
        }

        const newsText = `🗞️ *آخر الأخبار العاجلة:*\n━━━━━━━━━━━━━━\n\n${news.join('\n\n')}\n\n📍 المصادر: الجزيرة / مصادر إخبارية متنوعة.`;
        
        await sock.sendMessage(chatId, { text: newsText }, { quoted: msg });
        
    } catch (e) {
        console.error("News fetch error:", e.message);
        await sock.sendMessage(chatId, { text: "❌ فشل جلب الأخبار، السيرفر مشغول حالياً." }, { quoted: msg });
    }
};
