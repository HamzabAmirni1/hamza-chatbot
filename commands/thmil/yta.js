const axios = require("axios");
const config = require("../../config");

const headers = {
  "accept": "*/*",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  "referer": "https://app.ytdown.to/id21/",
  "origin": "https://app.ytdown.to"
};

async function convert(url) {
  try {
    const { data } = await axios.post(
      "https://app.ytdown.to/proxy.php",
      new URLSearchParams({ url }).toString(),
      { headers, timeout: 20000 }
    );
    return data?.api?.status === "completed" ? data.api : null;
  } catch {
    return null;
  }
}

async function ytdownAudio(url) {
  try {
    const { data } = await axios.post(
      "https://app.ytdown.to/proxy.php",
      new URLSearchParams({ url }).toString(),
      { headers, timeout: 20000 }
    );

    if (data?.api?.status !== "ok") return { status: false };

    let bestAudio = null;
    let fallbackAudio = null;

    for (let item of data.api.mediaItems) {
      if (item.type !== "Audio") continue;

      const res = await convert(item.mediaUrl);
      if (!res) continue;

      const ext = res.fileName?.split(".").pop()?.toLowerCase();

      const obj = {
        url: res.fileUrl,
        size: res.fileSize,
        ext,
        mime: "audio/" + ext
      };

      if (ext === "mp3" && !bestAudio) bestAudio = obj;
      if (!fallbackAudio) fallbackAudio = obj;
    }

    return {
      status: true,
      title: data.api.title,
      channel: data.api.userInfo?.name,
      thumbnail: data.api.imagePreviewUrl,
      duration: data.api.mediaItems?.[0]?.mediaDuration,
      audio: bestAudio || fallbackAudio
    };

  } catch (e) {
    return { status: false, error: String(e) };
  }
}

const GUIDE = `
╔══════════════════════════════╗
║   🎵 YouTube Audio Downloader ║
╚══════════════════════════════╝

📌 *Command:* .yta

📖 *Usage:*
  .yta <YouTube URL>

💡 *Examples:*
  .yta https://youtu.be/xxxxx
  .yta https://www.youtube.com/watch?v=xxxxx
`.trim();

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
  if (!args[0]) {
    return await sock.sendMessage(chatId, { text: GUIDE }, { quoted: msg });
  }

  const url = args[0];

  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  if (!ytRegex.test(url)) {
    return await sock.sendMessage(chatId, { text: `❌ *Invalid URL!*\n\nPlease provide a valid YouTube link.` }, { quoted: msg });
  }

  if (!helpers?.isTelegram) {
    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
  }
  await sock.sendMessage(chatId, { text: `⏳ *Processing...*\nExtracting audio 🎵, please wait.` }, { quoted: msg });

  const result = await ytdownAudio(url);

  if (!result.status || !result.audio?.url) {
    return await sock.sendMessage(chatId, { text: `❌ *Download Failed!*\n\nCould not fetch the audio. The link may be restricted or invalid.` }, { quoted: msg });
  }

  const { title, channel, thumbnail, duration, audio } = result;

  const caption = [
    `🎵 *${title}*`,
    `👤 Channel: ${channel || "Unknown"}`,
    `⏱ Duration: ${duration || "N/A"}`,
    `🎧 Format: MP3`,
    `📦 Size: ${audio.size || "N/A"}`
  ].join("\n");

  try {
    // Note: To match multi-platform correctly we send the audio directly with picture in external ad reply or send photo then audio.
    // For universal compatibility, we send photo with caption then audio. Wait, audio can carry caption in WA but not neatly on all TG clients sometimes. Let's send Audio directly. Wait, WhatsApp audio messages can't have captions (needs document for caption or external ad reply).
    if (helpers?.isTelegram) {
      // Send photo then audio
      await sock.sendMessage(chatId, { image: { url: thumbnail }, caption: caption }, { quoted: msg });
      await sock.sendMessage(chatId, { audio: { url: audio.url }, mimetype: 'audio/mpeg', fileName: `${title}.mp3` }, { quoted: msg });
    } else {
        await sock.sendMessage(chatId, {
            document: { url: audio.url },
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
            caption: caption + `\n\n✅ *By: ${config.botName}*`
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
    }
  } catch (sendErr) {
    return await sock.sendMessage(chatId, { text: `⚠️ *Failed to send the audio file.*` }, { quoted: msg });
  }
};
