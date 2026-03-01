/**
 * commands/islamic/salat.js
 * 🕌 أمر تذكير أوقات الصلاة
 * 
 * للجميع:
 *  .salat           - عرض القائمة والأوقات
 *  .salat on        - تفعيل التذكير (واتساب فقط)
 *  .salat off       - إيقاف التذكير (واتساب فقط)
 *  .salat now       - أوقات الصلاة الآن
 * 
 * للمالك فقط:
 *  .salat city [مدينة] [بلد]   - تغيير المدينة الافتراضية
 *  .salat enable / .salat disable - تفعيل/تعطيل النظام كله
 *  .salat status    - عرض الحالة الكاملة
 */

const config = require('../../config');
const {
    getPrayerState,
    setPrayerEnabled,
    setPrayerCity,
    fetchPrayerTimes,
    subscribeWaUser,
    unsubscribeWaUser,
    isWaSubscribed,
    readWaSubs,
    getWaUserCity,
    PRAYER_NAMES,
    PRAYER_EMOJIS
} = require('../../lib/prayerScheduler');

function isOwner(sender) {
    const num = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    return config.ownerNumber.some(o => o.replace(/[^0-9]/g, '') === num);
}

module.exports = async (sock, chatId, msg, args) => {
    const sender = msg.key?.remoteJid || chatId;
    const sub = (args[0] || '').toLowerCase();
    const userCity = getWaUserCity(sender);

    // ─── .salat on — subscribe this WA user ─────────────────────────────────
    if (sub === 'on' || sub === 'تفعيل' || sub === 'اشتراك') {
        const count = subscribeWaUser(sender, userCity);
        const state = getPrayerState();
        return sock.sendMessage(chatId, {
            text:
                `✅ *تم تفعيل تذكير أوقات الصلاة!* 🕌\n\n` +
                `📍 *مدينتك الحالية:* ${userCity}\n\n` +
                `سيتم إرسال تذكير تلقائي عند كل وقت صلاة.\n\n` +
                `🌍 لتغيير المدينة: *.salat [اسم المدينة]*\n` +
                `📲 لإيقاف التذكير: *.salat off*\n` +
                `📅 لعرض الأوقات: *.salat now*\n\n` +
                `⚔️ _${config.botName}_`
        }, { quoted: msg });
    }

    // ─── .salat off — unsubscribe this WA user ──────────────────────────────
    if (sub === 'off' || sub === 'تعطيل' || sub === 'إلغاء') {
        unsubscribeWaUser(sender);
        return sock.sendMessage(chatId, {
            text:
                `🔕 *تم إلغاء الاشتراك في تذكير الصلاة.*\n\n` +
                `يمكنك إعادة التفعيل في أي وقت بـ *.salat on*\n\n` +
                `⚔️ _${config.botName}_`
        }, { quoted: msg });
    }

    // ─── .salat now — show individual prayer times ──────────────────────────
    if (sub === 'now' || sub === 'اليوم' || sub === 'وقت' || sub === 'أوقات') {
        const timings = await fetchPrayerTimes(userCity, 'MA');
        if (!timings) {
            return sock.sendMessage(chatId, {
                text: `❌ فشل جلب أوقات الصلاة لـ *${userCity}*. حاول مجدداً.`
            }, { quoted: msg });
        }

        const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
        const subscribed = isWaSubscribed(sender);
        let table = `🕌 *أوقات الصلاة - ${userCity}* 🕌\n`;
        table += `━━━━━━━━━━━━━━━━━━\n`;
        for (const p of prayers) {
            const emoji = PRAYER_EMOJIS[p] || '🕌';
            const nameAr = PRAYER_NAMES[p]?.ar || p;
            const time = timings[p]?.substring(0, 5) || '--:--';
            table += `${emoji} *${nameAr}*: ${time}\n`;
        }
        table += `━━━━━━━━━━━━━━━━━━\n`;
        table += subscribed
            ? `🟢 *أنت مشترك في التذكير التلقائي لـ ${userCity}*\n📲 لإيقافه: *.salat off*\n`
            : `🔴 *لم تشترك بعد في التذكير التلقائي*\n📲 للتفعيل: *.salat on*\n`;
        table += `\n🌍 لتغيير مدينتك: *.salat [اسم المدينة]*\n`;
        table += `⚔️ _${config.botName}_`;

        return sock.sendMessage(chatId, { text: table }, { quoted: msg });
    }

    // ─── .salat [city name] — Change city for THIS user ──────────────────────────
    if (sub && !['on', 'off', 'now', 'enable', 'disable', 'status', 'city', 'مدينة'].includes(sub)) {
        const city = args.join(' ').trim();
        await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

        const timings = await fetchPrayerTimes(city, 'MA');
        if (!timings) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return sock.sendMessage(chatId, { text: `❌ فشل العثور على مدينة باسم *${city}* في المغرب. تأكد من الاسم بالإنجليزية.` }, { quoted: msg });
        }

        // Update user preference (and subscribe them if they weren't)
        subscribeWaUser(sender, city, 'MA');
        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

        const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
        let table = `✅ *تم ضبط مدينتك بنجاح!* 🌍\n📍 *المدينة:* ${city}\n\n🕌 *أوقات الصلاة الحالية هناك:* \n━━━━━━━━━━━━━━━━━━\n`;
        for (const p of prayers) {
            table += `${PRAYER_EMOJIS[p]} *${PRAYER_NAMES[p]?.ar || p}*: ${timings[p]?.substring(0, 5) || '--:--'}\n`;
        }
        table += `━━━━━━━━━━━━━━━━━━\n� ستصلك التذكيرات الآن بناءً على توقيت *${city}*.\n\n⚔️ _${config.botName}_`;
        return sock.sendMessage(chatId, { text: table }, { quoted: msg });
    }

    // ─── OWNER ONLY commands ──────────────────────────────────────────────────
    if (isOwner(sender)) {

        // .salat enable / disable — turn entire system on/off
        if (sub === 'enable' || sub === 'شغل-الكل') {
            setPrayerEnabled(true);
            return sock.sendMessage(chatId, { text: `✅ نظام التذكير مُفعَّل للجميع.` }, { quoted: msg });
        }
        if (sub === 'disable' || sub === 'وقف-الكل') {
            setPrayerEnabled(false);
            return sock.sendMessage(chatId, { text: `🔴 نظام التذكير موقوف كلياً.` }, { quoted: msg });
        }

        // .salat status
        if (sub === 'status' || sub === 'حالة') {
            const state = getPrayerState();
            const waSubsCount = readWaSubs().length;
            let text = `🕌 *حالة نظام تذكير الصلاة* 🕌\n━━━━━━━━━━━━━━━━━━\n`;
            text += `🔘 *النظام:* ${state.enabled ? '🟢 مُفعَّل' : '🔴 موقوف'}\n`;
            text += `📍 *المدينة الافتراضية:* ${state.city}\n`;
            text += `📲 *واتساب مشتركون:* ${waSubsCount} مستخدم\n`;
            text += `⚠️ كل مستخدم يصله التذكير حسب مدينته الخاصة.\n`;
            text += `━━━━━━━━━━━━━━━━━━\n⚔️ _${config.botName}_`;
            return sock.sendMessage(chatId, { text }, { quoted: msg });
        }
        // The owner command for changing global city is removed as per the new user-specific city logic.
        // If it were still needed for other platforms, it would be handled here.
    }

    // ─── Default Help ─────────────────────────────────────────────────────
    const subscribed = isWaSubscribed(sender);
    const helpMsg =
        `🕌 *تذكير أوقات الصلاة الشخصي* 🕌\n━━━━━━━━━━━━━━━━━━\n\n` +
        `📍 *مدينتك الحالية:* ${userCity}\n` +
        `📲 *حالتك:* ${subscribed ? '🟢 مشترك' : '🔴 غير مشترك'}\n\n` +
        `✅ *الأوامر:*\n` +
        `  • *.salat [اسم المدينة]* — لتغيير مدينتك وتفعيل التذكير لها\n` +
        `  • *.salat on* — تفعيل التذكير لمدينتك الحالية\n` +
        `  • *.salat off* — إيقاف التذكير\n` +
        `  • *.salat now* — أوقات الصلاة في مدينتك\n\n` +
        `⚔️ _${config.botName}_`;

    return sock.sendMessage(chatId, { text: helpMsg }, { quoted: msg });
};
