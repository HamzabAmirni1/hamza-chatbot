const moment = require('moment-timezone');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { sendWithChannelButton } = require('../commands/lib/utils');
const config = require('../config');

// --- DATA ---

const dailyDuas30 = [
    { day: 1, dua: "اللَّهُمَّ اجْعَلْ صِيَامِي فِيهِ صِيَامَ الصَّائِمِينَ، وَ قِيَامِي فِيهِ قِيَامَ الْقَائِمِينَ، وَ نَبِّهْنِي فِيهِ عَنْ نَوْمَةِ الْغَافِلِينَ، وَ هَبْ لِي جُرْمِي فِيهِ يَا إِلَهَ الْعَالَمِينَ، وَ اعْفُ عَنِّي يَا عَافِياً عَنِ الْمُجْرِمِينَ." },
    { day: 2, dua: "اللَّهُمَّ قَرِّبْنِي فِيهِ إِلَى مَرْضَاتِكَ، وَ جَنِّبْنِي فِيهِ مِنْ سَخَطِكَ وَ نَقِمَاتِكَ، وَ وَفِّقْنِي فِيهِ لِقِرَاءَةِ آيَاتِكَ، بِرَحْمَتِكَ يَا أَرْحَمَ الرَّاحِمِينَ." },
    { day: 3, dua: "اللَّهُمَّ ارْزُقْنِي فِيهِ الذِّهْنَ وَ التَّنْبِيهَ، وَ بَاعِدْنِي فِيهِ مِنَ السَّفَاهَةِ وَ التَّمْوِيهِ، وَ اجْعَلْ لِي نَصِيباً مِنْ كُلِّ خَيْرٍ تُنْزِلُ فِيهِ، بِجُودِكَ يَا أَجْوَدَ الْأَجْوَدِينَ." },
    { day: 4, dua: "اللَّهُمَّ قَوِّنِي فِيهِ عَلَى إِقَامَةِ أَمْرِكَ، وَ أَذِقْنِي فِيهِ حَلَاوَةَ ذِكْرِكَ، وَ أَوْزِعْنِي فِيهِ لِأَدَاءِ شُكْرِكَ بِكَرَمِكَ، وَ احْفَظْنِي فِيهِ بِحِفْظِكَ وَ سِتْرِكَ يَا أَبْصَرَ النَّاظِرِينَ." },
    { day: 5, dua: "اللَّهُمَّ اجْعَلْنِي فِيهِ مِنَ الْمُسْتَغْفِرِينَ، وَ اجْعَلْنِي فِيهِ مِنْ عِبَادِكَ الصَّالِحِينَ الْقَانِتِينَ، وَ اجْعَلْنِي فِيهِ مِنْ أَوْلِيَائِكَ الْمُقَرَّبِينَ، بِرَأْفَتِكَ يَا أَرْحَمَ الرَّاحِمِينَ." },
    { day: 6, dua: "اللَّهُمَّ لَا تَخْذُلْنِي فِيهِ لِتَعَرُّضِ مَعْصِيَتِكَ، وَ لَا تَضْرِبْنِي بِسِيَاطِ نَقِمَتِكَ، وَ زَحْزِحْنِي فِيهِ مِنْ مُوجِباتِ سَخَطِكَ بِمَنِّكَ وَ أَيَادِيكَ يَا مُنْتَهَى رَغْبَةِ الرَّاغِبِينَ." },
    { day: 7, dua: "اللَّهُمَّ أَعِنِّي فِيهِ عَلَى صِيَامِهِ وَ قِيَامِهِ، وَ جَنِّبْنِي فِيهِ مِنْ هَفَوَاتِهِ وَ آثَامِهِ، وَ ارْزُقْنِي فِيهِ ذِكْرَكَ بِدَوامِهِ، بِتَوْفِيقِكَ يَا هَادِيَ الْمُضِلِّينَ." },
    { day: 8, dua: "اللَّهُمَّ ارْزُقْنِي فِيهِ رَحْمَةَ الْأَيْتَامِ، وَ إِطْعَامَ الطَّعَامِ، وَ إِفْشَاءَ السَّلَامِ، وَ صُحْبَةَ الْكِرَامِ، بِطَوْلِكَ يَا مَلْجَأَ الْآمِلِينَ." },
    { day: 9, dua: "اللَّهُمَّ اجْعَلْ لِي فِيهِ نَصِيباً مِنْ رَحْمَتِكَ الْوَاسِعَةِ، وَ اهْدِنِي فِيهِ لِبَرَاهِينِكَ السَّاطِعَةِ، وَ خُذْ بِنَاصِيَتِي إِلَى مَرْضَاتِكَ الْجَامِعَةِ، بِمَحَبَّتِكَ يَا أَمَلَ الْمُشْتَاقِينَ." },
    { day: 10, dua: "اللَّهُمَّ اجْعَلْنِي فِيهِ مِنَ الْمُتَوَكِّلِينَ عَلَيْكَ، وَ اجْعَلْنِي فِيهِ مِنَ الْفَائِزِينَ لَدَيْكَ، وَ اجْعَلْنِي فِيهِ مِنَ الْمُقَرَّبِينَ إِلَيْكَ، بِإِحْسَانِكَ يَا غَايَةَ الطَّالِبِينَ." },
    { day: 11, dua: "اللَّهُمَّ حَبِّبْ إِلَيَّ فِيهِ الْإِحْسَانَ، وَ كَرِّهْ إِلَيَّ فِيهِ الْفُسُوقَ وَ الْعِصْيَانَ، وَ حَرِّمْ عَلَيَّ فِيهِ السَّخَطَ وَ النِّيرَانَ بِعَوْنِكَ يَا غِيَاثَ الْمُسْتَغِيثِينَ." },
    { day: 12, dua: "اللَّهُمَّ زَيِّنِّي فِيهِ بِالسِّتْرِ وَ الْعَفَافِ، وَ اسْتُرْنِي فِيهِ بِلِبَاسِ الْقُنُوعِ وَ الْكَفَافِ، وَ احْمِلْنِي فِيهِ عَلَى الْعَدْلِ وَ الْإِنْصَافِ، وَ آمِنِّي فِيهِ مِنْ كُلِّ مَا أَخَافُ بِعِصْمَتِكَ يَا عِصْمَةَ الْخَائِفِينَ." },
    { day: 13, dua: "اللَّهُمَّ طَهِّرْنِي فِيهِ مِنَ الدَّنَسِ وَ الْأَقْذَارِ، وَ صَبِّرْنِي فِيهِ عَلَى كَائِنَاتِ الْأَقْدَارِ، وَ وَفِّقْنِي فِيهِ لِتُّقَى وَ صُحْبَةِ الْأَبْرَارِ، بِعَوْنِكَ يَا قُرَّةَ عَيْنِ الْمَسَاكِينِ." },
    { day: 14, dua: "اللَّهُمَّ لَا تُؤَاخِذْنِي فِيهِ بِالْعَثَرَاتِ، وَ أَقِلْنِي فِيهِ مِنَ الْخَطَايَا وَ الْهَفَواتِ، وَ لَا تَجْعَلْنِي فِيهِ غَرَضاً لِلْبَلَايَا وَ الْآفَاتِ بِعِزَّتِكَ يَا عِزَّ الْمُسْلِمِينَ." },
    { day: 15, dua: "اللَّهُمَّ ارْزُقْنِي فِيهِ طَاعَةَ الْخَاشِعِينَ، وَ اشْرَحْ فِيهِ صَدْرِي بِإِنَابَةِ الْمُخْبِتِينَ، بِأَمَانِكَ يَا أَمَانَ الْخَائِفِينَ." },
    { day: 16, dua: "اللَّهُمَّ وَفِّقْنِي فِيهِ لِمُوَافَقَةِ الْأَبْرَارِ، وَ جَنِّبْنِي فِيهِ مُرَافَقَةَ الْأَشْرَارِ، وَ آوِنِي فِيهِ بِرَحْمَتِكَ إِلَى دَارِ الْقَرَارِ، بِإِلَهِيَّتِكَ يَا إِلَهَ الْعَالَمِينَ." },
    { day: 17, dua: "اللَّهُمَّ اهْدِنِي فِيهِ لِصَالِحِ الْأَعْمَالِ، وَ اقْضِ لِي فِيهِ الْحَوَائِجَ وَ الْآمَالَ، يَا مَنْ لَا يَحْتَاجُ إِلَى التَّفْسِيرِ وَ السُّؤَالِ، يَا عَالِماً بِمَا فِي صُدُورِ الْعَالَمِينَ، صَلِّ عَلَى مُحَمَّدٍ وَ آلِهِ الطَّاهِرِينَ." },
    { day: 18, dua: "اللَّهُمَّ نَبِّهْنِي فِيهِ لِبَرَكَاتِ أَسْحَارِهِ، وَ نَوِّرْ فِيهِ قَلْبِي بِضِيَاءِ أَنْوَارِهِ، وَ خُذْ بِكُلِّ أَعْضَائِي إِلَى اتِّباعِ آثَارِهِ، بِنُورِكَ يَا مُنَوِّرَ قُلُوبِ الْعَارِفِينَ." },
    { day: 19, dua: "اللَّهُمَّ وَفِّرْ فِيهِ حَظِّي مِنْ بَرَكَاتِهِ، وَ سَهِّلْ سَبِيلِي إِلَى خَيْرَاتِهِ، وَ لَا تَحْرِمْنِي قَبُولَ حَسَنَاتِهِ، يَا هَادِياً إِلَى الْحَقِّ الْمُبِينِ." },
    { day: 20, dua: "اللَّهُمَّ افْتَحْ لِي فِيهِ أَبْوابَ الْجِنَانِ، وَ أَغْلِقْ عَنِّي فِيهِ أَبْوَابَ النِّيرَانِ، وَ وَفِّقْنِي فِيهِ لِتِلاوَةِ الْقُرْآنِ، يَا مُنْزِلَ السَّكِينَةِ فِي قُلُوبِ الْمُؤْمِنِينَ." },
    { day: 21, dua: "اللَّهُمَّ اجْعَلْ لِي فِيهِ إِلَى مَرْضَاتِكَ دَلِيلاً، وَ لَا تَجْعَلْ لِلشَّيْطَانِ فِيهِ عَلَيَّ سَبِيلاً، وَ اجْعَلِ الْجَنَّةَ لِي مَنْزِلاً وَ مَقِيلاً، يَا قَاضِيَ حَوائِجِ الطَّالِبِينَ." },
    { day: 22, dua: "اللَّهُمَّ افْتَحْ لِي فِيهِ أَبْوَابَ فَضْلِكَ، وَ أَنْزِلْ عَلَيَّ فِيهِ بَرَكَاتِكَ، وَ وَفِّقْنِي فِيهِ لِمُوجِبَاتِ مَرْضَاتِكَ، وَ أَسْكِنِّي فِيهِ بُحْبُوحَاتِ جَنَّاتِكَ، يَا مُجِيبَ دَعْوَةِ الْمُضْطَرِّينَ." },
    { day: 23, dua: "اللَّهُمَّ اغْسِلْنِي فِيهِ مِنَ الذُّنُوبِ، وَ طَهِّرْنِي فِيهِ مِنَ الْعُيُوبِ، وَ امْتَحِنْ قَلْبِي فِيهِ بِتَقْوَى الْقُلُوبِ، يَا مُقِيلَ عَثَرَاتِ الْمُذْنِبِينَ." },
    { day: 24, dua: "اللَّهُمَّ إِنِّي أَسْأَلُكَ فِيهِ مَا يُرْضِيكَ، وَ أَعُوذُ بِكَ مِمَّا يُؤْذِيكَ، وَ أَسْأَلُكَ التَّوْفِيقَ فِيهِ لِأَنْ أُطِيعَكَ وَ لَا أَعْصِيَكَ، يَا جَوَادَ السَّائِلِينَ." },
    { day: 25, dua: "اللَّهُمَّ اجْعَلْنِي فِيهِ مُحِبّاً لِأَوْلِيَائِكَ، وَ مُعَادِياً لِأَعْدَائِكَ، مُسْتَنّاً بِسُنَّةِ خَاتَمِ أَنْبِيَائِكَ، يَا عَاصِمَ قُلُوبِ النَّبِيِّينَ." },
    { day: 26, dua: "اللَّهُمَّ اجْعَلْ سَعْيِي فِيهِ مَشْكُورا، وَ ذَنْبِي فِيهِ مَغْفُورا، وَ عَمَلِي فِيهِ مَقْبُولا، وَ عَيْبِي فِيهِ مَسْتُورا، يَا أَسْمَعَ السَّامِعينَ." },
    { day: 27, dua: "اللَّهُمَّ ارْزُقْنِي فِيهِ فَضْلَ لَيْلَةِ الْقَدْرِ، وَ صَيِّرْ أُمُورِي فِيهِ مِنَ الْعُسْرِ إِلَى الْيُسْرِ، وَ اقْبَلْ مَعَاذِيرِي، وَ حُطَّ عَنِّي الذَّنْبَ وَ الْوِزْرَ، يَا رَؤُوفاً بِعِبَادِهِ الصَّالِحِينَ." },
    { day: 28, dua: "اللَّهُمَّ وَفِّرْ حَظِّي فِيهِ مِنَ النَّوَافِلِ، وَ أَكْرِمْنِي فِيهِ بِإِحْضَارِ الْمَسَائِلِ، وَ قَرِّبْ فِيهِ وَسِيلَتِي إِلَيْكَ مِنْ بَيْنِ الْوَسَائِلِ، يَا مَنْ لَا يَشْغَلُهُ إِلْحَاحُ الْمُلِحِّينَ." },
    { day: 29, dua: "اللَّهُمَّ غَشِّنِي فِيهِ بِالرَّحْمَةِ، وَ ارْزُقْنِي فِيهِ التَّوْفِيقَ وَ الْعِصْمَةَ، وَ طَهِّرْ قَلْبِي مِنْ غَيَاهِبِ التُّهْمَةِ، يَا رَحِيماً بِعِبَادِهِ الْمُؤْمِنِينَ." },
    { day: 30, dua: "اللَّهُمَّ اجْعَلْ صِيَامِي فِيهِ بِالشُّكْرِ وَ الْقَبُولِ عَلَى مَا تَرْضَاهُ وَ يَرْضَاهُ الرَّسُولُ، مُحْكَمَةً فُرُوعُهُ بِالْأُصُولِ، بِحقِّ سَيِّدِنَا مُحَمَّدٍ وَ آلِهِ الطَّاهِرِينَ، وَ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ." }
];

