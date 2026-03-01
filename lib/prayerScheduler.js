const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');
const { sendWithChannelButton } = require('../commands/lib/utils');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRAYER_STATE_FILE = path.join(DATA_DIR, 'prayer_state.json');
const WA_PRAYER_SUBS_FILE = path.join(DATA_DIR, 'wa_prayer_subs.json');
const TG_PRAYER_SUBS_FILE = path.join(DATA_DIR, 'tg_prayer_subs.json');
const FB_PRAYER_SUBS_FILE = path.join(DATA_DIR, 'fb_prayer_subs.json');

const TG_USERS_FILE = path.join(DATA_DIR, 'tg_users.json');
const FB_USERS_FILE = path.join(DATA_DIR, 'fb_users.json');

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

// ─── State Management (Global Defaults) ──────────────────────────────────────
function readState() {
    fs.ensureDirSync(DATA_DIR);
    try {
        if (!fs.existsSync(PRAYER_STATE_FILE)) {
            const def = { enabled: true, city: 'Casablanca', country: 'MA', method: 3 };
            fs.writeFileSync(PRAYER_STATE_FILE, JSON.stringify(def, null, 2));
            return def;
        }
        return JSON.parse(fs.readFileSync(PRAYER_STATE_FILE, 'utf8'));
    } catch (e) {
        return { enabled: true, city: 'Casablanca', country: 'MA', method: 3 };
    }
}

function saveState(state) {
    fs.ensureDirSync(DATA_DIR);
    fs.writeFileSync(PRAYER_STATE_FILE, JSON.stringify(state, null, 2));
}

function getPrayerState() { return readState(); }
function setPrayerEnabled(val) { const s = readState(); s.enabled = val; saveState(s); }
function setPrayerCity(city, country) { const s = readState(); s.city = city; s.country = country; saveState(s); }

// ─── Platform Specific Subscriptions ─────────────────────────────────────────
function getSubsFile(platform) {
    if (platform === 'tg') return TG_PRAYER_SUBS_FILE;
    if (platform === 'fb') return FB_PRAYER_SUBS_FILE;
    return WA_PRAYER_SUBS_FILE;
}

function readSubs(platform) {
    const filePath = getSubsFile(platform);
    fs.ensureDirSync(DATA_DIR);
    try {
        if (!fs.existsSync(filePath)) return {};
        let data = JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
        // Migration for WA old array format
        if (platform === 'wa' && Array.isArray(data)) {
            const map = {};
            const state = readState();
            data.forEach(jid => { map[jid] = { city: state.city, country: state.country, lastSent: {} }; });
            saveSubs('wa', map);
            return map;
        }
        return data;
    } catch (e) { return {}; }
}

function saveSubs(platform, subs) {
    const filePath = getSubsFile(platform);
    fs.ensureDirSync(DATA_DIR);
    fs.writeFileSync(filePath, JSON.stringify(subs, null, 2));
}

function subscribeUser(jid, city, country, platform = 'wa') {
    const subs = readSubs(platform);
    const state = readState();
    subs[jid] = {
        city: city || state.city,
        country: country || state.country,
        lastSent: subs[jid]?.lastSent || {}
    };
    saveSubs(platform, subs);
    return Object.keys(subs).length;
}

function unsubscribeUser(jid, platform = 'wa') {
    const subs = readSubs(platform);
    delete subs[jid];
    saveSubs(platform, subs);
    return Object.keys(subs).length;
}

function isSubscribed(jid, platform = 'wa') {
    return !!readSubs(platform)[jid];
}

function getUserCity(jid, platform = 'wa') {
    const subs = readSubs(platform);
    return subs[jid] ? subs[jid].city : readState().city;
}

// ─── Read Platform Users ──────────────────────────────────────────────────────
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
    } catch (e) { return []; }
}

