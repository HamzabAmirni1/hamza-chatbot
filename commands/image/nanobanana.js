const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const fs = require('fs-extra');

const publicKey = `-----BEGIN PUBLIC KEY----- MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwlO+boC6cwRo3UfXVBadaYwcX 0zKS2fuVNY2qZ0dgwb1NJ+/Q9FeAosL4ONiosD71on3PVYqRUlL5045mvH2K9i8b AFVMEip7E6RMK6tKAAif7xzZrXnP1GZ5Rijtqdgwh+YmzTo39cuBCsZqK9oEoeQ3 r/myG9S+9cR5huTuFQIDAQAB -----END PUBLIC KEY-----`;
const fp = crypto.randomUUID();
let cachethemeversi = null;
const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36', 'Accept': 'application/json, text/plain, */*', 'origin': 'https://aifaceswap.io', 'referer': 'https://aifaceswap.io/nano-banana-ai/' };

async function ambilthemeversi() {
    if (cachethemeversi) return cachethemeversi;
    try {
        const { data: html } = await axios.get('https://aifaceswap.io/nano-banana-ai/');
        const jsMatch = html.match(/src="([^"]*aifaceswap_nano_banana[^"]*\.js)"/);
        if (!jsMatch) throw new Error();
        let jsUrl = jsMatch[1].startsWith('http') ? jsMatch[1] : `https://aifaceswap.io${jsMatch[1]}`;
        const { data: jsText } = await axios.get(jsUrl);
        const themeMatch = jsText.match(/headers\["theme-version"\]="([^"]+)"/);
        cachethemeversi = themeMatch ? themeMatch[1] : 'EC25Co3HGfI91bGmpWR6JF0JKD+nZ/mD0OYvKNm5WUXcLfKnEE/80DQg60MXcYpM';
        return cachethemeversi;
    } catch (e) {
        return 'EC25Co3HGfI91bGmpWR6JF0JKD+nZ/mD0OYvKNm5WUXcLfKnEE/80DQg60MXcYpM';
    }
}

async function gensigs() {
    const themeVersion = await ambilthemeversi();
    const aesSecret = crypto.randomBytes(8).toString('hex');
    const xGuide = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(aesSecret, 'utf8')).toString('base64');
    const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(aesSecret), Buffer.from(aesSecret));
    let fp1 = cipher.update('aifaceswap:' + fp, 'utf8', 'base64');
    fp1 += cipher.final('base64');
    return { 'fp': fp, 'fp1': fp1, 'x-guide': xGuide, 'x-code': Date.now().toString(), 'theme-version': themeVersion };
}

async function upimage(imgBuffer, ext = 'jpg') {
    const filename = crypto.randomUUID().replace(/-/g, '') + '.' + ext;
    const sigs = await gensigs();
    const res = await axios.post('https://aifaceswap.io/api/upload_file', {
        file_name: filename, type: 'image', request_from: 1, origin_from: '4b06e7fa483b761a'
    }, { headers: { ...headers, ...sigs } });
    const data = res.data;
    const putUrl = data.data.url;
    await axios.put(putUrl, imgBuffer, { headers: { 'Content-Type': `image/${ext}`, 'x-oss-storage-class': 'Standard' } });
    return putUrl.split('?')[0].split('.aliyuncs.com/')[1];
}

async function createJob(imgurl, prompt) {
    const sigs = await gensigs();
    const res = await axios.post('https://aifaceswap.io/api/aikit/create', {
        fn_name: 'demo-nano-banana', call_type: 1, input: { prompt, scene: 'standard', resolution: '1K', aspect_ratio: 'auto', source_images: [imgurl] }, consume_type: 0, request_from: 1, origin_from: '4b06e7fa483b761a'
    }, { headers: { ...headers, ...sigs } });
    return res.data.data.task_id;
}

async function cekjob(jobId) {
    const sigs = await gensigs();
    const res = await axios.post('https://aifaceswap.io/api/aikit/check_status', {
        task_id: jobId, fn_name: 'demo-nano-banana', call_type: 1, request_from: 1, origin_from: '4b06e7fa483b761a'
    }, { headers: { ...headers, ...sigs } });
    return res.data.data;
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    let prompt = args.join(" ") || "enhance the background";
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.imageMessage;

    if (!quoted && !msg.message?.imageMessage) {
        return await sock.sendMessage(chatId, { text: "🍌 *Nano Banana AI*\n\nEx: Reply to an image + .nanobanana change to beach" }, { quoted: msg });
    }

    try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const media = msg.message?.imageMessage ? msg : { message: quoted };
        const imgBuffer = await downloadMediaMessage(media, 'buffer', {}, { logger: { level: 'silent' } });
        const mime = msg.message?.imageMessage?.mimetype || quoted?.imageMessage?.mimetype || 'image/jpeg';
        const ext = mime.split('/')[1] || 'jpg';

        await sock.sendMessage(chatId, { text: "⏳ *Processing with Nano Banana...*" }, { quoted: msg });

        const uploadUrl = await upimage(imgBuffer, ext);
        const jobId = await createJob(uploadUrl, prompt);
        let result;
        do {
            await new Promise(r => setTimeout(r, 3000));
            result = await cekjob(jobId);
        } while (result && (result.status === 0 || result.status === 1));

        if (result?.result_image) {
            const resImg = await axios.get(result.result_image, { responseType: 'arraybuffer' });
            await sock.sendMessage(chatId, { image: Buffer.from(resImg.data), caption: `🍌 *Success!*\n📝 *Prompt:* ${prompt}` }, { quoted: msg });
        } else throw new Error("Processing failed");

    } catch (err) {
        await sock.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    }
};
