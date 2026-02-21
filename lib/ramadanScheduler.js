const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendWithChannelButton } = require('../commands/lib/utils');
const config = require('../config');

async function fetchRandomAyah() {
    try {
        const randomAyahNum = Math.floor(Math.random() * 6236) + 1;
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${randomAyahNum}/ar.alafasy`);
        if (response.data && response.data.status === 'OK') {
            return response.data.data;
        }
    } catch (e) {
        console.error('Error fetching random ayah:', e.message);
    }
    return null;
}

async function startRamadanScheduler(sock) {
    if (global.ramadanInterval) clearInterval(global.ramadanInterval);

    global.ramadanInterval = setInterval(async () => {
        const currentSock = global.sock || sock;
        if (!currentSock || !currentSock.user) return;

        const now = moment().tz('Africa/Casablanca');
        const ramadanStart = moment.tz("2026-02-18", "Africa/Casablanca");
        const ramadanEnd = moment.tz("2026-03-20", "Africa/Casablanca");

        // Only run if we are in Ramadan
        if (!now.isBetween(ramadanStart, ramadanEnd)) return;

        const currentHour = now.hour();
        const currentMinute = now.minutes();

        // 1. Send Suhur/Imsak Tip at 04:00
        if (currentHour === 4 && currentMinute === 0) {
            await sendDailyReminder(currentSock, "suhur");
        }

        // 2. Morning Dhikr & Quran Reminder at 08:00
        if (currentHour === 8 && currentMinute === 0) {
            await sendDailyReminder(currentSock, "morning_dhikr");
        }

        // 3. Dhuhr Mid-day Quran Reminder at 13:00
        if (currentHour === 13 && currentMinute === 0) {
            await sendDailyReminder(currentSock, "quran_midday");
        }

        // 4. Asr Pre-Iftar Dhikr/Dua at 16:30
        if (currentHour === 16 && currentMinute === 30) {
            await sendDailyReminder(currentSock, "asr_dhikr");
        }

        // 5. Send Iftar Dua at 18:30
        if (currentHour === 18 && currentMinute === 30) {
            await sendDailyReminder(currentSock, "iftar");
        }

        // 6. Post-Taraweeh Khatm Reminder at 21:00
        if (currentHour === 21 && currentMinute === 0) {
            await sendDailyReminder(currentSock, "khatm_update");
        }

    }, 60000);
    return global.ramadanInterval;
}

async function sendDailyReminder(sock, type) {
    const subsPath = path.join(__dirname, '../data/duas-subscribers.json');
    if (!fs.existsSync(subsPath)) return;

    const fileContent = fs.readFileSync(subsPath, 'utf-8');
    const data = JSON.parse(fileContent || '{"subscribers":[]}');
    if (!data.subscribers || data.subscribers.length === 0) return;

    const now = moment().tz('Africa/Casablanca');
    const ramadanStart = moment.tz("2026-02-18", "Africa/Casablanca");
    const day = now.diff(ramadanStart, 'days') + 1;

    let message = "";
    let ayahData = null;

    if (type === "quran_midday" || type === "khatm_update" || type === "morning_dhikr") {
        ayahData = await fetchRandomAyah();
    }

    if (type === "suhur") {
        message = `🌙 *تذكير السحور - اليوم ${day}* 🌙\n\n🥣 عن أنس رضي الله عنه قال: قال النبي ﷺ: «تَسَحَّرُوا فَإِنَّ فِي السَّحُورِ بَرَكَةً».\n\n💡 *نصيحة:* لا تنسَ عقد نية الصيام وشرب كمية كافية من الماء.\n\n⚔️ ${config.botName}`;
    } else if (type === "morning_dhikr") {
        message = `☀️ *أذكار الصباح وقراءة القرآن* ☀️\n\n`;
        if (ayahData) {
            message += `📖 *آية للتأمل:* ${ayahData.text}\n📍 [${ayahData.surah.name}:${ayahData.numberInSurah}]\n\n`;
        }
        message += `✨ تذكير يومي: لا تنسَ وردك من القرآن اليوم وأذكار الصباح لتحصين نفسك.\n\n⚔️ ${config.botName}`;
    } else if (type === "quran_midday") {
        message = `📖 *تذكير القرآن الكريم* 📖\n\n`;
        if (ayahData) {
            message += `✨ *من كلام الله:* ${ayahData.text}\n📍 [${ayahData.surah.name}:${ayahData.numberInSurah}]\n\n`;
        }
        message += `✨ مضى جزء من يومك، فهل تلوت فيه شيئاً من كتاب الله؟\n🕯️ اجعل القرآن ربيع قلبك في هذا الشهر الفضيل.\n\n⚔️ ${config.botName}`;
    } else if (type === "asr_dhikr") {
        message = `📿 *أذكار المساء واقتراب الإفطار* 📿\n\n✨ استعد لساعة الاستجابة! أذكار المساء والدعاء قبل الإفطار من أعظم القربات.\n🤲 «إن للصائم عند فطره لدعوة ما ترد».\n\n⚔️ ${config.botName}`;
    } else if (type === "iftar") {
        message = `🌙 *تذكير الإفطار - اليوم ${day}* 🌙\n\n🤲 *دعاء الإفطار:* ذهب الظمأ وابتلت العروق وثبت الأجر إن شاء الله.\n\n✨ *اللهم تقبل صيامكم وصالح أعمالكم.*\n\n⚔️ ${config.botName}`;
    } else if (type === "khatm_update") {
        try {
            const { loadKhatmData } = require('../commands/islamic/khatm');
            const khatmData = loadKhatmData();
            const completed = khatmData.parts.filter(p => p.status === 'completed').length;
            const reading = khatmData.parts.filter(p => p.status === 'reading').length;
            const nextPart = khatmData.parts.find(p => p.status === 'available');

            message = `📖 *تحديث ختمة القرآن الكريم* 📖\n\n`;
            if (ayahData) {
                message += `✨ *آية اليوم:* ${ayahData.text}\n📍 [${ayahData.surah.name}:${ayahData.numberInSurah}]\n\n`;
            }
            message += `✅ المكتملة: *${completed}/30*\n⏳ قيد القراءة: *${reading}*\n\n✨ اللاحق: *الجزء ${nextPart ? nextPart.id : 'الكل محجوز'}*\n📖 السور: *${nextPart ? nextPart.surahs : '-'}*\n\n💬 استخدم الأمر: *.khatm take ${nextPart ? nextPart.id : ''}* للمشاركة.\n\nتقبل الله طاعاتكم ✨\n⚔️ ${config.botName}`;
        } catch (e) { return; }
    }

    for (const id of data.subscribers) {
        try {
            await sendWithChannelButton(sock, id, message);
            if (ayahData && ayahData.audio) {
                await sock.sendMessage(id, {
                    audio: { url: ayahData.audio },
                    mimetype: 'audio/mpeg',
                    ptt: false
                });
            }
        } catch (e) { }
    }
}

module.exports = { startRamadanScheduler };