// ─── Prayer Times Fetcher (Caching to avoid redundant calls) ──────────────────
const timingsCache = {};
async function fetchPrayerTimes(city = 'Casablanca', country = 'MA', method = 3) {
    const date = moment().tz('Africa/Casablanca').format('DD-MM-YYYY');
    const cacheKey = `${city}_${country}_${date}`;

    if (timingsCache[cacheKey]) return timingsCache[cacheKey];

    try {
        const url = `https://api.aladhan.com/v1/timingsByCity/${date}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;
        const res = await axios.get(url, { timeout: 10000 });
        if (res.data?.status === 'OK' && res.data?.data?.timings) {
            timingsCache[cacheKey] = res.data.data.timings;
            return res.data.data.timings;
        }
    } catch (e) { }
    return null;
}

// ─── Build Prayer Message ─────────────────────────────────────────────────────
function buildPrayerMessage(prayer, time, city) {
    const name = PRAYER_NAMES[prayer]?.ar || prayer;
    const emoji = PRAYER_EMOJIS[prayer] || '🕌';
    const dhikr = PRAYER_DHIKR[prayer] || '';

    return `${emoji} *حان وقت صلاة ${name}* ${emoji}\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `🕐 *الوقت:* ${time}\n` +
        `📍 *المدينة:* ${city}\n\n` +
        `${dhikr}\n\n` +
        `─────────────────\n` +
        `🌍 لتغيير مدينتك: *.salat [اسم المدينة]*\n` +
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

            const now = moment().tz('Africa/Casablanca');
            const todayKey = now.format('YYYY-MM-DD');
            const currentHHMM = now.format('HH:mm');

            const platforms = [
                { id: 'wa', file: WA_PRAYER_SUBS_FILE, usersFile: null }, // WA is opt-in map
                { id: 'tg', file: TG_PRAYER_SUBS_FILE, usersFile: TG_USERS_FILE }, // TG is auto-all + pref map
                { id: 'fb', file: FB_PRAYER_SUBS_FILE, usersFile: FB_USERS_FILE }  // FB is auto-all + pref map
            ];

            for (const plat of platforms) {
                const subsMap = readSubs(plat.id);
                const allUsers = plat.usersFile ? readJsonFile(plat.usersFile) : Object.keys(subsMap);

                // For TG/FB, we iterate all active users. If they have pref, use it. Else default city.
                // For WA, we only iterate the subsMap keys.

                for (const userId of allUsers) {
                    const pref = subsMap[userId] || { city: state.city, country: state.country, lastSent: {} };
                    const timings = await fetchPrayerTimes(pref.city, pref.country, state.method);
                    if (!timings) continue;

                    if (!pref.lastSent) pref.lastSent = {};

                    const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
                    for (const prayer of prayers) {
                        const pTime = timings[prayer]?.substring(0, 5);
                        const sentId = `${todayKey}_${prayer}`;

                        if (currentHHMM === pTime && !pref.lastSent[sentId]) {
                            pref.lastSent[sentId] = true;
                            const message = buildPrayerMessage(prayer, pTime, pref.city);

                            // Send based on platform
                            try {
                                if (plat.id === 'wa') {
                                    await sendWithChannelButton(currentSock, userId, message);
                                } else if (plat.id === 'tg' && config.telegramToken) {
                                    const { sendTelegramPrayerReminder } = require('./telegram');
                                    await sendTelegramPrayerReminder(userId, message);
                                } else if (plat.id === 'fb' && config.fbPageAccessToken) {
                                    const { sendFacebookMessage } = require('./facebook');
                                    await sendFacebookMessage(userId, message.replace(/\*/g, '').replace(/_/g, ''));
                                }
                                console.log(`[Prayer] Sent ${prayer} to ${plat.id} user ${userId} in ${pref.city}`);
                            } catch (e) { }

                            // Update the map to persist lastSent
                            subsMap[userId] = pref;
                            saveSubs(plat.id, subsMap);
                        }
                    }

                    // Cleanup lastSent
                    for (const key of Object.keys(pref.lastSent)) {
                        if (!key.startsWith(todayKey)) delete pref.lastSent[key];
                    }
                }
            }

        } catch (e) {
            console.error('[PrayerScheduler] Error:', e.message);
        }
    }, 60000);

    return global.prayerInterval;
}

module.exports = {
    startPrayerScheduler,
    getPrayerState,
    setPrayerEnabled,
    setPrayerCity,
    fetchPrayerTimes,
    buildPrayerMessage,
    subscribeUser,
    unsubscribeUser,
    isSubscribed,
    readWaSubs: () => Object.keys(readSubs('wa')), // Return keys for backwards compatibility in lists
    getUserCity,
    PRAYER_NAMES,
    PRAYER_EMOJIS
};
