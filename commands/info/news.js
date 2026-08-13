const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        await sock.sendMessage(chatId, { text: "⏳ جاري جلب آخر الأخبار العاجلة..." }, { quoted: msg });
        
        // Fetch from Al Jazeera Arabic RSS
        const res = await axios.get("https://www.aljazeera.net/rss", {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(res.data, { xmlMode: true });
        const news = [];

        $('item').each((i, el) => {
            if (i < 6) {
                const title = $(el).find('title').text().trim();
                let dateStr = $(el).find('pubDate').text().trim();
                // Format: "Sun, 29 Mar 2026 15:58:55 +0300" -> "15:58"
                const matchTime = dateStr.match(/\d{2}:\d{2}/);
                const timeStr = matchTime ? matchTime[0] : "";
                news.push(`🔹 ${timeStr ? `*[${timeStr}]* ` : ""}${title}`);
            }
        });

        if (news.length === 0) {
            // Fallback to simple news API
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
