/**
 * lib/prayerScheduler.js
 * 🕌 نظام تذكير أوقات الصلاة - Multi-Platform Prayer Times Auto-Reminder
 * 
 * WhatsApp  → المستخدم يختار: .salat on / .salat off
 * Telegram  → جميع المستخدمين تلقائياً (auto)
 * Facebook  → جميع المستخدمين تلقائياً (auto)
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');
const { sendWithChannelButton } = require('../commands/lib/utils');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRAYER_STATE_FILE = path.join(DATA_DIR, 'prayer_state.json');
const WA_USERS_FILE = path.join(DATA_DIR, 'users.json');
const TG_USERS_FILE = path.join(DATA_DIR, 'tg_users.json');
const FB_USERS_FILE = path.join(DATA_DIR, 'fb_users.json');
const WA_PRAYER_SUBS_FILE = path.join(DATA_DIR, 'wa_prayer_subs.json');

// ─── Prayer Names (Multi-language) ───────────────────────────────────────────
const PRAYER_NAMES = {
    Fajr: { ar: 'الفجر', darija: 'الفجر', fr: 'Fajr (Aube)', en: 'Fajr' },
    Sunrise: { ar: 'الشروق', darija: 'الشروق', fr: 'Lever du Soleil', en: 'Sunrise' },
    Dhuhr: { ar: 'الظهر', darija: 'الظهر', fr: 'Dhuhr (Midi)', en: 'Dhuhr' },
    Asr: { ar: 'العصر', darija: 'العصر', fr: 'Asr', en: 'Asr' },
    Maghrib: { ar: 'المغرب', darija: 'المغرب', fr: 'Maghrib', en: 'Maghrib' },
    Isha: { ar: 'العشاء', darija: 'العشاء', fr: 'Isha', en: "Isha'" },
};

const PRAYER_EMOJIS = {
    Fajr: '🌙', Sunrise: '🌅', Dhuhr: '☀️', Asr: '🌤️', Maghrib: '🌇', Isha: '🌃'
};

const PRAYER_DHIKR = {
    Fajr: '«اللهم إني أسألك علماً نافعاً، ورزقاً طيباً، وعملاً متقبلاً»\n🕊️ _أذكار الصباح خير حصن ليومك_',
    Dhuhr: '«اللهم اجعل نفسي مطمئنة بذكرك، وقلبي ساكناً في ظلك»\n☀️ _توقف لحظة وأطل إلى السماء — ربك يراك_',
    Asr: '«إِنَّ الْإِنسَانَ لَفِي خُسْرٍ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ»\n🌤️ _الوقت يمضي فأحسن عملك_',
    Maghrib: '«اللهم إني أسألك بنور وجهك الذي أشرق له كل شيء»\n🌇 _ساعة المغرب من أعظم ساعات الإجابة — ادعُ الله الآن_',
    Isha: '«اللهم باسمك أموت وأحيا»\n🌃 _لا تنم قبل أن تستغفر وتقرأ آية الكرسي_',
    Sunrise: '🌅 _تذكير: لا تفوتك صلاة الضحى — ركعتان خير من الدنيا وما فيها_',
};

// ─── State Management ─────────────────────────────────────────────────────────
function readState() {
    fs.ensureDirSync(DATA_DIR);
    try {
        if (!fs.existsSync(PRAYER_STATE_FILE)) {
            const def = { enabled: true, city: 'Casablanca', country: 'MA', method: 3, lastSent: {} };
            fs.writeFileSync(PRAYER_STATE_FILE, JSON.stringify(def, null, 2));
            return def;
        }
        const s = JSON.parse(fs.readFileSync(PRAYER_STATE_FILE, 'utf8'));
        if (s.enabled === undefined) s.enabled = true; // default to enabled
        return s;
    } catch (e) {
        return { enabled: true, city: 'Casablanca', country: 'MA', method: 3, lastSent: {} };
    }
}

function saveState(state) {
    fs.ensureDirSync(DATA_DIR);
    fs.writeFileSync(PRAYER_STATE_FILE, JSON.stringify(state, null, 2));
}

function getPrayerState() { return readState(); }
function setPrayerEnabled(val) { const s = readState(); s.enabled = val; saveState(s); }
function setPrayerCity(city, country) { const s = readState(); s.city = city; s.country = country; s.lastSent = {}; saveState(s); }

// ─── WhatsApp User Opt-in/Opt-out ─────────────────────────────────────────────
function readWaSubs() {
    fs.ensureDirSync(DATA_DIR);
    try {
        if (!fs.existsSync(WA_PRAYER_SUBS_FILE)) { fs.writeFileSync(WA_PRAYER_SUBS_FILE, '[]'); return []; }
        return JSON.parse(fs.readFileSync(WA_PRAYER_SUBS_FILE, 'utf8') || '[]');
    } catch (e) { return []; }
}

function saveWaSubs(subs) {
    fs.ensureDirSync(DATA_DIR);
    fs.writeFileSync(WA_PRAYER_SUBS_FILE, JSON.stringify(subs, null, 2));
}

function subscribeWaUser(jid) {
    const subs = readWaSubs();
    if (!subs.includes(jid)) { subs.push(jid); saveWaSubs(subs); }
    return subs.length;
}

function unsubscribeWaUser(jid) {
    const subs = readWaSubs().filter(s => s !== jid);
    saveWaSubs(subs);
    return subs.length;
}

function isWaSubscribed(jid) { return readWaSubs().includes(jid); }

// ─── Read Platform Users ──────────────────────────────────────────────────────
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
    } catch (e) { return []; }
}

// ─── Prayer Times Fetcher ─────────────────────────────────────────────────────
async function fetchPrayerTimes(city = 'Casablanca', country = 'MA', method = 3) {
    const date = moment().tz('Africa/Casablanca').format('DD-MM-YYYY');
    try {
        const url = `https://api.aladhan.com/v1/timingsByCity/${date}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;
        const res = await axios.get(url, { timeout: 10000 });
        if (res.data?.status === 'OK' && res.data?.data?.timings) {
            return res.data.data.timings;
        }
    } catch (e) { }
    return null;
}

// ─── Build Prayer Message ─────────────────────────────────────────────────────
function buildPrayerMessage(prayer, time, city = 'Casablanca') {
    const name = PRAYER_NAMES[prayer]?.ar || prayer;
    const emoji = PRAYER_EMOJIS[prayer] || '🕌';
    const dhikr = PRAYER_DHIKR[prayer] || '';

    return `${emoji} *حان وقت صلاة ${name}* ${emoji}\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `🕐 *الوقت:* ${time}\n` +
        `📍 *المدينة:* ${city}\n\n` +
        `${dhikr}\n\n` +
        `─────────────────\n` +
        `📲 لإيقاف التذكير على واتساب: *.salat off*\n` +
        `⚔️ _${config.botName}_`;
}

// ─── Main Scheduler ───────────────────────────────────────────────────────────
async function startPrayerScheduler(sock) {
    if (global.prayerInterval) clearInterval(global.prayerInterval);

    global.prayerInterval = setInterval(async () => {
        try {
            const currentSock = global.sock || sock;
            if (!currentSock || !currentSock.user) return;

            const state = readState();
            if (!state.enabled) return;

            const timings = await fetchPrayerTimes(state.city, state.country, state.method);
            if (!timings) return;

            const now = moment().tz('Africa/Casablanca');
            const todayKey = now.format('YYYY-MM-DD');
            const currentHHMM = now.format('HH:mm');

            if (!state.lastSent) state.lastSent = {};

            const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

            for (const prayer of prayers) {
                const pTime = timings[prayer];
                if (!pTime) continue;
                const pFormatted = pTime.substring(0, 5);
                const sentId = `${todayKey}_${prayer}`;

                if (currentHHMM !== pFormatted || state.lastSent[sentId]) continue;

                // Mark as sent immediately to avoid double-send
                state.lastSent[sentId] = true;
                saveState(state);

                const message = buildPrayerMessage(prayer, pFormatted, state.city);
                console.log(`[Prayer] 📢 ${prayer} (${pFormatted})`);

                // ── 1. WhatsApp: opted-in users only ────────────────────────
                const waSubs = readWaSubs();
                for (const userId of waSubs) {
                    try {
                        await new Promise(r => setTimeout(r, 300));
                        await sendWithChannelButton(currentSock, userId, message);
                    } catch (e) { }
                }

                // ── 2. Telegram: all users (auto) ───────────────────────────
                const tgUsers = readJsonFile(TG_USERS_FILE);
                if (tgUsers.length > 0 && config.telegramToken) {
                    try {
                        const { sendTelegramPrayerReminder } = require('./telegram');
                        for (const tgId of tgUsers) {
                            try {
                                await new Promise(r => setTimeout(r, 200));
                                await sendTelegramPrayerReminder(tgId, message);
                            } catch (e) { }
                        }
                    } catch (e) { }
                }

                // ── 3. Facebook: all users (auto) ───────────────────────────
                const fbUsers = readJsonFile(FB_USERS_FILE);
                if (fbUsers.length > 0 && config.fbPageAccessToken) {
                    try {
                        const { sendFacebookMessage } = require('./facebook');
                        for (const fbId of fbUsers) {
                            try {
                                await new Promise(r => setTimeout(r, 300));
                                await sendFacebookMessage(fbId, message.replace(/\*/g, '').replace(/_/g, ''));
                            } catch (e) { }
                        }
                    } catch (e) { }
                }

                console.log(`[Prayer] ✅ ${prayer} sent → WA:${waSubs.length} | TG:${tgUsers.length} | FB:${fbUsers.length}`);
            }

            // Cleanup old lastSent keys (keep only today & yesterday)
            for (const key of Object.keys(state.lastSent)) {
                if (!key.startsWith(todayKey)) delete state.lastSent[key];
            }
            saveState(state);

        } catch (e) {
            console.error('[PrayerScheduler] Error:', e.message);
        }
    }, 60000);

    console.log('[Prayer] 🕌 Prayer scheduler started (WA=opt-in | TG/FB=auto).');
    return global.prayerInterval;
}

module.exports = {
    startPrayerScheduler,
    getPrayerState,
    setPrayerEnabled,
    setPrayerCity,
    fetchPrayerTimes,
    buildPrayerMessage,
    subscribeWaUser,
    unsubscribeWaUser,
    isWaSubscribed,
    readWaSubs,
    PRAYER_NAMES,
    PRAYER_EMOJIS
};
