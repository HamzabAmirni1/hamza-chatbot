const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const { getUptime, readAntiCallState, command } = helpers;
    const start = Date.now();

    if (command === 'status') {
        const { enabled } = readAntiCallState();
        const status = `📈 *Server Status:*
                    
⏱️ *Uptime:* ${getUptime()}
🌐 *Keep-Alive:* ${config.publicUrl ? "Active ✅" : "Inactive ❌"}
📵 *Anti-Call:* ${enabled ? "Active ✅" : "Disabled ⚠️"}
🖥️ *RAM Use:* ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB / 512MB
📡 *Version:* ${config.version}`;
        return await sock.sendMessage(chatId, { text: status }, { quoted: msg });
    }

    await sock.sendMessage(chatId, {
        text: `🏓 *Pong!*\n🚀 *السرعة:* ${Date.now() - start}ms\n⚡ *البوت خدام مزيان!*`,
    }, { quoted: msg });
};
