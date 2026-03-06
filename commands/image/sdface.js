/**
 * .sdface - Face Restoration using GFPGAN/CodeFormer
 * Inspired by AUTOMATIC1111 SD WebUI Extras Tab - Face Restoration
 * المطور: حمزة اعمرني (HAMZA AMIRNI)
 */

const axios = require('axios');
const FormData = require('form-data');
const config = require('../../config');

async function restoreFaceGFPGAN(imageBuffer) {
    const sessionHash = Math.random().toString(36).substring(2, 13);
    const SPACE = 'https://sczhou-codeformer.hf.space';

    const form = new FormData();
    form.append('files', imageBuffer, { filename: `hamza_face_${Date.now()}.jpg`, contentType: 'image/jpeg' });

    const uploadRes = await axios.post(`${SPACE}/gradio_api/upload?upload_id=${sessionHash}`, form, { headers: form.getHeaders(), timeout: 30000 });
    const filePath = uploadRes.data?.[0];
    if (!filePath) throw new Error('Upload failed');

    await axios.post(`${SPACE}/gradio_api/queue/join`, {
        data: [
            { path: filePath, url: `${SPACE}/gradio_api/file=${filePath}`, orig_name: 'image.jpg', size: imageBuffer.length, mime_type: 'image/jpeg', meta: { _type: 'gradio.FileData' } },
            true, true, 2, 0.5
        ],
        event_data: null, fn_index: 1, trigger_id: 7, session_hash: sessionHash
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

    return await new Promise((resolve, reject) => {
        const https = require('https');
        const url = new URL(`${SPACE}/gradio_api/queue/data?session_hash=${sessionHash}`);
        const req = https.get(url, (res) => {
            let buffer = '';
            const timeout = setTimeout(() => { req.destroy(); reject(new Error('Timeout')); }, 120000);
            res.on('data', chunk => {
                buffer += chunk.toString();
                const lines = buffer.split('\n\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.msg === 'process_completed') {
                                clearTimeout(timeout); req.destroy();
                                const output = data.output?.data?.[0];
                                if (output?.url) resolve(output.url); else reject(new Error('No output URL'));
                            } else if (data.msg === 'process_errored') {
                                clearTimeout(timeout); req.destroy();
                                reject(new Error(data.output?.error || 'Process failed'));
                            }
                        } catch (e) { }
                    }
                }
            });
            res.on('error', err => { clearTimeout(timeout); reject(err); });
        });
        req.on('error', reject);
    });
}

async function restoreFaceAlt(imageBuffer) {
    const CryptoJS = require('crypto-js');
    const AES_KEY = 'ai-enhancer-web__aes-key';
    const AES_IV = 'aienhancer-aesiv';

    const settingsData = CryptoJS.AES.encrypt(
        JSON.stringify({ prompt: 'restore face, sharp eyes, clear skin, high quality face, GFPGAN enhanced', size: '2K', aspect_ratio: 'match_input_image', output_format: 'jpeg', max_images: 1 }),
        CryptoJS.enc.Utf8.parse(AES_KEY),
        { iv: CryptoJS.enc.Utf8.parse(AES_IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    ).toString();

    const img = imageBuffer.toString('base64');
    const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10)', 'Content-Type': 'application/json', Origin: 'https://aienhancer.ai', Referer: 'https://aienhancer.ai/ai-image-editor' };

    const createRes = await axios.post('https://aienhancer.ai/api/v1/k/image-enhance/create', { model: 2, function: 'ai-image-editor', image: [`data:image/jpeg;base64,${img}`], settings: settingsData }, { headers });
    const id = createRes?.data?.data?.id;
    if (!id) throw new Error('No task ID');

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const r = await axios.post('https://aienhancer.ai/api/v1/k/image-enhance/result', { task_id: id }, { headers });
        const data = r?.data?.data;
        if (data?.status === 'success') return { url: data.output };
        if (data?.status === 'failed') throw new Error(data.error || 'Failed');
    }
    throw new Error('Timeout');
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers?.isTelegram;
    const isFacebook = helpers?.isFacebook;
    let imageBuffer = null;

    if (isTelegram || isFacebook) {
        imageBuffer = await sock.downloadMedia(msg);
        if (!imageBuffer && msg.reply_to_message) imageBuffer = await sock.downloadMedia(msg.reply_to_message);
    } else {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const pino = require('pino');
        let targetMsg = msg;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted?.imageMessage) targetMsg = { key: msg.message.extendedTextMessage.contextInfo, message: quoted };
        const mime = targetMsg.message?.imageMessage?.mimetype || msg.message?.imageMessage?.mimetype || '';
        if (mime.startsWith('image/')) {
            try { imageBuffer = await downloadMediaMessage(mime === msg.message?.imageMessage?.mimetype ? msg : targetMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) }); } catch (e) { }
        }
    }

    if (!imageBuffer) {
        return await sock.sendMessage(chatId, {
            text: `🪄 *Face Restore - GFPGAN/CodeFormer*\n━━━━━━━━━━━━━━━━━━━━━\n⚠️ *يرجى الرد على صورة تحتوي على وجه*\n\n✅ إصلاح الوجوه الضبابية\n✅ تحسين العيون والبشرة\n✅ رفع الجودة 2x\n✅ إزالة التشويه\n\n*مثل Extras Tab في AUTOMATIC1111!*`
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: '🪄', key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, {
        text: `🪄 *Face Restore (GFPGAN/CodeFormer)*\n━━━━━━━━━━━━━━━━━━━━━\n⏳ _جاري إصلاح الوجه..._\n\n🔧 CodeFormer + GFPGAN + RealESRGAN\n\n_يرجى الانتظار 30-60 ثانية_`
    }, { quoted: msg });

    try {
        let resultUrl = null, usedEngine = '';
        try {
            resultUrl = await restoreFaceGFPGAN(imageBuffer);
            usedEngine = 'CodeFormer (HF Space)';
        } catch (e) {
            console.log('[sdface] CodeFormer failed, trying AI Enhancer:', e.message);
            const altResult = await restoreFaceAlt(imageBuffer);
            resultUrl = altResult.url;
            usedEngine = 'AI Face Enhancer';
        }

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        const caption = `*✨ ───❪ GFPGAN Face Restore ❫─── ✨*\n\n✅ *تم إصلاح الوجه بنجاح!*\n\n🤖 *Engine:* ${usedEngine}\n📈 *Upscale:* 2x\n🔧 *Face Restoration:* CodeFormer/GFPGAN\n\n*⚔️ ${config.botName}*`;

        const imgRes = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 });
        await sock.sendMessage(chatId, {
            image: Buffer.from(imgRes.data, 'binary'), caption,
            contextInfo: { externalAdReply: { title: '🪄 Face Restore AI', body: 'GFPGAN + CodeFormer', thumbnailUrl: resultUrl, sourceUrl: config.instagram || 'https://instagram.com/hamza_amirni_01', mediaType: 1, renderLargerThumbnail: true } }
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('[sdface] Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, { text: `❌ *فشل إصلاح الوجه*\n\n⚠️ ${e.message}\n\n💡 تأكد أن الصورة تحتوي على وجه واضح` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
