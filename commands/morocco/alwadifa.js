const axios = require('axios');
const cheerio = require('cheerio');

async function fetchJobs() {
    const url = "https://www.alwadifa-maroc.com/";
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000,
    });
    const $ = cheerio.load(response.data);
    const items = [];
    $('.bloc-content').each((i, el) => {
        if (i >= 12) return false;
        const link = $(el).find('a:first-child').attr('href');
        const title = $(el).find('a:first-child').text().trim();
        const views = $(el).find('li').eq(1).text().trim();
        if (title && link) {
            const fullLink = link.startsWith('/') ? `https://www.alwadifa-maroc.com${link}` : link;
            items.push({ title, link: fullLink, views });
        }
    });
    return items;
}

async function fetchJobDetails(url) {
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000,
    });
    const $ = cheerio.load(response.data);
    const paragraphs = $('p').map((i, el) => $(el).text().trim()).get()
        .filter(p => p.length > 20)
        .join('\n')
        .substring(0, 1500);
    return paragraphs;
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const text = args.join(' ').trim();
    const { command } = extra;

    if (!text || command === 'alwadifa') {
        const waitMsg = await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  💼 *ALWADIFA*   ║\n╚══════════════════╝\n\n⏳ *جاري جلب الوظائف...*`,
        }, { quoted: msg });

        try {
            const jobs = await fetchJobs();
            if (!jobs.length) throw new Error('لم يتم العثور على وظائف');

            try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

            let message = `╔══════════════════╗\n║  💼 *ALWADIFA*   ║\n╚══════════════════╝\n\n🔍 *أحدث الوظائف في المغرب:*\n─────────────────────\n\n`;
            jobs.forEach((job, i) => {
                message += `*${i + 1}.* ${job.title}\n👁️ ${job.views || ''}\n🔗 ${job.link}\n\n`;
            });
            message += `─────────────────────\n💡 لقراءة تفاصيل وظيفة: *.wdifaread [رقم]*`;

            await sock.sendMessage(chatId, { text: message }, { quoted: msg });
        } catch (e) {
            try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
            await sock.sendMessage(chatId, { text: `❌ فشل جلب الوظائف: ${e.message}` }, { quoted: msg });
        }
        return;
    }

    // read details
    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════╗\n║  💼 *ALWADIFA*   ║\n╚══════════════════╝\n\n⏳ *جاري قراءة تفاصيل الوظيفة...*`,
    }, { quoted: msg });

    try {
        let url = text;
        if (/^\d+$/.test(text)) {
            const jobs = await fetchJobs();
            const idx = parseInt(text) - 1;
            if (!jobs[idx]) throw new Error('رقم الوظيفة غير موجود');
            url = jobs[idx].link;
        }
        if (!url.startsWith('http')) throw new Error('يرجى إرسال رابط أو رقم الوظيفة');

        const details = await fetchJobDetails(url);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  💼 *ALWADIFA*   ║\n╚══════════════════╝\n\n📋 *تفاصيل الوظيفة:*\n─────────────────────\n\n${details || 'لا توجد تفاصيل متاحة'}\n\n─────────────────────\n🔗 ${url}\n\n*🚀 Hamza Amirni Bot*`,
        }, { quoted: msg });
    } catch (e) {
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ فشل قراءة الوظيفة: ${e.message}` }, { quoted: msg });
    }
};
