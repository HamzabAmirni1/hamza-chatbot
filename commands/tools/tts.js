/**
 * 🎙️ TEXT TO SPEECH (TTS)
 * Uses Google Translate TTS (free, no API key needed)
 * Usage: .tts النص | رمز_اللغة
 * Example: .tts مرحبا بك | ar
 */

const axios = require('axios');
const config = require('../../config');

// Supported languages
const VOICES = [
    { name: 'العربية',        lang: 'ar' },
    { name: 'English US',    lang: 'en' },
    { name: 'Français',      lang: 'fr' },
    { name: 'Español',       lang: 'es' },
    { name: 'Deutsch',       lang: 'de' },
    { name: 'Italiano',      lang: 'it' },
    { name: 'Português BR',  lang: 'pt' },
    { name: 'Русский',       lang: 'ru' },
    { name: 'Türkçe',        lang: 'tr' },
    { name: '日本語',          lang: 'ja' },
    { name: '한국어',          lang: 'ko' },
    { name: '中文',            lang: 'zh-CN' },
    { name: 'हिन्दी',          lang: 'hi' },
    { name: 'Bahasa',        lang: 'id' },
    { name: 'دارجة / Darija', lang: 'ar' },
];

function getVoice(val) {
    if (!val) return VOICES[0]; // Default: Arabic
    const lower = val.toLowerCase().trim();
    return (
        VOICES.find(v => v.lang.toLowerCase() === lower) ||
        VOICES.find(v => v.name.toLowerCase().includes(lower)) ||
        VOICES[0]
    );
}

/**
 * Google Translate TTS — free, no API key needed
 * Max ~200 chars per request; we chunk longer texts
 */
async function fetchGoogleTTS(text, lang) {
    const encoded = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${lang}&client=tw-ob&ttsspeed=0.9`;

    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                          'Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/',
        },
    });

    return Buffer.from(res.data);
}

/**
 * Split long text into chunks ≤ 200 chars at word boundaries
 */
function chunkText(text, maxLen = 190) {
    const words = text.split(' ');
    const chunks = [];
    let current = '';
    for (const word of words) {
        if ((current + ' ' + word).trim().length <= maxLen) {
            current = (current + ' ' + word).trim();
        } else {
            if (current) chunks.push(current);
            current = word;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

module.exports = async (sock, sender, msg, args) => {
    const fullText = args.join(' ');

    // Show help if no text
    if (!fullText) {
        const langList = VOICES.map((v, i) => `  ${i + 1}. ${v.name} → \`${v.lang}\``).join('\n');
        return await sock.sendMessage(sender, {
            text: `🎙️ *تحويل النص إلى صوت | TTS*\n\n` +
                  `📌 *الاستخدام:*\n` +
                  `*.tts النص | رمز_اللغة*\n\n` +
                  `📌 *أمثلة:*\n` +
                  `• .tts مرحبا بك في البوت\n` +
                  `• .tts Hello World | en\n` +
                  `• .tts Bonjour | fr\n` +
                  `• .tts مرحبا | ar\n\n` +
                  `🌍 *اللغات المتاحة:*\n${langList}\n\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });
    }

    // Parse: text | lang
    const parts = fullText.split('|');
    const textInput = parts[0].trim();
    const langInput = parts[1] ? parts[1].trim() : 'ar';

    if (!textInput) {
        return await sock.sendMessage(sender, {
            text: `❌ أدخل النص المراد تحويله.\nمثال: .tts مرحبا بك`
        }, { quoted: msg });
    }

    const voice = getVoice(langInput);

    try {
        await sock.sendMessage(sender, {
            text: `🎙️ *جاري تحويل النص إلى صوت...*\n🌍 اللغة: *${voice.name}*`
        }, { quoted: msg });

        // If text is short enough, fetch directly; otherwise chunk it
        let audioBuffer;
        if (textInput.length <= 190) {
            audioBuffer = await fetchGoogleTTS(textInput, voice.lang);
        } else {
            const chunks = chunkText(textInput);
            const buffers = [];
            for (const chunk of chunks) {
                const buf = await fetchGoogleTTS(chunk, voice.lang);
                buffers.push(buf);
            }
            audioBuffer = Buffer.concat(buffers);
        }

        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('لم يتم استقبال أي صوت.');
        }

        // Send as voice note (ptt)
        await sock.sendMessage(sender, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            ptt: true,
        }, { quoted: msg });

        await sock.sendMessage(sender, {
            text: `✅ *تم التحويل بنجاح*\n🌍 *${voice.name}*\n📝 "${textInput.slice(0, 60)}${textInput.length > 60 ? '...' : ''}"\n⚔️ ${config.botName}`
        });

    } catch (err) {
        console.error('[TTS Error]:', err.message);

        // Fallback error message
        await sock.sendMessage(sender, {
            text: `❌ *فشل تحويل النص إلى صوت*\n\nتحقق من:\n• صحة رمز اللغة (مثال: ar, en, fr)\n• عدم تجاوز النص الحد المسموح\n\n⚔️ ${config.botName}`
        }, { quoted: msg });
    }
};
