const axios = require('axios');
const { sendWithChannelButton } = require('../lib/utils');
const config = require('../../config');

function getWeatherEmoji(weather) {
    if (!weather) return "🌡️";
    const w = weather.toLowerCase();
    if (w.includes("clear") || w.includes("sunny")) return "☀️";
    if (w.includes("cloud")) return "☁️";
    if (w.includes("rain")) return "🌧️";
    if (w.includes("thunder")) return "⛈️";
    if (w.includes("snow")) return "❄️";
    if (w.includes("mist") || w.includes("fog")) return "🌫️";
    return "🌡️";
}

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const city = args.join(' ').trim();
    if (!city) {
        return await sendWithChannelButton(
            sock,
            chatId,
            `🌍 *حالة الطقس (Weather)*\n\n📝 *الطريقة:* .weather [اسم المدينة]\n*مثال:* .weather Casablanca\n\n⚔️ ${config.botName}`,
            msg,
        );
    }

    await sock.sendMessage(chatId, {
        react: { text: "🌡️", key: msg.key },
    });

    try {
        let weatherData = null;

        // Try Siputzx API
        try {
            const res = await axios.get(`https://api.siputzx.my.id/api/weather?city=${encodeURIComponent(city)}`);
            if (res.data?.status && res.data.data) weatherData = res.data.data;
        } catch (e) { }

        // Try Vreden Fallback
        if (!weatherData) {
            try {
                const res = await axios.get(`https://api.vreden.my.id/api/weather?city=${encodeURIComponent(city)}`);
                if (res.data?.status && res.data.result) weatherData = res.data.result;
            } catch (e) { }
        }

        if (!weatherData) {
            return await sendWithChannelButton(
                sock,
                chatId,
                `❌ ما لقيتش معلومات على المدينة: *${city}* أو السيرفر متوقف حالياً.`,
                msg,
            );
        }

        const d = weatherData;
        const emoji = getWeatherEmoji(d.weather || d.condition);
        const weatherText =
            `🌍 *حالة الطقس في ${d.location || d.city}, ${d.country || ''}*\n\n` +
            `🌡️ *درجة الحرارة:* ${d.temperature || d.temp}°C\n` +
            `🤔 *كتحس بـ:* ${d.feels_like || d.feelslike || d.temp}°C\n` +
            `${emoji} *الحالة:* ${d.description || d.weather || d.condition}\n` +
            `💧 *الرطوبة:* ${d.humidity}%\n` +
            `💨 *سرعة الرياح:* ${d.wind_speed || d.wind} m/s\n\n` +
            `🕒 *الوقت:* ${new Date().toLocaleTimeString("ar-MA")}\n` +
            `⚔️ ${config.botName}`;

        await sendWithChannelButton(sock, chatId, weatherText, msg);
    } catch (e) {
        console.error("Weather Error:", e.message);
        await sendWithChannelButton(
            sock,
            chatId,
            `❌ وقع مشكل فجلب حالة الطقس. جرب من بعد.`,
            msg,
        );
    }
};
