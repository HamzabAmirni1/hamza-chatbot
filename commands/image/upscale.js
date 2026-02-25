const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const FormData = require('form-data');

class IllariaUpscaler {
    constructor() {
        this.api_url = 'https://thestinger-ilaria-upscaler.hf.space/gradio_api';
        this.file_url = 'https://thestinger-ilaria-upscaler.hf.space/gradio_api/file=';
    }

    generateSession() {
        return Math.random().toString(36).substring(2);
    }

    async upload(buffer) {
        const upload_id = this.generateSession();
        const orig_name = `hamza_${Date.now()}.jpg`;
        const form = new FormData();
        form.append('files', buffer, { filename: orig_name, contentType: 'image/jpeg' });
        const { data } = await axios.post(`${this.api_url}/upload?upload_id=${upload_id}`, form, {
            headers: form.getHeaders(),
            timeout: 30000,
        });
        return {
            orig_name,
            path: data[0],
            url: `${this.file_url}${data[0]}`,
        };
    }

    async process(buffer, options = {}) {
        const {
            model = 'RealESRGAN_x4plus',
            denoice_strength = 0.5,
            resolution = 4,
            fase_enhancement = true,
        } = options;

        const image_url = await this.upload(buffer);
        const session_hash = this.generateSession();

        await axios.post(`${this.api_url}/queue/join?`, {
            data: [
                {
                    path: image_url.path,
                    url: image_url.url,
                    orig_name: image_url.orig_name,
                    size: buffer.length,
                    mime_type: 'image/jpeg',
                    meta: { _type: 'gradio.FileData' },
                },
                model,
                denoice_strength,
                fase_enhancement,
                resolution,
            ],
            event_data: null,
            fn_index: 1,
            trigger_id: 20,
            session_hash,
        }, { timeout: 30000 });

        const { data } = await axios.get(`${this.api_url}/queue/data?session_hash=${session_hash}`, { timeout: 120000 });
        const lines = data.split('\n\n');
        for (const line of lines) {
            if (line.startsWith('data:')) {
                const d = JSON.parse(line.substring(6));
                if (d.msg === 'process_completed') return d.output.data[0].url;
            }
        }
        throw new Error('فشل الحصول على الصورة المحسنة');
    }
}

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    // Check for quoted image
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const directImg = msg.message?.imageMessage;

    const hasQuotedImg = quotedMsg?.imageMessage || quotedMsg?.documentWithCaptionMessage?.message?.imageMessage;

    if (!hasQuotedImg && !directImg) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║  🔍 *UPSCALER AI*  ║\n╚══════════════════╝\n\n📸 *الرجاء الرد على صورة*\n\n*الأمر:* .upscale\n\n✨ سيتم تحسين جودة الصورة 4x\n─────────────────────\n📸 instagram.com/hamza.amirni`,
        }, { quoted: msg });
    }

    const waitMsg = await sock.sendMessage(chatId, {
        text: `╔══════════════════╗\n║  🔍 *UPSCALER AI*  ║\n╚══════════════════╝\n\n⏳ *جاري تحسين الصورة...*\n🔄 يرجى الانتظار (30-60 ثانية)\n─────────────────────\n💡 يتم رفع الجودة إلى 4x`,
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

        const upscaler = new IllariaUpscaler();
        const resultUrl = await upscaler.process(buffer, {
            fase_enhancement: true,
            resolution: 4,
        });

        if (!resultUrl) throw new Error('فشل الحصول على رابط الصورة');

        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (e) { }

        await sock.sendMessage(chatId, {
            image: { url: resultUrl },
            caption: `╔══════════════════╗\n║  🔍 *UPSCALER AI*  ║\n╚══════════════════╝\n\n✅ *تم تحسين الصورة بنجاح!*\n📈 *الجودة:* 4x RealESRGAN\n\n*🚀 Powered by Hamza Amirni Bot*\n─────────────────────\n📸 instagram.com/hamza.amirni`,
            contextInfo: {
                externalAdReply: {
                    title: '🔍 Upscaler AI',
                    body: 'Hamza Amirni Bot',
                    thumbnailUrl: resultUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                },
            },
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error('Upscaler Error:', e.message);
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (err) { }
        await sock.sendMessage(chatId, {
            text: `❌ *فشلت العملية*\n\n${e.message}\n\nيرجى المحاولة لاحقاً.`,
        }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
