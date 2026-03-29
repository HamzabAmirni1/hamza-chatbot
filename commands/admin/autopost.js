const axios = require('axios');
const config = require('../../config');
const { sendFacebookMessage } = require('../../lib/facebook');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const text = args.join(" ");
    if (!text) return await sock.sendMessage(chatId, { text: "⚠️ أرجو كتابة النص المراد نشره على الفيسبوك والتيليجرام." });

    // 1. Post to Facebook Page
    let fbStatus = "✅";
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/feed?access_token=${config.fbPageAccessToken}`, {
            message: text
        });
    } catch (e) {
        fbStatus = "❌ (Error)";
        console.error("FB Post Error:", e.response?.data || e.message);
    }

    // 2. Post to Telegram Channel (if token and ID available)
    let tgStatus = "✅";
    if (config.telegramToken) {
        try {
            // Using the ownerNumber as a fallback if no specific channel ID provided
            const targetId = config.ownerNumber[0]; 
            await axios.post(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
                chat_id: targetId,
                text: `📢 *نشر جديد:*\n\n${text}`,
                parse_mode: "Markdown"
            });
        } catch (e) {
            tgStatus = "❌ (Error)";
            console.error("TG Post Error:", e.response?.data || e.message);
        }
    } else {
        tgStatus = "❌ (Not Configured)";
    }

    await sock.sendMessage(chatId, { 
        text: `🚀 *تمت عملية النشر المتعدد:*\n\n🔹 Facebook Page: ${fbStatus}\n🔹 Telegram Channel: ${tgStatus}\n\n📝 النص: _${text}_`
    }, { quoted: msg });
};
