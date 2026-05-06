const axios = require('axios');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    await sock.sendMessage(chatId, { react: { text: "💳", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, { text: "⏳ *جاري فحص حالة السيرفر والاعتمادات...*" }, { quoted: msg });

    try {
        let status = `📊 *حالة الـ APIs والاعتمادات:*\n\n`;

        // Check OpenRouter
        try {
            const testResponse = await axios.get("https://openrouter.ai/api/v1/auth/key", {
                headers: { Authorization: `Bearer ${config.openRouterKey}` },
                timeout: 5000
            });
            const credits = testResponse.data?.data?.limit_remaining || 0;
            status += `✅ *OpenRouter:* ${credits} requests باقيين\n`;
        } catch (e) {
            status += `❌ *OpenRouter:* مشكل فوصل الخدمة\n`;
        }

        // Check Hugging Face if needed or others
        status += `⚡ *System Status:* Online\n`;
        status += `🚀 *Uptime:* ${commands.getUptime ? commands.getUptime() : 'Unknown'}`;

        await sock.sendMessage(chatId, { delete: waitMsg.key });
        await sock.sendMessage(chatId, { text: status }, { quoted: msg });

    } catch (e) {
        await sock.sendMessage(chatId, { text: "❌ وقع مشكل ففحص الحالة." }, { quoted: msg });
    }
};
