const axios = require('axios');
const chalk = require('chalk');

// Memory storage for user emails (persists until bot restarts)
const userEmails = new Map();

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const sender = chatId;
    const command = args[0]?.toLowerCase() || "";

    // ─── HELP / MENU ───
    if (!command || command === "help") {
        const text = `📬 *Temporary Email Service*
        
Available actions:
• *.tempmail gen* - Create a new temporary email
• *.tempmail list* - List latest 10 messages
• *.tempmail read <ID>* - Read a specific message
• *.tempmail delete* - Delete your current email
• *.tempmail my* - Show your current email

_Note: Emails expire when the bot restarts or after inactivity._`;
        return await sock.sendMessage(chatId, { text }, { quoted: msg });
    }

    // ─── GENERATE ───
    if (command === "gen" || command === "create" || command === "انشاء") {
        if (userEmails.has(sender)) {
            return await sock.sendMessage(chatId, { text: `⚠️ You already have an active email: \`${userEmails.get(sender)}\`\nUse *.tempmail delete* to create a new one.` }, { quoted: msg });
        }

        try {
            const { data } = await axios.get("https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1", {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            if (data && data[0]) {
                const email = data[0];
                userEmails.set(sender, email);
                return await sock.sendMessage(chatId, { text: `✅ *Temp Mail Created!*\n\n📧 Email: \`${email}\`\n\nUse *.tempmail list* to check for messages.` }, { quoted: msg });
            }
            throw new Error("Empty response from 1secmail");
        } catch (e) {
            console.error(chalk.red(`[TempMail Error]: ${e.message}`));
            return await sock.sendMessage(chatId, { text: "❌ Failed to generate temporary email. 1secmail API might be down. Try again in a few minutes." }, { quoted: msg });
        }
    }

    // ─── SHOW MY EMAIL ───
    if (command === "my" || command === "بريدي") {
        const email = userEmails.get(sender);
        if (!email) return await sock.sendMessage(chatId, { text: "❌ You don't have an active temporary email. Use *.tempmail gen* to create one." }, { quoted: msg });
        return await sock.sendMessage(chatId, { text: `📧 Your current email: \`${email}\`` }, { quoted: msg });
    }

    // ─── DELETE ───
    if (command === "delete" || command === "حذف") {
        if (!userEmails.has(sender)) return await sock.sendMessage(chatId, { text: "❌ No active email found to delete." }, { quoted: msg });
        userEmails.delete(sender);
        return await sock.sendMessage(chatId, { text: "✅ Temporary email deleted successfully." }, { quoted: msg });
    }

    // ─── LIST MESSAGES ───
    if (command === "list" || command === "check" || command === "رسائل") {
        const email = userEmails.get(sender);
        if (!email) return await sock.sendMessage(chatId, { text: "❌ No active email found. Use *.tempmail gen* first." }, { quoted: msg });

        try {
            const [login, domain] = email.split("@");
            const { data } = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (!data || data.length === 0) {
                return await sock.sendMessage(chatId, { text: "📭 No messages found yet. Try again in a few seconds." }, { quoted: msg });
            }

            let text = `📬 *Latest Messages for* \`${email}\`:\n\n`;
            data.slice(0, 10).forEach(m => {
                text += `🆔 *ID:* \`${m.id}\`\n👤 *From:* ${m.from}\n📝 *Subject:* ${m.subject}\n📅 *Date:* ${m.date}\n────────────────\n`;
            });
            text += `\nUse *.tempmail read <ID>* to read a message.`;
            return await sock.sendMessage(chatId, { text }, { quoted: msg });
        } catch (e) {
            console.error(chalk.red(`[TempMail List Error]: ${e.message}`));
            return await sock.sendMessage(chatId, { text: "❌ Failed to fetch messages." }, { quoted: msg });
        }
    }

    // ─── READ MESSAGE ───
    if (command === "read" || command === "اقرأ") {
        const email = userEmails.get(sender);
        if (!email) return await sock.sendMessage(chatId, { text: "❌ No active email found." }, { quoted: msg });

        const msgId = args[1];
        if (!msgId) return await sock.sendMessage(chatId, { text: "⚠️ Please provide a message ID. Example: *.tempmail read 12345678*" }, { quoted: msg });

        try {
            const [login, domain] = email.split("@");
            const { data } = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${msgId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (!data || !data.body) return await sock.sendMessage(chatId, { text: "❌ Message not found or expired." }, { quoted: msg });

            // Clean HTML if necessary (simple version)
            const cleanBody = data.textBody || data.body.replace(/<[^>]*>?/gm, '').trim();
            
            const text = `📧 *Message Details*\n\n🆔 ID: ${data.id}\n👤 From: ${data.from}\n📅 Date: ${data.date}\n📝 Subject: ${data.subject}\n\n💬 *Message:*\n${cleanBody}`;
            return await sock.sendMessage(chatId, { text }, { quoted: msg });
        } catch (e) {
            console.error(chalk.red(`[TempMail Read Error]: ${e.message}`));
            return await sock.sendMessage(chatId, { text: "❌ Failed to read message." }, { quoted: msg });
        }
    }

    // Unknown subcommand
    return await sock.sendMessage(chatId, { text: "⚠️ Unknown subcommand. Use *.tempmail help* to see available options." }, { quoted: msg });
};
