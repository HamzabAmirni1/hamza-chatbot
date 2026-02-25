const axios = require('axios');

async function getLyrics(query) {
    try {
        const { data } = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(query)}`);
        return data.lyrics;
    } catch (e) {
        // Fallback to searching if simple lyrics.ovh fails (requires artist/title format usually)
        return null;
    }
}

// Alternative lyrics search using a scraper/api
async function searchLyrics(query) {
    try {
        const { data } = await axios.get(`https://lyrist.vercel.app/api/${encodeURIComponent(query)}`);
        return data;
    } catch (e) {
        return null;
    }
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const query = args.join(' ').trim();

    if (!query) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║   🎵 *LYRICS*    ║\n╚══════════════════╝\n\n⚠️ *يرجى كتابة اسم الأغنية*\n\n*مثال:*\n.lyrics Shape of You\n\n─────────────────────\n🚀 *Hamza Amirni Bot*`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🎵', key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════╗\n║   🎵 *LYRICS*    ║\n╚══════════════════╝\n\n⏳ *جاري البحث عن كلمات الأغنية...*\n🔍 "${query}"`,
    }, { quoted: msg });

    try {
        const res = await searchLyrics(query);

        if (!res || !res.lyrics) throw new Error('لم يتم العثور على كلمات لهذه الأغنية');

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        const caption = `╔══════════════════╗\n║   🎵 *LYRICS*    ║\n╚══════════════════╝\n\n📌 *العنوان:* ${res.title || query}\n🎤 *الفنان:* ${res.artist || 'Unknown'}\n\n─────────────────────\n${res.lyrics}\n─────────────────────\n\n*🚀 Hamza Amirni Bot*`;

        await sock.sendMessage(chatId, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: res.title || "Lyrics Finder",
                    body: res.artist || "Hamza Amirni Bot",
                    thumbnailUrl: res.image || "https://i.pinimg.com/564x/e1/9f/c6/e19fc638153400e9a7e6ea3e0ce1d111.jpg",
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            },
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Lyrics Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشل البحث*\n\n${e.message}`,
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
