/**
 * 🍌 Nano-Banana AI Multi-Engine (نظام نانو بنانا لتوليد وتعديل ودمج الصور)
 * المطور: حمزة اعمرني (Hamza Amirni)
 *
 * 🛠️ الميزات:
 * 1. .nano <الوصف> : توليد ورسم صور جديدة بالذكاء الاصطناعي
 * 2. الرد على صورة بـ .nano <التعديل> : تعديل الصورة بالذكاء الاصطناعي
 * 3. .nanopro : وضع تجميع الصور (حتى 4 صور)
 * 4. .nanopro done <الوصف> : دمج جميع الصور المجمعة باحترافية
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { uploadToBestProvider } = require('../../lib/media');

// In-memory collector session for NanoPro multi-image blending
const bananaSession = {};

async function uploadImageBuffer(buffer) {
    if (!buffer) return null;
    try {
        // Method 1: tmp.malvryx.dev
        const form = new FormData();
        form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
        form.append('type', 'permanent');
        const res = await axios.post('https://tmp.malvryx.dev/upload', form, {
            headers: form.getHeaders(),
            timeout: 15000
        });
        const cdnUrl = res.data?.cdnUrl || res.data?.directUrl;
        if (cdnUrl) return cdnUrl;
    } catch (_) {}

    // Method 2: uploadToBestProvider fallback
    try {
        const fallbackUrl = await uploadToBestProvider(buffer);
        if (fallbackUrl) return fallbackUrl;
    } catch (_) {}

    return null;
}

function getGuideMessage(usedPrefix = '.') {
    return `🍌 *الذكاء الاصطناعي نانو بنانا (Nano-Banana AI)*
━━━━━━━━━━━━━━━━━━━━

_توليد ورسم الصور وتعديلها بالذكاء الاصطناعي، مع إمكانية دمج حتى 4 صور معاً باحترافية!_ 🎨

📌 *طريقة الاستعمال:*

← *${usedPrefix}nano <الوصف>*
رسم وتوليد صورة جديدة بالذكاء الاصطناعي من النص

← *رد على أي صورة بـ ${usedPrefix}nano <التعديل>*
تعديل وتحويل ديك الصورة بالذكاء الاصطناعي

← *${usedPrefix}nanopro*
تفعيل وضع التجميع (صيفط الصور وحدة بوحدة حتى لـ 4)

← *${usedPrefix}nanopro done <الوصف>*
دمج جميع الصور المجموعة مع الوصف ديالك

━━━━━━━━━━━━━━━━━━━━
💡 *أمثلة:*
• ${usedPrefix}nano قطة كترتدي نظارات شمسية فالفضاء 4k
• ${usedPrefix}nanopro done ادمج هاد الصور بأسلوب أنمي سينمائي

⚡ _bot amirni hamza • حمزة اعمرني_`;
}

module.exports = async (sock, chatId, msg, args, helpers = {}) => {
    const isTelegram = helpers && helpers.isTelegram;
    const isFacebook = helpers && helpers.isFacebook;
    const usedPrefix = helpers.prefix || '.';
    const command = (helpers.command || 'nano').toLowerCase();
    const sender = helpers.sender || chatId;

    let targetMsg = msg;
    let buffer = null;

    // ── 1. Extract Media Buffer (if quoted or attached) ──
    if (isTelegram) {
        try {
            buffer = await sock.downloadMedia(msg);
        } catch (_) {}
    } else if (!isFacebook) {
        // WhatsApp Baileys
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedInfo = msg.message.extendedTextMessage.contextInfo;
            targetMsg = {
                key: {
                    remoteJid: chatId,
                    id: quotedInfo.stanzaId,
                    participant: quotedInfo.participant
                },
                message: quotedInfo.quotedMessage
            };
        }

        const mime = targetMsg.message?.imageMessage?.mimetype || 
                     targetMsg.message?.documentWithCaptionMessage?.message?.imageMessage?.mimetype || "";

        if (mime.startsWith("image/")) {
            try {
                buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, {
                    logger: undefined,
                    reuploadRequest: sock.updateMediaMessage
                });
            } catch (_) {}
        }
    }

    const text = args.join(' ').trim();
    const isNanoPro = command.includes('nanopro');

    // ── 2. Handle NanoPro Collector Mode (.nanopro / .nanopro done) ──
    if (isNanoPro) {
        if (!bananaSession[sender]) bananaSession[sender] = { images: [] };

        if (text.toLowerCase().startsWith('done')) {
            const session = bananaSession[sender];
            const finalPrompt = text.replace(/^done\s*/i, '').trim();

            if (session.images.length < 2) {
                return await sock.sendMessage(chatId, {
                    text: `⚠️ *نانو بنانا برو (NanoPro)*\n\nخاصك تصيفط صورتين على الأقل قبل إتمام عملية الدمج.\nاستخدم: *${usedPrefix}nanopro* لإرسال الصور أولاً.`
                }, { quoted: msg });
            }

            if (!finalPrompt) {
                return await sock.sendMessage(chatId, {
                    text: `⚠️ *الوصف مطلوب*\n\nيرجى كتابة طريقة الدمج المطلوبة، مثال:\n*${usedPrefix}nanopro done ادمج هذه الصور بأسلوب سينمائي أنمي*`
                }, { quoted: msg });
            }

            try { await sock.sendMessage(chatId, { react: { text: "🕒", key: msg.key } }); } catch (_) {}
            const waitMsg = await sock.sendMessage(chatId, { text: "🍌 جاري دمج الصور المجمعة بواسطة نانو بنانا برو... يرجى الانتظار." }, { quoted: msg });

            try {
                let apiUrl = `https://omegatech-api.dixonomega.tech/api/ai/nanobana-pro-v3?prompt=${encodeURIComponent(finalPrompt)}`;
                session.images.forEach((url, i) => {
                    apiUrl += `&image${i + 1}=${encodeURIComponent(url)}`;
                });

                const { data: initRes } = await axios.get(apiUrl, { timeout: 20000 });
                if (!initRes?.success) throw new Error('فشل بدء عملية الدمج في السيرفر.');

                const taskId = initRes.task_id;
                let resultUrl = null;
                let attempts = 0;

                while (!resultUrl && attempts < 25) {
                    await new Promise(r => setTimeout(r, 4000));
                    const { data: check } = await axios.get(`https://omegatech-api.dixonomega.tech/api/ai/nano-banana2-result?task_id=${taskId}`, { timeout: 15000 });
                    if (check?.status === 'completed' && check.image_url) {
                        resultUrl = check.image_url;
                        break;
                    }
                    if (check?.status === 'failed') throw new Error('أبلغ السيرفر عن فشل الدمج.');
                    attempts++;
                }

                if (!resultUrl) throw new Error('استغرق الأمر وقتاً طويلاً.');

                const caption = `🍌 *تم دمج الصور بنجاح (Nano-Banana Pro)*\n━━━━━━━━━━━━━━━━━━━━\n🖼️ *عدد الصور المدمجة:* ${session.images.length}\n📝 *الوصف:* ${finalPrompt}\n⚡ *bot amirni hamza • حمزة اعمرني*`;

                const imgRes = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 });
                const finalBuffer = Buffer.from(imgRes.data, 'binary');

                try { if (waitMsg) await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (_) {}

                await sock.sendMessage(chatId, {
                    image: finalBuffer,
                    caption
                }, { quoted: msg });

                try { await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } }); } catch (_) {}
                delete bananaSession[sender];
            } catch (e) {
                try { if (waitMsg) await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (_) {}
                try { await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } }); } catch (_) {}
                await sock.sendMessage(chatId, {
                    text: `❌ *فشل دمج الصور:* ${e.message}`
                }, { quoted: msg });
                delete bananaSession[sender];
            }
            return;
        }

        // Upload and collect image for NanoPro
        if (!buffer) {
            return await sock.sendMessage(chatId, { text: getGuideMessage(usedPrefix) }, { quoted: msg });
        }

        const uploadedUrl = await uploadImageBuffer(buffer);
        if (!uploadedUrl) {
            return await sock.sendMessage(chatId, { text: "❌ تعذر رفع الصورة للسيرفر. يرجى المحاولة لاحقاً." }, { quoted: msg });
        }

        if (bananaSession[sender].images.length >= 4) {
            return await sock.sendMessage(chatId, {
                text: `❌ *تم الوصول للحد الأقصى*\n\nالحد الأقصى هو 4 صور فقط.\nاكتب الآن:\n*${usedPrefix}nanopro done <الوصف>*`
            }, { quoted: msg });
        }

        bananaSession[sender].images.push(uploadedUrl);
        try { await sock.sendMessage(chatId, { react: { text: "📥", key: msg.key } }); } catch (_) {}

        return await sock.sendMessage(chatId, {
            text: `✅ *تمت إضافة الصورة (${bananaSession[sender].images.length}/4)*\n\nأرسل صورة أخرى مع *${usedPrefix}nanopro* أو اكتب:\n*${usedPrefix}nanopro done <الوصف>*`
        }, { quoted: msg });
    }

    // ── 3. Handle Standard Nano (.nano) ──
    if (!text && !buffer) {
        return await sock.sendMessage(chatId, { text: getGuideMessage(usedPrefix) }, { quoted: msg });
    }

    // Case A: Image-to-Image Editing (replying to photo)
    if (buffer) {
        if (!text) {
            return await sock.sendMessage(chatId, {
                text: `⚠️ *يرجى كتابة التعديل المطلوب*\n\nمثال: قم بالرد على الصورة بـ:\n*${usedPrefix}nano حول الملابس إلى بدلة أنيقة*`
            }, { quoted: msg });
        }

        try { await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } }); } catch (_) {}
        const waitMsg = await sock.sendMessage(chatId, { text: "🍌 جاري تعديل صورتك بذكاء نانو بنانا... يرجى الانتظار." }, { quoted: msg });

        try {
            const imageUrl = await uploadImageBuffer(buffer);
            if (!imageUrl) throw new Error("تعذر رفع الصورة");

            const { data: init } = await axios.get(
                `https://omegatech-api.dixonomega.tech/api/ai/nano-banana2?prompt=${encodeURIComponent(text)}&image=${encodeURIComponent(imageUrl)}`,
                { timeout: 20000 }
            );

            let resultUrl = null;
            if (init?.task_id) {
                for (let i = 0; i < 20; i++) {
                    await new Promise(r => setTimeout(r, 4000));
                    const { data: check } = await axios.get(
                        `https://omegatech-api.dixonomega.tech/api/ai/nano-banana2-result?task_id=${init.task_id}`,
                        { timeout: 15000 }
                    );
                    if (check?.status === 'completed' && check.image_url) {
                        resultUrl = check.image_url;
                        break;
                    }
                }
            }

            if (!resultUrl) throw new Error("استغرق التعديل وقتاً طويلاً");

            const imgRes = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 30000 });
            const finalBuffer = Buffer.from(imgRes.data, 'binary');

            try { if (waitMsg) await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (_) {}

            const caption = `✨ *تم تعديل الصورة بنجاح (Nano AI)*\n━━━━━━━━━━━━━━━━━━━━\n📝 *الوصف:* ${text}\n⚡ *bot amirni hamza • حمزة اعمرني*`;

            await sock.sendMessage(chatId, {
                image: finalBuffer,
                caption
            }, { quoted: msg });

            try { await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } }); } catch (_) {}
        } catch (e) {
            try { if (waitMsg) await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (_) {}
            try { await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } }); } catch (_) {}
            await sock.sendMessage(chatId, {
                text: `❌ *فشل تعديل الصورة:* ${e.message}\nتأكد من وضوح الصورة وتفاصيل الوصف.`
            }, { quoted: msg });
        }
        return;
    }

    // Case B: Text-to-Image Generation (.nano <prompt>)
    try { await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } }); } catch (_) {}
    const waitMsg = await sock.sendMessage(chatId, { text: `🍌 جاري رسم وتوليد الصورة بذكاء نانو: *"${text}"*...` }, { quoted: msg });

    try {
        let finalImageUrl = null;

        // Method 1: Nano Banana Pro API
        try {
            const { data } = await axios.get(
                `https://omegatech-api.dixonomega.tech/api/ai/nano-banana-pro?prompt=${encodeURIComponent(text)}`,
                { timeout: 25000 }
            );
            if (data?.image) finalImageUrl = data.image;
        } catch (_) {}

        // Method 2: Pollinations HD fallback with random seed
        if (!finalImageUrl) {
            const seed = Math.floor(Math.random() * 999999);
            finalImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&seed=${seed}&nologo=true&enhance=true`;
        }

        const imgRes = await axios.get(finalImageUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const finalBuffer = Buffer.from(imgRes.data, 'binary');

        try { if (waitMsg) await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (_) {}

        const caption = `🍌 *تم توليد الصورة بنجاح (Nano AI)*\n━━━━━━━━━━━━━━━━━━━━\n📝 *الوصف:* ${text}\n⚡ *bot amirni hamza • حمزة اعمرني*`;

        await sock.sendMessage(chatId, {
            image: finalBuffer,
            caption
        }, { quoted: msg });

        try { await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } }); } catch (_) {}
    } catch (e) {
        try { if (waitMsg) await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (_) {}
        try { await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } }); } catch (_) {}
        await sock.sendMessage(chatId, {
            text: `❌ *فشل توليد الصورة:* ${e.message}`
        }, { quoted: msg });
    }
};

