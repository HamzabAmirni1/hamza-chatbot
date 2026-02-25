const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const BASE_URL = 'https://api.deepai.org';

function getMD5Reversed(input) {
    const hash = crypto.createHash('md5').update(input).digest('hex');
    return hash.split("").reverse().join("");
}

function generateApiKey() {
    const randomStr = Math.round(Math.random() * 100000000000).toString();
    const salt = 'hackers_become_a_little_stinkier_every_time_they_hack';
    const h1 = getMD5Reversed(UA + randomStr + salt);
    const h2 = getMD5Reversed(UA + h1);
    const h3 = getMD5Reversed(UA + h2);
    return `tryit-${randomStr}-${h3}`;
}

async function colorizeImage(buffer) {
    const apiKey = generateApiKey();
    const tmpDir = path.join(__dirname, '..', '..', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tempFile = path.join(tmpDir, `colorize_${Date.now()}.jpg`);
    fs.writeFileSync(tempFile, buffer);

    try {
        const uploadForm = new FormData();
        uploadForm.append('file', fs.createReadStream(tempFile));

        const upload = await axios.post(`${BASE_URL}/upload-temp-blob`, uploadForm, {
            headers: {
                ...uploadForm.getHeaders(),
                'User-Agent': UA,
                'Referer': 'https://deepai.org/',
                'Origin': 'https://deepai.org',
            },
            timeout: 30000,
        });

        if (!upload.data?.blob_ref) throw new Error('فشل رفع الصورة');

        const processForm = new FormData();
        processForm.append('image', upload.data.blob_ref);
        processForm.append('image_generator_version', 'standard');

        const result = await axios.post(`${BASE_URL}/api/colorizer`, processForm, {
            headers: {
                ...processForm.getHeaders(),
                'api-key': apiKey,
                'User-Agent': UA,
                'Referer': 'https://deepai.org/',
                'Origin': 'https://deepai.org',
            },
            timeout: 60000,
        });

        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        return result.data;
    } catch (e) {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        throw e;
    }
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const directImg = msg.message?.imageMessage;
    const hasQuotedImg = quotedMsg?.imageMessage || quotedMsg?.documentWithCaptionMessage?.message?.imageMessage;

    if (!hasQuotedImg && !directImg) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  🎨 *COLORIZER AI* ║\n╚══════════════════╝\n\n📸 *الرجاء الرد على صورة بالأبيض والأسود*\n\n*الأمر:* .colorize\n\n✨ سيتم تلوينها تلقائياً بالذكاء الاصطناعي\n─────────────────────\n📸 instagram.com/hamza.amirni`,
        }, { quoted: msg });
    }

    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════╗\n║  🎨 *COLORIZER AI* ║\n╚══════════════════╝\n\n⏳ *جاري تلوين الصورة...*\n🔄 يرجى الانتظار\n─────────────────────\n💡 يعمل على صور بالأبيض والأسود`,
    }, { quoted: msg });

    try {
        let targetMsg = msg;
        if (hasQuotedImg) {
            targetMsg = {
                message: quotedMsg,
                key: msg.message.extendedTextMessage.contextInfo,
            };
        }

        const buffer = await downloadMediaMessage(
            targetMsg,
            'buffer',
            {},
            { logger: pino({ level: 'silent' }) }
        );

        const result = await colorizeImage(buffer);

        if (!result?.output_url) throw new Error('فشل الحصول على رابط الصورة الملونة');

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            image: { url: result.output_url },
            caption: `╔══════════════════╗\n║  🎨 *COLORIZER AI* ║\n╚══════════════════╝\n\n✅ *تم تلوين الصورة بنجاح!*\n🤖 *Powered by:* DeepAI Colorizer\n\n*🚀 Hamza Amirni Bot*\n─────────────────────\n📸 instagram.com/hamza.amirni`,
            contextInfo: {
                externalAdReply: {
                    title: '🎨 AI Colorizer',
                    body: 'Hamza Amirni Bot',
                    thumbnailUrl: result.output_url,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            },
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '🎨', key: msg.key } });

    } catch (e) {
        console.error('Colorize Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشل التلوين*\n\n${e.message}\n\nيرجى المحاولة لاحقاً.`,
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
