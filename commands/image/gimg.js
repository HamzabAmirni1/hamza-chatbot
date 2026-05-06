const axios = require('axios');
const cheerio = require('cheerio');

async function googleImages(query) {
    const { data: html } = await axios.get(
        `https://www.google.com/search?q=${encodeURIComponent(query)}&sclient=mobile-gws-wiz-img&udm=2`,
        {
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/100.0.0.0 Mobile Safari/537.36' },
            timeout: 15000,
        }
    );
    const $ = cheerio.load(html);
    const imageUrls = [];
    $('img').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && src.startsWith('http') && !src.includes('google') && !src.includes('gstatic')) {
            imageUrls.push(src);
        }
    });
    // Also look for encoded image data
    const matches = html.match(/"(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*?)"/g) || [];
    for (const match of matches.slice(0, 20)) {
        const url = match.replace(/"/g, '');
        if (!imageUrls.includes(url)) imageUrls.push(url);
    }
    return imageUrls.slice(0, 8);
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const query = args.join(' ').trim();

    if (!query) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  🔍 *GOOGLE IMG*  ║\n╚══════════════════╝\n\n⚠️ *أضف كلمة البحث*\n\n*مثال:*\n.gimg قمر\n.gimg sunset\n\n─────────────────────\n📸 instagram.com/hamza.amirni`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🔍', key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════╗\n║  🔍 *GOOGLE IMG*  ║\n╚══════════════════╝\n\n⏳ *جاري البحث...*\n🔍 "${query}"`,
    }, { quoted: msg });

    try {
        const images = await googleImages(query);

        if (!images || images.length < 1) throw new Error('لم يتم العثور على صور');

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  🔍 *GOOGLE IMG*  ║\n╚══════════════════╝\n\n✅ *وجدت ${images.length} صور لـ:* "${query}"\n\n🚀 *Hamza Amirni Bot*`,
        }, { quoted: msg });

        const toSend = images.slice(0, 5);
        for (let i = 0; i < toSend.length; i++) {
            try {
                await sock.sendMessage(chatId, {
                    image: { url: toSend[i] },
                    caption: `🖼️ *${i + 1}/${toSend.length}* — ${query}`,
                });
                await new Promise(r => setTimeout(r, 500));
            } catch (imgErr) { /* skip failed images */ }
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('GoogleImg Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشل البحث*\n\n${e.message}`,
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
