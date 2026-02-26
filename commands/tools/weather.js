const axios = require('axios');
const { sendWithChannelButton } = require('../lib/utils');
const config = require('../../config');

const WEATHER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
};

const conditionMap = {
    "Clear": "صافي ☀️", "Sunny": "مشمس ☀️", "Partly cloudy": "غائم جزئياً ⛅",
    "Cloudy": "غائم ☁️", "Overcast": "مغيم بزاف ☁️", "Mist": "ضباب خفيف 🌫️",
    "Patchy rain possible": "احتمال شتا 🌧️", "Thundery outbreaks possible": "رعد ⛈️",
    "Fog": "ضباب 🌫️", "Light rain": "شتا خفيفة 🌧️", "Moderate rain": "شتا متوسطة 🌧️",
    "Heavy rain": "شتا قوية 🌧️", "Thunderstorm": "عاصفة رعدية ⛈️",
    "Patchy light rain with thunder": "رعد وشتا ⛈️"
};

function translateCondition(condition) {
    if (!condition) return "غير معروف 🌡️";
    return conditionMap[condition] || condition;
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const city = args.join(' ').trim();
    const isTelegram = helpers && helpers.isTelegram;
    const isFacebook = helpers && helpers.isFacebook;

    if (!city) {
        const usageText = `🌍 *حالة الطقس (Weather)*\n\n📝 *الطريقة:* .weather [اسم المدينة]\n*مثال:* .weather Casablanca\n\n⚔️ ${config.botName}`;
        if (isTelegram || isFacebook) return await sock.sendMessage(chatId, { text: usageText }, { quoted: msg });
        return await sendWithChannelButton(sock, chatId, usageText, msg);
    }

    await sock.sendMessage(chatId, { react: { text: "🌡️", key: msg.key } });

    try {
        let d = null;
        console.log(`[Weather] Fetching for: ${city}`);

        try {
            const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
                headers: WEATHER_HEADERS,
                timeout: 15000
            });

            if (res.data?.current_condition?.[0]) {
                const cur = res.data.current_condition[0];
                const loc = res.data.nearest_area?.[0];
                d = {
                    location: loc?.areaName?.[0]?.value || city,
                    country: loc?.country?.[0]?.value || '',
                    temperature: cur.temp_C,
                    feels_like: cur.FeelsLikeC,
                    condition: cur.weatherDesc?.[0]?.value,
                    humidity: cur.humidity,
                    wind: cur.windspeedKmph
                };
            }
        } catch (e) {
            console.error(`[Weather] wttr.in failed: ${e.message}`);
        }

        if (!d) {
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/weather?city=${encodeURIComponent(city)}`, { timeout: 10000 });
                if (res.data?.status && res.data.data) {
                    const sd = res.data.data;
                    d = {
                        location: sd.location || sd.city,
                        country: sd.country || '',
                        temperature: sd.temperature || sd.temp,
                        feels_like: sd.feels_like || sd.feelslike || sd.temperature,
                        condition: sd.description || sd.weather,
                        humidity: sd.humidity,
                        wind: sd.wind_speed || sd.wind
                    };
                }
            } catch (e) { }
        }

        if (!d) {
            return await sock.sendMessage(chatId, {
                text: `❌ ما لقيتش معلومات على مدينة: *${city}*`
            }, { quoted: msg });
        }

        const conditionDesc = translateCondition(d.condition);
        const weatherText =
            `╔══════════════════════╗\n` +
            `🌍 *الطقس في ${d.location}*\n` +
            `╚══════════════════════╝\n\n` +
            `🌡️ *الحرارة:* ${d.temperature}°C\n` +
            `🤔 *كتتحس بـ:* ${d.feels_like}°C\n` +
            `☁️ *الحالة:* ${conditionDesc}\n` +
            `💧 *الرطوبة:* ${d.humidity}%\n` +
            `💨 *الرياح:* ${d.wind} km/h\n` +
            `📍 *البلد:* ${d.country}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🕒 *آخر تحديث:* ${new Date().toLocaleTimeString("ar-MA")}\n` +
            `⚔️ *${config.botName}*`;

        if (isTelegram || isFacebook) {
            await sock.sendMessage(chatId, { text: weatherText }, { quoted: msg });
        } else {
            await sendWithChannelButton(sock, chatId, weatherText, msg);
        }

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("[Weather] Error:", e.message);
        await sock.sendMessage(chatId, { text: `❌ وقع مشكل فجلب البيانات. جرب من بعد.` }, { quoted: msg });
    }
};
