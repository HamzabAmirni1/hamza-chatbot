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
        const apiUrl = `https://apis.davidcyriltech.my.id/weather?city=${encodeURIComponent(city)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.data) {
            return await sendWithChannelButton(
                sock,
                chatId,
                `❌ ما لقيتش معلومات على المدينة: *${city}*`,
                msg,
            );
        }

        const d = data.data;
        const emoji = getWeatherEmoji(d.weather);
        const weatherText =
            `🌍 *حالة الطقس في ${d.location}, ${d.country}*\n\n` +
            `🌡️ *درجة الحرارة:* ${d.temperature}°C\n` +
            `🤔 *كتحس بـ:* ${d.feels_like}°C\n` +
            `${emoji} *الحالة:* ${d.description}\n` +
            `💧 *الرطوبة:* ${d.humidity}%\n` +
            `💨 *سرعة الرياح:* ${d.wind_speed} m/s\n` +
            `⏲️ *الضغط الجوي:* ${d.pressure} hPa\n\n` +
            `🕒 *الوقت:* ${new Date().toLocaleTimeString("ar-MA")}\n` +
            `⚔️ ${config.botName}`;

        await sendWithChannelButton(sock, chatId, weatherText, msg);
    } catch (e) {
        await sendWithChannelButton(
            sock,
            chatId,
            `❌ وقع مشكل فجلب حالة الطقس. جرب من بعد.`,
            msg,
        );
    }
};