const azkarReminders = [
    "📿 سبحان الله وبحمده (100 مرة)",
    "📿 لا إله إلا الله وحده لا شريك له (100 مرة)",
    "📿 أستغفر الله وأتوب إليه",
    "📿 اللهم صل وسلم على نبينا محمد",
    "📿 لا حول ولا قوة إلا بالله"
];

const quranPathReminders = [
    "📖 هل قرأت وردك القرآني اليوم؟ اجعل هذا اليوم شاهداً لك لا عليك.",
    "📖 القرآن ربيع القلوب، لا تجعل يومك يمضي دون تلاوة.",
    "📖 تذكير: صفحة واحدة من القرآن كفيلة لتغيير مزاجك طوال اليوم."
];

// --- UTILS ---

async function fetchRandomAyah() {
    try {
        const randomAyahNum = Math.floor(Math.random() * 6236) + 1;
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${randomAyahNum}/ar.alafasy`);
        if (response.data && response.data.status === 'OK') return response.data.data;
    } catch (e) { }
    return null;
}

function readUsers(platform) {
    if (platform === 'fb') {
        const { getFbUsers } = require('./facebook');
        return getFbUsers();
    }
    const filePath = path.join(__dirname, '..', 'data', `${platform}_users.json`);
    try {
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
    } catch (e) { return []; }
}

async function sendMultiPlatform(sock, id, platform, message, audioUrl = null, pageId = null) {
    try {
        if (platform === 'wa') {
            await sendWithChannelButton(sock, id, message);
            if (audioUrl) await sock.sendMessage(id, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false });
        } else if (platform === 'tg' && config.telegramToken) {
            const { sendTelegramPrayerReminder } = require('./telegram');
            await sendTelegramPrayerReminder(id, message);
        } else if (platform === 'fb') {
            const { sendFacebookMessage } = require('./facebook');
            await sendFacebookMessage(id, message.replace(/\*/g, '').replace(/_/g, ''), pageId);
        }
    } catch (e) { }
}

// --- SCHEDULER ---

async function startRamadanScheduler(sock) {
    if (global.ramadanInterval) clearInterval(global.ramadanInterval);

    console.log('[Ramadan] 🌙 Ramadan Package Scheduler started (Multi-Platform)');

    global.ramadanInterval = setInterval(async () => {
        const currentSock = global.sock || sock;
        if (!currentSock || !currentSock.user) return;

        const now = moment().tz('Africa/Casablanca');
        const ramadanStart = moment.tz("2026-02-18", "Africa/Casablanca");
        const ramadanEnd = moment.tz("2026-03-20", "Africa/Casablanca");

        // Only run if we are in Ramadan (or test environment)
        if (!now.isBetween(ramadanStart, ramadanEnd)) return;

        const currentHour = now.hour();
        const currentMinute = now.minutes();
        const day = now.diff(ramadanStart, 'days') + 1;

        let type = null;
        if (currentHour === 4 && currentMinute === 30) type = "suhur";
        if (currentHour === 9 && currentMinute === 0) type = "morning_dhikr";
        if (currentHour === 13 && currentMinute === 0) type = "quran_midday";
        if (currentHour === 17 && currentMinute === 0) type = "evening_dhikr";
        if (currentHour === 18 && currentMinute === 45) type = "iftar";
        if (currentHour === 22 && currentMinute === 0) type = "post_taraweeh";

        if (type) await broadcastRamadanMessage(currentSock, type, day);

    }, 60000);
}

async function broadcastRamadanMessage(sock, type, day) {
    const subsPath = path.join(__dirname, '..', 'data', 'duas-subscribers.json');
    let waSubscribers = [];
    if (fs.existsSync(subsPath)) {
        try { waSubscribers = JSON.parse(fs.readFileSync(subsPath, 'utf-8')).subscribers || []; } catch (e) { }
    }

    const tgUsers = readUsers('tg');
    const fbUsers = readUsers('fb');

    let message = "";
    let ayahData = null;
    const dayDua = dailyDuas30[(day - 1) % 30] || { dua: "اللهم تقبل صيامنا." };

    if (type === "suhur") {
        message = `🌙 *تذكير السحور - اليوم ${day}* 🌙\n\n🥣 «تَسَحَّرُوا فَإِنَّ فِي السَّحُورِ بَرَكَةً».\n\n🤲 *دعاء اليوم:* ${dayDua.dua}\n\n💡 *نصيحة:* لا تنسَ نية الصيام وشرب الماء بكثرة.\n\n⚔️ ${config.botName}`;
    } else if (type === "morning_dhikr") {
        ayahData = await fetchRandomAyah();
        message = `☀️ *تذكير أذكار الصباح* ☀️\n\n📿 اجعل لسانك رطباً بذكر الله في هذا الصباح المبارك.\n✨ ${azkarReminders[Math.floor(Math.random() * azkarReminders.length)]}\n\n`;
        if (ayahData) message += `📖 *آية للتأمل:* ${ayahData.text}\n📍 [${ayahData.surah.name}:${ayahData.numberInSurah}]\n\n`;
        message += `⚔️ ${config.botName}`;
    } else if (type === "quran_midday") {
        message = `📖 *ورد القرآن الكريم* 📖\n\n✨ ${quranPathReminders[Math.floor(Math.random() * quranPathReminders.length)]}\n\n🕯️ اغتنم ساعات النهار في التلاوة والتدبر.\n\n⚔️ ${config.botName}`;
    } else if (type === "evening_dhikr") {
        message = `📿 *أذكار المساء* 📿\n\n✨ حان وقت تحصين النفس بأذكار المساء.\n✨ ${azkarReminders[Math.floor(Math.random() * azkarReminders.length)]}\n\n🤲 اقترب موعد الإفطار، فاستعد لساعة الإجابة.\n\n⚔️ ${config.botName}`;
    } else if (type === "iftar") {
        message = `🌙 *تذكير الإفطار - اليوم ${day}* 🌙\n\n🤲 *دعاء الإفطار:* ذهب الظمأ وابتلت العروق وثبت الأجر إن شاء الله.\n🤲 «إن للصائم عند فطره لدعوة ما ترد».\n\nتقبل الله صيامكم ✨\n⚔️ ${config.botName}`;
    } else if (type === "post_taraweeh") {
        try {
            const { loadKhatmData } = require('../commands/islamic/khatm');
            const khatmData = loadKhatmData();
            const completed = khatmData.parts.filter(p => p.status === 'completed').length;
            const nextPart = khatmData.parts.find(p => p.status === 'available');
            message = `📖 *متابعة الختمة الرمضانية* 📖\n\n✅ الأجزاء المكتملة: *${completed}/30*\n✨ اللاحق: *الجزء ${nextPart ? nextPart.id : 'الكل مكتمل'}*\n\n💬 شارك في الأجر واستخدم: *.khatm take ${nextPart ? nextPart.id : ''}*\n\n⚔️ ${config.botName}`;
        } catch (e) {
            message = `📖 *تذكير قيام الليل* 📖\n\n🌙 صلاة التراويح والوتر هي جنة المؤمن في ليله.\n✨ «مَنْ قَامَ رَمَضَانَ إِيمَانًا وَاحْتِسَابًا غُفِرَ لَهُ مَا تَقَدَّمَ مِنْ ذَنْبِهِ».\n\n⚔️ ${config.botName}`;
        }
    }

    if (!message) return;

    // Send to WhatsApp (Opt-in)
    for (const id of waSubscribers) {
        await sendMultiPlatform(sock, id, 'wa', message, ayahData?.audio);
    }

    // Send to Telegram (Auto-all)
    for (const id of tgUsers) {
        await sendMultiPlatform(sock, id, 'tg', message);
    }

    // Send to Facebook (Auto-all)
    for (const user of fbUsers) {
        const fbId = typeof user === 'object' ? user.id : user;
        const pageId = typeof user === 'object' ? user.pageId : null;
        await sendMultiPlatform(sock, fbId, 'fb', message, null, pageId);
    }
}

module.exports = { startRamadanScheduler };
