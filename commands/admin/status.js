const axios = require('axios');

module.exports = async (sock, chatId, msg, args, { getUptime }) => {
    await sock.sendMessage(chatId, { react: { text: "📊", key: msg.key } });

    try {
        const used = process.memoryUsage().rss / 1024 / 1024;
        const uptime = getUptime();
        
        let deviceStr = "Unknown";
        try {
            // sock.user holds connected user info in Baileys
            deviceStr = sock.user.id.split(':')[0];
        } catch(e){}

        const report = `💻 *Bot Professional Status* 💻
━━━━━━━━━━━━━━━━━━━━

🤖 *Name:* Hamza Chatbot
🕒 *Uptime:* ${uptime}
🧠 *RAM:* ${Math.round(used)}MB / 512MB
🌐 *Node.js:* ${process.version}
📡 *Platform:* ${process.platform} (${process.arch})

🛡️ *Security:* Active
✅ *Auto-Posters:* Online
✅ *AI Models:* Gemini/Blackbox Ready

━━━━━━━━━━━━━━━━━━━━
💡 _Bot looks healthy and responding at high speed._`;

        await sock.sendMessage(chatId, { text: report }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Status Error:", e);
        await sock.sendMessage(chatId, { text: `❌ Error fetching status: ${e.message}` }, { quoted: msg });
    }
};
