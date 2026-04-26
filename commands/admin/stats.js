const chalk = require('chalk');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const { commandUsage, commandErrors, getUptime } = helpers;

    if (!commandUsage || !commandErrors) {
        return await sock.sendMessage(chatId, { text: "❌ Stats are not available yet. Please wait for more command activity." }, { quoted: msg });
    }

    // ─── TOP COMMANDS ───
    const sortedUsage = Object.entries(commandUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    let usageText = "📊 *Most Used Commands:*\n";
    if (sortedUsage.length === 0) {
        usageText += "_No data yet_";
    } else {
        sortedUsage.forEach(([cmd, count], i) => {
            usageText += `${i + 1}. .${cmd}: ${count} times\n`;
        });
    }

    // ─── FAILED COMMANDS ───
    const sortedErrors = Object.entries(commandErrors)
        .sort((a, b) => b[1] - a[1]);

    let errorText = "\n⚠️ *Commands with Issues:*\n";
    if (sortedErrors.length === 0) {
        errorText += "_No errors recorded! All systems green._ ✅";
    } else {
        sortedErrors.forEach(([cmd, count]) => {
            errorText += `• .${cmd}: ${count} failures\n`;
        });
    }

    const uptime = typeof getUptime === 'function' ? getUptime() : "Unknown";
    const finalMsg = `🛡️ *System Health Report*\n\n⏱️ *Uptime:* ${uptime}\n\n${usageText}\n${errorText}\n\n_Note: Stats are reset whenever the bot restarts._`;

    await sock.sendMessage(chatId, { text: finalMsg }, { quoted: msg });
};
