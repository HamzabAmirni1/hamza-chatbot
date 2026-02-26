const axios = require('axios');
const { sendWithChannelButton } = require('../lib/utils');
const config = require('../../config');

/**
 * Weather condition translation to Arabic/Darija
 */
const conditionMap = {
    "Clear": "صافي ☀️",
    "Sunny": "مشمس ☀️",
    "Partly cloudy": "غائم جزئياً ⛅",
    "Cloudy": "غائم ☁️",
    "Overcast": "مغيم بزاف ☁️",
    "Mist": "ضباب خفيف 🌫️",
    "Patchy rain possible": "احتمال شتا خفيفة 🌧️",
    "Patchy snow possible": "احتمال ثلج خفيف ❄️",
    "Patchy sleeting possible": "احتمال تبروري 🌨️",
    "Patchy freezing drizzle possible": "احتمال رذاذ متجمد ❄️",
    "Thundery outbreaks possible": "احتمال عواصف رعدية ⛈️",
    "Blowing snow": "عواصف ثلجية ❄️",
    "Blizzard": "عاصفة ثلجية قوية 🌨️",
    "Fog": "ضباب كثيف 🌫️",
    "Freezing fog": "ضباب متجمد 🌫️",
    "Patchy light drizzle": "رذاذ خفيف 🌧️",
    "Light drizzle": "رذاذ 🌧️",
    "Freezing drizzle": "رذاذ متجمد ❄️",
    "Heavy freezing drizzle": "رذاذ متجمد قوي ❄️",
    "Patchy light rain": "شتا خفيفة 🌧️",
    "Light rain": "شتا خفيفة 🌧️",
    "Moderate rain at times": "شتا متوسطة مرة مرة 🌧️",
    "Moderate rain": "شتا متوسطة 🌧️",
    "Heavy rain at times": "شتا قوية مرة مرة 🌧️",
    "Heavy rain": "شتا قوية 🌧️",
    "Light freezing rain": "شتا متجمدة خفيفة ❄️",
    "Moderate or heavy freezing rain": "شتا متجمدة ❄️",
    "Light sleet": "تبروري خفيف 🌨️",
    "Moderate or heavy sleet": "تبروري 🌨️",
    "Patchy light snow": "ثلج خفيف ❄️",
    "Light snow": "ثلج خفيف ❄️",
    "Patchy moderate snow": "ثلج متوسط ❄️",
    "Moderate snow": "ثلج متوسط ❄️",
    "Patchy heavy snow": "ثلج كثيف ❄️",
    "Heavy snow": "ثلج كثيف ❄️",
    "Ice pellets": "تبروري صغير 🌨️",
    "Light rain shower": "زخات مطرية خفيفة 🌧️",
    "Moderate or heavy rain shower": "زخات مطرية 🌧️",
    "Torrential rain shower": "أمطار طوفانية 🌊",
    "Thunderstorm": "عاصفة رعدية ⛈️"
};

function translateCondition(condition) {
    if (!condition) return "غير معروف 🌡️";
    return conditionMap[condition] || condition;
}

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const city = args.join(' ').trim();
    if (!city) {
        return await sendWithChannelButton(
            sock,
            chatId,
            `🌍 *حالة الطقس (Weather)*\n\n📝 *الطريقة:* .weather [اسم المدينة]\n*مثال:* .weather Er-rachidia\n\n⚔️ ${config.botName}`,
            msg,
        );
    }

    await sock.sendMessage(chatId, { react: { text: "🌡️", key: msg.key } });

    try {
        let d = null;

        // Method 1: wttr.in (Global & Stable)
        try {
            const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 10000 });
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
                    wind: cur.windspeedKmph,
                    source: 'wttr.in'
                };
            }
        } catch (e) { }

        // Fallback: Siputzx
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
                        wind: sd.wind_speed || sd.wind,
                        source: 'Siputzx'
                    };
                }
            } catch (e) { }
        }

        if (!d) {
            return await sendWithChannelButton(
                sock,
                chatId,
                `❌ عذراً، لم أتمكن من العثور على معلومات لمدينة: *${city}*\nتأكد من كتابة الاسم بشكل صحيح (بالفرنسية أو الإنجليزية).`,
                msg,
            );
        }

        const conditionDesc = translateCondition(d.condition);

        const weatherText =
            `╔══════════════════════╗\n` +
            `🌍 *حالة الطقس في ${d.location}*\n` +
            `╚══════════════════════╝\n\n` +
            `🌡️ *الحرارة الحالية:* ${d.temperature}°C\n` +
            `🤔 *تحس كأنها:* ${d.feels_like}°C\n` +
            `☁️ *الحالة:* ${conditionDesc}\n` +
            `💧 *الرطوبة:* ${d.humidity}%\n` +
            `💨 *الرياح:* ${d.wind} km/h\n` +
            `📍 *البلد:* ${d.country}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🕒 *آخر تحديث:* ${new Date().toLocaleTimeString("ar-MA")}\n` +
            `⚔️ *${config.botName}*`;

        await sendWithChannelButton(sock, chatId, weatherText, msg);
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Weather Error:", e.message);
        await sendWithChannelButton(sock, chatId, `❌ حدث خطأ غير متوقع في جلب البيانات. حاول مجدداً لاحقاً.`, msg);
    }
};
