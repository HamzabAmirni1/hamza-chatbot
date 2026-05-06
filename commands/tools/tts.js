/**
 * 🎙️ TEXT TO SPEECH (TTS)
 * Adapted from silana-lite-ofc-master (tts.js)
 * Converts text to a voice note using Google Speech API
 * Usage: .tts النص | رمز_اللغة
 * Example: .tts مرحبا بك | ar
 */

const axios = require('axios');
const config = require('../../config');

// Supported languages (subset of most common ones)
const VOICES = [
    { name: 'Arabic', lang: 'ar' },
    { name: 'English US', lang: 'en_US' },
    { name: 'English UK', lang: 'en_GB' },
    { name: 'French', lang: 'fr_FR' },
    { name: 'Spanish', lang: 'es_ES' },
    { name: 'German', lang: 'de_DE' },
    { name: 'Italian', lang: 'it_IT' },
    { name: 'Russian', lang: 'ru_RU' },
    { name: 'Turkish', lang: 'tr_TR' },
    { name: 'Japanese', lang: 'ja_JP' },
    { name: 'Korean', lang: 'ko_KR' },
    { name: 'Chinese', lang: 'zh_CN_#Hans' },
    { name: 'Portuguese BR', lang: 'pt_BR' },
    { name: 'Hindi', lang: 'hi_IN' },
    { name: 'Indonesian', lang: 'id_ID' },
];

function getVoice(val) {
    if (!val) return VOICES[0]; // Default: Arabic
    const lower = val.toLowerCase().trim();
    return (
        VOICES.find(v => v.lang.toLowerCase() === lower) ||
        VOICES.find(v => v.name.toLowerCase() === lower) ||
        VOICES[0]
    );
}

async function generateTTS(text, lang = 'ar', speed = 1, pitch = 1) {
    const voice = getVoice(lang);
    const baseUrl = 'https://www.google.com/speech-api/v2/synthesize';
    const key = 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';

    const calcSpeed = speed <= 1 ? speed / 2 : 0.5 + (speed - 1) / 4 * 0.5;
    const calcPitch = Math.min(pitch / 2, 1);

    const params = {
        key,
        text: text.trim(),
        lang: voice.lang,
        enc: 'mpeg',
        client: 'chromium',
        speed: calcSpeed.toString(),
        pitch: calcPitch.toString(),
    };

    const res = await axios.get(baseUrl, {
        params,
        responseType: 'arraybuffer',
        timeout: 15000,
    });

    return Buffer.from(res.data);
}

module.exports = async (sock, sender, msg, args) => {
    const fullText = args.join(' ');

    // Show help if no text
    if (!fullText) {
        const langList = VOICES.map((v, i) => `  ${i}. ${v.name} → \`${v.lang}\``).join('\n');
        return await sock.sendMessage(sender, {
            text: `🎙️ *تحويل النص إلى صوت | TTS*\n\n` +
                  `📌 *الاستخدام:*\n` +
                  `*.tts النص | رمز_اللغة*\n\n` +
                  `📌 *أمثلة:*\n` +
                  `• .tts مرحبا بك في البوت\n` +
                  `• .tts Hello World | en_US\n` +
                  `• .tts Bonjour | fr_FR\n\n` +
                  `🌍 *اللغات المتاحة:*\n${langList}\n\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });
    }

    // Parse: text | lang | speed | pitch
    const parts = fullText.split('|');
    const textInput = parts[0].trim();
    const langInput = parts[1] ? parts[1].trim() : 'ar';
    const speedInput = parts[2] ? parseFloat(parts[2].trim()) : 1;
    const pitchInput = parts[3] ? parseFloat(parts[3].trim()) : 1;

    if (!textInput) {
        return await sock.sendMessage(sender, {
            text: `❌ أدخل النص المراد تحويله.\nمثال: .tts مرحبا بك`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(sender, { text: '🎙️ *جاري تحويل النص إلى صوت...*' }, { quoted: msg });

        const audioBuffer = await generateTTS(textInput, langInput, speedInput, pitchInput);

        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('لم يتم استقبال أي صوت.');
        }

        const voice = getVoice(langInput);
        await sock.sendMessage(sender, {
            audio: audioBuffer,
            mimetype: 'audio/mp4',
            ptt: true  // Send as voice note
        }, { quoted: msg });

        // Send a caption message
        await sock.sendMessage(sender, {
            text: `✅ *تم التحويل بنجاح*\n🌍 اللغة: *${voice.name}*\n📝 "${textInput.slice(0, 50)}${textInput.length > 50 ? '...' : ''}"\n⚔️ ${config.botName}`
        }, { quoted: msg });

    } catch (err) {
        console.error('[TTS Error]:', err.message);
        await sock.sendMessage(sender, {
            text: `❌ *فشل تحويل النص إلى صوت*\nتأكد من صحة رمز اللغة (مثال: ar, en_US, fr_FR)\n⚔️ ${config.botName}`
        }, { quoted: msg });
    }
};
