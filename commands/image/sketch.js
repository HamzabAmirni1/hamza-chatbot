const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const https = require('https');
const crypto = require('crypto');
const { uploadToCatbox } = require('../../lib/media');

function generateSessionHash() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 11; i++) {
        const byte = crypto.randomBytes(1)[0];
        result += chars[byte % chars.length];
    }
    return result;
}

function getStream(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let buffer = '';
            res.on('data', chunk => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line if any
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.replace('data: ', ''));
                            if (data.msg === 'process_completed' && data.output?.data?.[0]?.url) {
                                resolve(data.output.data[0].url);
                            }
                        } catch (e) { }
                    }
                }
            });
            res.on('end', () => reject('Stream ended without completion'));
        }).on('error', reject);
    });
}

async function imageToSketch(imageUrl) {
    const sessionHash = generateSessionHash();

    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });

    const form = new FormData();
    form.append('files', imageResponse.data, {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
    });

    const uploadRes = await axios.post(
        'https://raec25-image-to-drawing-sketch.hf.space/gradio_api/upload?upload_id=qcu1l42hpn',
        form,
        { headers: form.getHeaders() }
    );

    const filePath = uploadRes.data[0];

    const payload = {
        data: [
            {
                path: filePath,
                url: `https://raec25-image-to-drawing-sketch.hf.space/gradio_api/file=${filePath}`,
                orig_name: 'image.jpg',
                size: imageResponse.data.length,
                mime_type: 'image/jpeg',
                meta: { _type: 'gradio.FileData' }
            },
            "Pencil Sketch"
        ],
        event_data: null,
        fn_index: 2,
        trigger_id: 13,
        session_hash: sessionHash
    };

    await axios.post(
        'https://raec25-image-to-drawing-sketch.hf.space/gradio_api/queue/join?__theme=system',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
    );

    const result = await getStream(`https://raec25-image-to-drawing-sketch.hf.space/gradio_api/queue/data?session_hash=${sessionHash}`);
    return result;
}

module.exports = async (sock, chatId, msg, args) => {
    let q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
    let mime = (q.imageMessage || q.documentWithCaptionMessage?.message?.imageMessage)?.mimetype || "";

    // Check if the message itself is an image
    if (!mime.startsWith("image/") && msg.message?.imageMessage) {
        q = msg.message;
        mime = msg.message.imageMessage.mimetype;
    }

    if (!mime.startsWith("image/")) {
        return await sock.sendMessage(chatId, {
            text: `⚠️ *يرجى الرد على صورة لتحويلها لرسم بقلم الرصاص*`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, { text: "⏳ جاري تحويل الصورة لرسم..." }, { quoted: msg });

    try {
        const quotedMsg = { message: q };
        const buffer = await downloadMediaMessage(
            quotedMsg,
            "buffer",
            {},
            { logger: pino({ level: "silent" }) },
        );

        const imageUrl = await uploadToCatbox(buffer);
        if (!imageUrl) throw new Error("فشل رفع الصورة");

        const sketchUrl = await imageToSketch(imageUrl);
        if (!sketchUrl) throw new Error("فشل التحويل");

        await sock.sendMessage(chatId, { delete: waitMsg.key });
        await sock.sendMessage(chatId, {
            image: { url: sketchUrl },
            caption: `✏️ *تم تحويل الصورة لرسم بنجاح!*\n\n*🚀 Hamza Amirni Bot*`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✨", key: msg.key } });

    } catch (e) {
        console.error("Sketch Error:", e);
        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: "❌ فشلت العملية. يرجى المحاولة لاحقاً."
        });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
