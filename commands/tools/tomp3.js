const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const settings = require('../../config');

async function tomp3Command(sock, sender, msg, args, helpers) {
    // Determine the target message (direct or quoted)
    let targetMessage = msg;
    let isVideo = false;

    if (helpers?.isTelegram) {
        isVideo = !!(msg.video || msg.reply_to_message?.video);
        if (!msg.video && msg.reply_to_message?.video) {
            targetMessage = msg.reply_to_message;
        }
    } else {
        isVideo = !!msg.message?.videoMessage;
        if (!isVideo && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage) {
            const quotedInfo = msg.message.extendedTextMessage.contextInfo;
            targetMessage = {
                key: { remoteJid: sender, id: quotedInfo.stanzaId, participant: quotedInfo.participant },
                message: quotedInfo.quotedMessage
            };
            isVideo = true;
        }
    }

    if (!isVideo) {
        return await sock.sendMessage(sender, { text: "❌ يرجى الرد على فيديو بـ *.tomp3* لتحويله إلى صوت." }, { quoted: msg });
    }

    try {
        await sock.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

        // Download video buffer
        const buffer = sock.downloadMediaMessage
            ? await sock.downloadMediaMessage(targetMessage)
            : await downloadMediaMessage(targetMessage, 'buffer', {}, {
                logger: undefined,
                reuploadRequest: sock.updateMediaMessage
            });

        if (!buffer) throw new Error("Failed to download video.");

        // Create temp folder
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const tempInput = path.join(tmpDir, `video_${Date.now()}.mp4`);
        const tempOutput = path.join(tmpDir, `audio_${Date.now()}.mp3`);

        fs.writeFileSync(tempInput, buffer);

        // Convert using ffmpeg
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -i "${tempInput}" -vn -ar 44100 -ac 2 -b:a 192k "${tempOutput}"`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Send audio
        await sock.sendMessage(sender, {
            audio: { url: tempOutput },
            mimetype: "audio/mpeg",
            ptt: false,
            fileName: `audio_${Date.now()}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: "تم تحويل الفيديو إلى صوت",
                    body: settings.botName,
                    mediaType: 2,
                    thumbnailUrl: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg"
                }
            }
        }, { quoted: msg });

        await sock.sendMessage(sender, { react: { text: "✅", key: msg.key } });

        // Cleanup
        [tempInput, tempOutput].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });

    } catch (err) {
        console.error("tomp3 error:", err);
        await sock.sendMessage(sender, { react: { text: "❌", key: msg.key } });
        await sock.sendMessage(sender, { text: "❌ فشل تحويل الفيديو إلى صوت. تأكد من ثثبيت ffmpeg وأن الفيديو ليس كبيراً جداً." }, { quoted: msg });
    }
}

module.exports = tomp3Command;
