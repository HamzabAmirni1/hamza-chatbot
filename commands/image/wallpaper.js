const axios = require('axios');
const cheerio = require('cheerio');

class Wallpaper {
    constructor() {
        this.base = 'https://4kwallpapers.com';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
        };
    }

    async search(q) {
        const { data } = await axios.get(`${this.base}/search/?text=${encodeURIComponent(q)}`, {
            headers: this.headers, timeout: 15000,
        });
        const $ = cheerio.load(data);
        const res = [];
        $('div#pics-list .wallpapers__item').each((i, e) => {
            if (i >= 8) return false;
            const thumbnail = $(e).find('img').attr('src') || $(e).find('img').attr('data-src');
            const title = $(e).find('.title2').text().trim() || 'No Title';
            const url = $(e).find('a').attr('href');
            if (url) res.push({ thumbnail, title, url: url.startsWith('http') ? url : this.base + url });
        });
        return res;
    }

    async getCategory(type) {
        const paths = {
            'popular': '/most-popular-4k-wallpapers/',
            'random': '/random-wallpapers/',
            'nature': '/nature-wallpapers/',
            'anime': '/anime-wallpapers/',
            'cars': '/car-wallpapers/',
            'space': '/space-wallpapers/',
        };
        const catPath = paths[type] || '/most-popular-4k-wallpapers/';
        const { data } = await axios.get(`${this.base}${catPath}`, {
            headers: this.headers, timeout: 15000,
        });
        const $ = cheerio.load(data);
        const res = [];
        $('div#pics-list .wallpapers__item').each((i, e) => {
            if (i >= 6) return false;
            const thumbnail = $(e).find('img').attr('src') || $(e).find('img').attr('data-src');
            const title = $(e).find('.title2').text().trim() || `Wallpaper ${i + 1}`;
            const url = $(e).find('a').attr('href');
            if (url) res.push({ thumbnail, title, url: url.startsWith('http') ? url : this.base + url });
        });
        return res;
    }
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const type = args[0]?.toLowerCase();
    const query = args.slice(1).join(' ');
    const wallpaper = new Wallpaper();

    const HELP = `╔════════════════════╗\n║  🌆 *4K WALLPAPER* ║\n╚════════════════════╝\n\n📌 *أوامر الاستخدام:*\n\n🔍 *بحث:*\n.wallpaper search طبيعة\n\n🌟 *التصنيفات:*\n.wallpaper popular\n.wallpaper random\n.wallpaper nature\n.wallpaper anime\n.wallpaper cars\n.wallpaper space\n\n─────────────────────\n📸 instagram.com/hamza.amirni`;

    if (!type) {
        return await sock.sendMessage(chatId, { text: HELP }, { quoted: msg });
    }

    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔════════════════════╗\n║  🌆 *4K WALLPAPER* ║\n╚════════════════════╝\n\n⏳ *جاري البحث عن ${type === 'search' ? query : type}...*`,
    }, { quoted: msg });

    try {
        let results = [];

        if (type === 'search') {
            if (!query) {
                try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }
                return await sock.sendMessage(chatId, { text: `❌ اكتب كلمة البحث!\n*مثال:* .wallpaper search قمر` }, { quoted: msg });
            }
            results = await wallpaper.search(query);
        } else {
            results = await wallpaper.getCategory(type);
        }

        if (!results.length) throw new Error('لم يتم العثور على خلفيات');

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            text: `╔════════════════════╗\n║  🌆 *4K WALLPAPER* ║\n╚════════════════════╝\n\n✅ *وجدت ${results.length} خلفيات!*\n🔍 *البحث:* ${type === 'search' ? query : type}\n\n─────────────────────`,
        }, { quoted: msg });

        for (let i = 0; i < Math.min(results.length, 4); i++) {
            const item = results[i];
            try {
                await sock.sendMessage(chatId, {
                    image: { url: item.thumbnail },
                    caption: `🌆 *${item.title}*\n\n📥 *للتحميل بجودة 4K:*\n${item.url}\n\n*${i + 1}/${Math.min(results.length, 4)}*`,
                });
                await new Promise(r => setTimeout(r, 600));
            } catch (imgErr) { /* skip */ }
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Wallpaper Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ فشل البحث: ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
