const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const https = require('https');

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
                buffer = lines.pop();
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
            res.on('end', () => reject(new Error('انتهى البث بدون نتيجة')));
        }).on('error', reject);
    });
}

async function uploadToCatbox(imageBuffer) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('userhash', '');
    form.append('fileToUpload', imageBuffer, { filename: 'image.jpg' });
    const { data } = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: 30000,
    });
    return data;
}

async function imageToSketch(imageUrl) {
    const sessionHash = generateSessionHash();
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });

    const form = new FormData();
    form.append('files', Buffer.from(imageResponse.data), {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
    });

    const uploadRes = await axios.post(
        'https://raec25-image-to-drawing-sketch.hf.space/gradio_api/upload?upload_id=qcu1l42hpn',
        form,
        { headers: form.getHeaders(), timeout: 30000 }
    );

    const filePath = uploadRes.data[0];

    await axios.post(
        'https://raec25-image-to-drawing-sketch.hf.space/gradio_api/queue/join?__theme=system',
        {
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
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    );

    return await getStream(
        `https://raec25-image-to-drawing-sketch.hf.space/gradio_api/queue/data?session_hash=${sessionHash}`
    );
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const directImg = msg.message?.imageMessage;
    const hasQuotedImg = quotedMsg?.imageMessage || quotedMsg?.documentWithCaptionMessage?.message?.imageMessage;

    if (!hasQuotedImg && !directImg) {
        return await sock.sendMessage(chatId, {
            text: `╔════════════════════╗\n║  ✏️ *IMAGE TO SKETCH*  ║\n╚════════════════════╝\n\n📸 *الرجاء الرد على صورة*\n\n*الأمر:* .sketch2\n\n✨ سيتم تحويل الصورة إلى رسم رصاص احترافي!\n─────────────────────\n📸 instagram.com/hamza.amirni`,
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🎨', key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔════════════════════╗\n║  ✏️ *IMAGE TO SKETCH*  ║\n╚════════════════════╝\n\n⏳ *جاري التحويل...*\n📤 رفع الصورة...\n─────────────────────`,
    }, { quoted: msg });

    try {
        let targetMsg = msg;
        if (hasQuotedImg) {
            targetMsg = { message: quotedMsg, key: msg.message.extendedTextMessage.contextInfo };
        }

        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });

        await sock.sendMessage(chatId, { edit: waitMsg.key, text: `╔════════════════════╗\n║  ✏️ *IMAGE TO SKETCH*  ║\n╚════════════════════╝\n\n⏳ *جاري التحويل...*\n🔗 رفع إلى السيرفر...` });

        const imageUrl = await uploadToCatbox(buffer);
        const sketchUrl = await imageToSketch(imageUrl);

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            image: { url: sketchUrl },
            caption: `╔════════════════════╗\n║  ✏️ *IMAGE TO SKETCH*  ║\n╚════════════════════╝\n\n✅ *تم التحويل بنجاح!*\n🖊️ رسم رصاص احترافي\n\n*🚀 Hamza Amirni Bot*\n─────────────────────\n📸 instagram.com/hamza.amirni`,
            contextInfo: {
                externalAdReply: {
                    title: '✏️ Image to Sketch',
                    body: 'Hamza Amirni Bot',
                    thumbnailUrl: sketchUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            },
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Sketch2 Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشل التحويل*\n\n${e.message}\n\nيرجى المحاولة لاحقاً.`,
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
