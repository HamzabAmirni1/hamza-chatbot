const axios = require('axios');
const CryptoJS = require('crypto-js');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');

const AES_KEY = "ai-enhancer-web__aes-key";
const AES_IV = "aienhancer-aesiv";

function encryptSettings(settings) {
  const key = CryptoJS.enc.Utf8.parse(AES_KEY);
  const iv = CryptoJS.enc.Utf8.parse(AES_IV);
  return CryptoJS.AES.encrypt(
    JSON.stringify(settings),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  ).toString();
}

async function createTask(base64Image, promptText) {
  const settings = { aspect_ratio: "match_input_image", output_format: "jpg", prompt: promptText };
  const payload = { model: 2, image: [base64Image], function: 'ai-image-editor', settings: encryptSettings(settings) };
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10) Chrome/134.0.0',
    'Origin': 'https://aienhancer.ai',
    'Referer': 'https://aienhancer.ai/ai-image-editor',
    'Accept': '*/*','x-requested-with': 'mark.via.gp'
  };

  const res = await axios.post('https://aienhancer.ai/api/v1/r/image-enhance/create', payload, { headers, timeout: 30000 });
  if (res.data.code !== 100000) throw new Error(res.data.message);
  return res.data.data.id;
}

async function pollResult(taskId, interval = 3000, timeout = 90000) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10) Chrome/134.0.0',
    'Origin': 'https://aienhancer.ai',
    'Referer': 'https://aienhancer.ai/ai-image-editor',
    'x-requested-with': 'mark.via.gp'
  };

  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await axios.post('https://aienhancer.ai/api/v1/r/image-enhance/result', { task_id: taskId }, { headers });
    if (res.data.code !== 100000) throw new Error(res.data.message);
    const task = res.data.data;
    if (task.status === 'succeeded') return task.output;
    if (task.status === 'failed') throw new Error(task.error || 'Task failed');
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Timed out waiting for result');
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    let q = msg;
    let isImage = false;

    if (helpers?.isTelegram) {
        isImage = !!(msg.photo || msg.reply_to_message?.photo);
        if (!msg.photo && msg.reply_to_message?.photo) q = msg.reply_to_message;
    } else {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const directImg = msg.message?.imageMessage;
        const hasQuotedImg = quotedMsg?.imageMessage || quotedMsg?.documentWithCaptionMessage?.message?.imageMessage;
        if (hasQuotedImg) {
            q = { message: quotedMsg, key: msg.message.extendedTextMessage.contextInfo };
            isImage = true;
        } else if (directImg) {
            q = msg;
            isImage = true;
        }
    }

    if (!isImage) {
        return await sock.sendMessage(chatId, {
            text: `*🎨 AI Image Editor*\nEdit any image using AI with a text prompt.\n\n*How to use:*\nReply to an image with: \`.aiedit turn the background into a forest\``
        }, { quoted: msg });
    }

    const prompt = args.join(' ').trim();
    if (!prompt) {
        return await sock.sendMessage(chatId, { text: `⚠️ Please provide a prompt!\n\nExample: *.aiedit make it look like a painting*` }, { quoted: msg });
    }

    if (!helpers?.isTelegram) await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
    await sock.sendMessage(chatId, { text: `⏳ Processing your image...\n📝 Prompt: _${prompt}_` }, { quoted: msg });

    try {
        const imgBuffer = sock.downloadMediaMessage ? await sock.downloadMediaMessage(q) : await downloadMediaMessage(q, 'buffer', {}, { logger: pino({ level: 'silent' }) });
        const base64Image = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

        const taskId = await createTask(base64Image, prompt);
        const resultUrl = await pollResult(taskId);

        await sock.sendMessage(chatId, {
            image: { url: resultUrl },
            caption: `✅ *Done!*\n📝 Prompt: _${prompt}_`
        }, { quoted: msg });
        if (!helpers?.isTelegram) await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        await sock.sendMessage(chatId, { text: `❌ Failed to edit image.\n\nError: ${err.message}` }, { quoted: msg });
    }
};
