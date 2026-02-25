const axios = require('axios');

async function capcutDownloader(url) {
    try {
        const headers = {
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json"
        };
        const { data } = await axios.post("https://3bic.com/api/download", { url }, { headers, timeout: 30000 });

        if (!data || !data.originalVideoUrl) {
            return { status: false, msg: "فشل الحصول على بيانات الفيديو" };
        }

        const base64url = data.originalVideoUrl.split("/api/cdn/")[1];
        const video = Buffer.from(base64url, "base64").toString();

        return {
            status: true,
            title: data.title || "CapCut Video",
            author: data.authorName || "Unknown",
            thumbnail: data.coverUrl || "",
            video
        };
    } catch (err) {
        return { status: false, msg: err.message };
    }
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const url = args.join(' ').trim();

    if (!url || !url.includes('capcut')) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  🎬 *CAPCUT DL*  ║\n╚══════════════════╝\n\n⚠️ *يرجى إضافة رابط CapCut*\n\n*مثال:*\n.capcut https://www.capcut.com/...\n\n─────────────────────\n📸 instagram.com/hamza.amirni`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '⬇️', key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════╗\n║  🎬 *CAPCUT DL*  ║\n╚══════════════════╝\n\n⏳ *جاري تحميل الفيديو...*\n🔄 يرجى الانتظار`,
    }, { quoted: msg });

    try {
        const res = await capcutDownloader(url);

        if (!res.status) throw new Error(res.msg);

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            video: { url: res.video },
            caption: `╔══════════════════╗\n║  🎬 *CAPCUT DL*  ║\n╚══════════════════╝\n\n✅ *تم التحميل بنجاح!*\n🎬 *العنوان:* ${res.title}\n👤 *المؤلف:* ${res.author}\n\n*🚀 Hamza Amirni Bot*\n─────────────────────\n📸 instagram.com/hamza.amirni`,
            mimetype: 'video/mp4',
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('CapCut Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشل التحميل*\n\n${e.message}\n\nتأكد أن الرابط صحيح.`,
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
