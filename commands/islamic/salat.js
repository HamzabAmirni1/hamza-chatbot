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

    // ─── .salat on — subscribe this WA user ─────────────────────────────────
    if (sub === 'on' || sub === 'تفعيل' || sub === 'اشتراك') {
        const count = subscribeWaUser(sender);
        const state = getPrayerState();
        return sock.sendMessage(chatId, {
            text:
                `✅ *تم تفعيل تذكير أوقات الصلاة!* 🕌\n\n` +
                `📍 *المدينة:* ${state.city} (${state.country})\n` +
                `👥 *إجمالي المشتركين واتساب:* ${count}\n\n` +
                `سيتم إرسال تذكير تلقائي عند كل وقت صلاة.\n\n` +
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

    // ─── .salat now — show prayer times ─────────────────────────────────────
    if (sub === 'now' || sub === 'اليوم' || sub === 'وقت' || sub === 'أوقات') {
        const state = getPrayerState();
        const timings = await fetchPrayerTimes(state.city, state.country, state.method);
        if (!timings) {
            return sock.sendMessage(chatId, {
                text: `❌ فشل جلب أوقات الصلاة لـ *${state.city}*. حاول مجدداً.`
            }, { quoted: msg });
        }

        const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
        const subscribed = isWaSubscribed(sender);
        let table = `🕌 *أوقات الصلاة - ${state.city}* 🕌\n`;
        table += `━━━━━━━━━━━━━━━━━━\n`;
        for (const p of prayers) {
            const emoji = PRAYER_EMOJIS[p] || '🕌';
            const nameAr = PRAYER_NAMES[p]?.ar || p;
            const time = timings[p]?.substring(0, 5) || '--:--';
            table += `${emoji} *${nameAr}*: ${time}\n`;
        }
        table += `━━━━━━━━━━━━━━━━━━\n`;
        table += subscribed
            ? `🟢 *أنت مشترك في التذكير التلقائي*\n📲 لإيقافه: *.salat off*\n`
            : `🔴 *لم تشترك بعد في التذكير التلقائي*\n📲 للتفعيل: *.salat on*\n`;
        table += `\n⚔️ _${config.botName}_`;

        return sock.sendMessage(chatId, { text: table }, { quoted: msg });
    }

    // ─── OWNER ONLY commands ──────────────────────────────────────────────────
    if (isOwner(sender)) {

        // .salat enable / disable — turn entire system on/off
        if (sub === 'enable' || sub === 'شغل-الكل') {
            setPrayerEnabled(true);
            return sock.sendMessage(chatId, { text: `✅ نظام التذكير مُفعَّل للجميع (TG + FB تلقائي، WA باختيار المستخدم).` }, { quoted: msg });
        }
        if (sub === 'disable' || sub === 'وقف-الكل') {
            setPrayerEnabled(false);
            return sock.sendMessage(chatId, { text: `🔴 نظام التذكير موقوف كلياً.` }, { quoted: msg });
        }

        // .salat city [city] [country]
        if (sub === 'city' || sub === 'مدينة') {
            const city = args[1];
            const country = (args[2] || 'MA').toUpperCase();
            if (!city) {
                return sock.sendMessage(chatId, {
                    text: `❌ مثال: *.salat city Casablanca MA*\n*.salat city Paris FR*\n*.salat city Riyadh SA*`
                }, { quoted: msg });
            }
            setPrayerCity(city, country);
            const timings = await fetchPrayerTimes(city, country);
            if (!timings) {
                return sock.sendMessage(chatId, { text: `❌ فشل التحقق من المدينة *${city}*.` }, { quoted: msg });
            }

            const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
            let table = `✅ *تم تغيير المدينة: ${city} (${country})* 🌍\n\n🕌 *أوقات اليوم:*\n━━━━━━━━━━━━━━━━━━\n`;
            for (const p of prayers) {
                table += `${PRAYER_EMOJIS[p]} *${PRAYER_NAMES[p]?.ar || p}*: ${timings[p]?.substring(0, 5) || '--:--'}\n`;
            }
            table += `━━━━━━━━━━━━━━━━━━\n⚔️ _${config.botName}_`;
            return sock.sendMessage(chatId, { text: table }, { quoted: msg });
        }

        // .salat status
        if (sub === 'status' || sub === 'حالة') {
            const state = getPrayerState();
            const waSubs = readWaSubs();
            const timings = await fetchPrayerTimes(state.city, state.country, state.method);

            let text = `🕌 *حالة نظام تذكير الصلاة* 🕌\n━━━━━━━━━━━━━━━━━━\n`;
            text += `🔘 *النظام:* ${state.enabled ? '🟢 مُفعَّل' : '🔴 موقوف'}\n`;
            text += `📍 *المدينة:* ${state.city} (${state.country})\n`;
            text += `📲 *واتساب مشتركون:* ${waSubs.length} مستخدم\n`;
            text += `🤖 *تيليغرام:* تلقائي لجميع المستخدمين\n`;
            text += `📘 *فيسبوك:* تلقائي لجميع المستخدمين\n\n`;

            if (timings) {
                const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
                text += `📅 *أوقات الصلاة اليوم:*\n`;
                for (const p of prayers) {
                    text += `  ${PRAYER_EMOJIS[p]} ${PRAYER_NAMES[p]?.ar || p}: ${timings[p]?.substring(0, 5) || '--:--'}\n`;
                }
            }
            text += `\n━━━━━━━━━━━━━━━━━━\n`;
            text += `⚙️ *أوامر المالك:*\n`;
            text += `  • *.salat enable* — تشغيل الكل\n`;
            text += `  • *.salat disable* — إيقاف الكل\n`;
            text += `  • *.salat city [مدينة] [بلد]*\n`;
            text += `  • *.salat status*\n\n`;
            text += `⚔️ _${config.botName}_`;

            return sock.sendMessage(chatId, { text }, { quoted: msg });
        }
    }

    // ─── Default: Help + current status ────────────────────────────────────
    const state = getPrayerState();
    const subscribed = isWaSubscribed(sender);
    const helpMsg =
        `🕌 *تذكير أوقات الصلاة* 🕌\n━━━━━━━━━━━━━━━━━━\n\n` +
        `📍 *المدينة:* ${state.city}\n` +
        `📲 *حالتك:* ${subscribed ? '🟢 مشترك (ستصلك التذكيرات)' : '🔴 غير مشترك'}\n\n` +
        `✅ *الأوامر:*\n` +
        `  • *.salat on* — فعّل التذكير التلقائي\n` +
        `  • *.salat off* — أوقف التذكير\n` +
        `  • *.salat now* — أوقات الصلاة الآن\n\n` +
        `ℹ️ *مستخدمو تيليغرام وفيسبوك يستلمون التذكير تلقائياً.*\n\n` +
        `⚔️ _${config.botName}_`;

    return sock.sendMessage(chatId, { text: helpMsg }, { quoted: msg });
};
