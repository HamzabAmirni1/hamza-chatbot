const { downloadYouTube } = require('../../lib/ytdl');

async function handler(sock, chatId, msg, args, helpers, userLang) {
    const url = args.join(' ').trim();
    if (!url) return sock.sendMessage(chatId, { text: `❌ أدخل رابط يوتيوب صالح.\n📌 مثال: .ytmp4v2 https://youtu.be/abc123` }, { quoted: msg });

    try {
        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
        await sock.sendMessage(chatId, { text: "⏳ المرجو الانتظار قليلا... يتم جلب الفيديو بأفضل جودة." }, { quoted: msg });

        const result = await downloadYouTube(url, 'video');

        if (!result || !result.download) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
            return sock.sendMessage(chatId, { text: `❌ فشل التحميل: جميع المحاولات باءت بالفشل.` }, { quoted: msg });
        }

        await sock.sendMessage(chatId, {
            video: { url: result.download },
            mimetype: 'video/mp4',
            fileName: `${result.title || 'video'}.mp4`,
            caption: `🎬 *${result.title || 'YouTube Video'}*\n📥 تم التحميل بنجاح بواسطة Hamza Bot`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (error) {
        console.error("YTMP4V2 Error:", error);
        await sock.sendMessage(chatId, { text: `❌ خطأ غير متوقع: ${error.message}` }, { quoted: msg });
    }
};

module.exports = handler;
