const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const url = args[0];
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        const urlPath = path.join(__dirname, "..", "..", "server_url.json");
        fs.writeFileSync(urlPath, JSON.stringify({ url }));
        config.publicUrl = url;
        await sock.sendMessage(chatId, {
            text: `✅ *تم تفعيل Keep-Alive!* \n\nالرابط: ${url}\n\nدابا السكريبت غايولي يفيّق راسو كل 2 دقائق باش ميبقاش ينعس ف Koyeb.`,
        }, { quoted: msg });
    } else {
        await sock.sendMessage(chatId, {
            text: `❌ *خطأ:* عافاك صيفط رابط صحيح كيبدا بـ http:// أو https://`,
        }, { quoted: msg });
    }
};
