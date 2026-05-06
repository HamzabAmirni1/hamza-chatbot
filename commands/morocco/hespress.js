const axios = require('axios');
const cheerio = require('cheerio');

async function fetchHesspress() {
    const response = await axios.get('https://www.hespress.com/all', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000,
    });
    const $ = cheerio.load(response.data);
    const result = [];
    $('.col-12.col-sm-6.col-md-6.col-xl-3').each((i, el) => {
        if (i >= 10) return false;
        const title = $(el).find('.card-title').text().trim();
        const date = $(el).find('.date-card small').text().trim();
        const image = $(el).find('.card-img-top img').attr('src');
        const link = $(el).find('.stretched-link').attr('href');
        if (title && link) result.push({ title, date, image, link });
    });
    return result;
}

async function fetchHespressArticle(url) {
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 15000,
    });
    const $ = cheerio.load(response.data);
    $('script, style').remove();
    const title = $('.post-title').text().trim();
    const image = $('.figure-heading-post .post-thumbnail img').attr('src');
    const content = $('.article-content p').map((i, el) => $(el).text().trim()).get().join('\n').substring(0, 1200);
    const author = $('.author-name, .post-author').first().text().trim();
    const date = $('.post-date, .date-card').first().text().trim();
    return { title, image, content, author, date };
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const { command } = extra;
    const text = args.join(' ').trim();

    // .hespress → list news
    if (!text || command === 'hespress') {
        const waitMsg = await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  📰 *HESPRESS*   ║\n╚══════════════════╝\n\n⏳ *جاري جلب الأخبار...*`,
        }, { quoted: msg });

        try {
            const news = await fetchHesspress();
            if (!news.length) throw new Error('لم يتم العثور على أخبار');

            try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

            let text = `╔══════════════════╗\n║  📰 *HESPRESS*   ║\n╚══════════════════╝\n\n📰 *آخر أخبار هسبريس:*\n─────────────────────\n\n`;
            news.forEach((item, i) => {
                text += `*${i + 1}.* ${item.title}\n📅 ${item.date || ''}\n🔗 ${item.link}\n\n`;
            });
            text += `─────────────────────\n📖 لقراءة خبر: *.hespressread [رقم]*`;

            await sock.sendMessage(chatId, { text }, { quoted: msg });
        } catch (e) {
            try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
            await sock.sendMessage(chatId, { text: `❌ فشل جلب الأخبار: ${e.message}` }, { quoted: msg });
        }
        return;
    }

    // .hespressread [url or number] → read article
    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════╗\n║  📰 *HESPRESS*   ║\n╚══════════════════╝\n\n⏳ *جاري قراءة الخبر...*`,
    }, { quoted: msg });

    try {
        let url = text;
        if (/^\d+$/.test(text)) {
            const news = await fetchHesspress();
            const idx = parseInt(text) - 1;
            if (!news[idx]) throw new Error('رقم الخبر غير موجود');
            url = news[idx].link;
        }

        if (!url.startsWith('http')) throw new Error('يرجى إرسال رابط أو رقم الخبر');

        const article = await fetchHespressArticle(url);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        const caption = `╔══════════════════╗\n║  📰 *HESPRESS*   ║\n╚══════════════════╝\n\n📌 *${article.title}*\n${article.author ? `✍️ ${article.author}\n` : ''}${article.date ? `📅 ${article.date}\n` : ''}\n─────────────────────\n${article.content}\n─────────────────────\n🔗 ${url}\n\n*🚀 Hamza Amirni Bot*`;

        if (article.image) {
            await sock.sendMessage(chatId, {
                image: { url: article.image },
                caption,
            }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, { text: caption }, { quoted: msg });
        }
    } catch (e) {
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ فشل جلب الخبر: ${e.message}` }, { quoted: msg });
    }
};
