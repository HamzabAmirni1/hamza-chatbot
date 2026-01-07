const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, delay, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const path = require('path');

const sessionDir = path.join(__dirname, 'session');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const express = require('express');
const app = express();
const port = process.env.PORT || 8000;

// Simple Keep-Alive Server for Koyeb
app.get('/', (req, res) => res.send('Bot is healthy and running! 🚀'));
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    // Keep-Alive: Ping self every 5 mins
    setInterval(() => {
        axios.get(`http://localhost:${port}`).catch(() => { });
    }, 5 * 60 * 1000);
});

async function getGPTResponse(message) {
    try {
        // Using Pollinations AI
        const systemPrompt = "You are Hamza Amirni, a helpful WhatsApp assistant. Answer the following message: ";
        const { data } = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(systemPrompt + message)}`);
        return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error) {
        console.error("GPT API Error:", error.message);
        return "⚠️ I'm having trouble connecting to my brain server.";
    }
}

async function startBot() {
    // 🔄 Restore Session from Env Var (Persistence)
    if (process.env.SESSION_ID && !fs.existsSync(path.join(sessionDir, 'creds.json'))) {
        console.log(chalk.yellow("🔄 Restoring Session from SESSION_ID..."));
        fs.writeFileSync(path.join(sessionDir, 'creds.json'), process.env.SESSION_ID);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        defaultQueryTimeoutMs: undefined,
    });

    // Pairing Code Login
    if (!sock.authState.creds.registered) {

        // 👇👇 اكتب نمرتك هنا (بين علامات التنصيص) إذا معرفتيش دير Environment Variable
        // مثال: '212600000000'
        const hardcodedNumber = '212656918407';

        let phoneNumber = process.env.PAIRING_NUMBER || hardcodedNumber;

        if (!phoneNumber) {
            console.log(chalk.yellow("⚠️ No PAIRING_NUMBER env var found."));
            // If running locally, we can ask. If on server, this might hang or fail.
            // But for now, we prioritize the Env Var.
        }

        if (phoneNumber) {
            // Remove special chars
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(chalk.bgGreen.black(`🚀 PAIRING CODE: `), chalk.bold.red(formattedCode));
                    console.log(chalk.cyan("👉 سير دابا لـ WhatsApp > Linked Devices > Link with phone number وحط هاد الكود!"));
                } catch (e) {
                    console.error("Pairing Error:", e.message);
                }
            }, 3000);
        } else {
            console.log(chalk.red("❌ Please set PAIRING_NUMBER in Koyeb Environment Variables to login!"));
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.red(`Connection closed. Reconnecting: ${shouldReconnect}`));
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('✅ Hamza Amirni Bot Connected! Auto-Reply is active.'));
            // Send Session (creds.json) to Self
            try {
                const creds = fs.readFileSync('./session/creds.json');
                await sock.sendMessage(sock.user.id, { document: creds, mimetype: 'application/json', fileName: 'creds.json', caption: '📂 هادي Session ديالك. خبيها عندك!' });
            } catch (e) { }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            // Only process notify messages
            if (chatUpdate.type !== 'notify') return;

            for (const msg of chatUpdate.messages) {
                if (!msg.message || msg.key.fromMe) continue; // Ignore self and empty messages

                const type = Object.keys(msg.message)[0];

                // Extract text body
                let body = (type === 'conversation') ? msg.message.conversation :
                    (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text :
                        (type === 'imageMessage') ? msg.message.imageMessage.caption :
                            (type === 'videoMessage') ? msg.message.videoMessage.caption : '';

                if (!body) continue;

                // Ignore Status Updates, Newsletters AND Groups (Private Only)
                if (msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid.includes('@newsletter') || msg.key.remoteJid.endsWith('@g.us')) continue;

                console.log(chalk.cyan(`Thinking response for: ${body.substring(0, 30)}...`));

                // Anti-Ban: Mark read, Type, Delay
                await sock.readMessages([msg.key]);
                await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
                await new Promise(resolve => setTimeout(resolve, 3000)); // 3s Delay

                // Get GPT Response
                const reply = await getGPTResponse(body);

                // Reply to user
                await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
            }

        } catch (err) {
            console.error('Error in message handler:', err);
        }
    });

    // Handle unhandled rejections to prevent crash
    process.on('uncaughtException', console.error);
    process.on('unhandledRejection', console.error);
}

startBot();
