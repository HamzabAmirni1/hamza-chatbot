const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

async function uguuUpload(buffer) {
  const form = new FormData();
  form.append("files[]", buffer, { filename: "file.jpg", contentType: "image/jpeg" });

  try {
      const res = await axios.post("https://uguu.se/upload.php", form, {
          headers: {
              accept: "*/*",
              "accept-language": "en-US",
              referer: "https://uguu.se/",
              ...form.getHeaders()
          }
      });
      if (!res.data.success) return { success: false, error: res.data };
      const file = res.data.files[0];
      return { success: true, url: file.url, size: file.size };
  } catch (e) {
      return { success: false, error: e.message };
  }
}

async function jpghdScrape(imageUrl) {
  const fakeIP = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
  const baseHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'Origin': 'https://jpghd.com',
    'Referer': 'https://jpghd.com/en',
    'Cookie': 'jpghd_lng=en',
    'User-Agent': 'CT Android/1.1.0',
    'X-Forwarded-For': fakeIP,
    'X-Real-IP': fakeIP
  };

  try {
      const createRes = await axios.post('https://jpghd.com/api/task/', `conf=${JSON.stringify({
          filename: imageUrl.split('/').pop(),
          livephoto: "", color: "", scratch: "", style: "art", input: imageUrl
      })}`, { headers: baseHeaders });
      
      if (createRes.data.status !== 'ok') return { status: false, message: 'Failed to create task' };
      const tid = createRes.data.tid;

      for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const checkRes = await axios.get(`https://jpghd.com/api/task/${tid}`, { headers: baseHeaders });
          const data = checkRes.data[tid];
          if (data?.status === 'success') {
              return { status: true, result: data.output.jpghd, size: data.output.size };
          }
      }
      return { status: false, message: 'Timeout, task not finished' };
  } catch(e) {
      return { status: false, message: e.message };
  }
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
        return await sock.sendMessage(chatId, { text: " Reply to or send an image with command *.hdv3*" }, { quoted: msg });
    }

    if (!helpers?.isTelegram) await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
    await sock.sendMessage(chatId, { text: "⏳ Processing image HD V3..." }, { quoted: msg });

    try {
        const buffer = sock.downloadMediaMessage ? await sock.downloadMediaMessage(q) : await downloadMediaMessage(q, 'buffer', {}, { logger: pino({ level: 'silent' }) });
        
        const upload = await uguuUpload(buffer);
        if (!upload.success) throw new Error("Image upload failed");

        const result = await jpghdScrape(upload.url);
        if (!result.status) throw new Error(result.message);

        const size = formatSize(result.size);

        await sock.sendMessage(chatId, {
            image: { url: result.result },
            caption: `✨ *HD Image successfully created*\n\n📦 Size: ${size}`
        }, { quoted: msg });
        
        if (!helpers?.isTelegram) await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ Error: ${e.message || e}` }, { quoted: msg });
    }
};
