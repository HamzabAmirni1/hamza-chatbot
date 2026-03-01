const WA_PRAYER_SUBS_FILE = path.join(DATA_DIR, 'wa_prayer_subs.json');

// ... (PRAYER_NAMES, PRAYER_EMOJIS, PRAYER_DHIKR same)

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

// ─── User Specific Subscriptions (WA) ─────────────────────────────────────────
function readWaSubs() {
    fs.ensureDirSync(DATA_DIR);
    try {
        if (!fs.existsSync(WA_PRAYER_SUBS_FILE)) return {};
        let data = JSON.parse(fs.readFileSync(WA_PRAYER_SUBS_FILE, 'utf8') || '{}');
        // Migration from old array format
        if (Array.isArray(data)) {
            const map = {};
            const state = readState();
            data.forEach(jid => { map[jid] = { city: state.city, country: state.country, lastSent: {} }; });
            saveWaSubs(map);
            return map;
        }
        return data;
    } catch (e) { return {}; }
}

function saveWaSubs(subs) {
    fs.ensureDirSync(DATA_DIR);
    fs.writeFileSync(WA_PRAYER_SUBS_FILE, JSON.stringify(subs, null, 2));
}

function subscribeWaUser(jid, city, country) {
    const subs = readWaSubs();
    const state = readState();
    subs[jid] = {
        city: city || state.city,
        country: country || state.country,
        lastSent: subs[jid]?.lastSent || {}
    };
    saveWaSubs(subs);
    return Object.keys(subs).length;
}

function unsubscribeWaUser(jid) {
    const subs = readWaSubs();
    delete subs[jid];
    saveWaSubs(subs);
    return Object.keys(subs).length;
}

function isWaSubscribed(jid) {
    return !!readWaSubs()[jid];
}

function getWaUserCity(jid) {
    const subs = readWaSubs();
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

            const waSubsMap = readWaSubs();
            const now = moment().tz('Africa/Casablanca');
            const todayKey = now.format('YYYY-MM-DD');
            const currentHHMM = now.format('HH:mm');

            // 1. Handle WhatsApp (Individual Cities)
            for (const [jid, userPref] of Object.entries(waSubsMap)) {
                const timings = await fetchPrayerTimes(userPref.city, userPref.country, state.method);
                if (!timings) continue;

                if (!userPref.lastSent) userPref.lastSent = {};

                const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
                for (const prayer of prayers) {
                    const pTime = timings[prayer]?.substring(0, 5);
                    const sentId = `${todayKey}_${prayer}`;

                    if (currentHHMM === pTime && !userPref.lastSent[sentId]) {
                        userPref.lastSent[sentId] = true;
                        const message = buildPrayerMessage(prayer, pTime, userPref.city);
                        await sendWithChannelButton(currentSock, jid, message);
                        saveWaSubs(waSubsMap); // Persist lastSent
                        console.log(`[Prayer] Sent ${prayer} to WA user ${jid} in ${userPref.city}`);
                    }
                }

                // Cleanup lastSent
                for (const key of Object.keys(userPref.lastSent)) {
                    if (!key.startsWith(todayKey)) delete userPref.lastSent[key];
                }
            }

            // 2. Handle TG/FB (Default City for Now)
            const timingsDefault = await fetchPrayerTimes(state.city, state.country, state.method);
            if (timingsDefault) {
                if (!state.lastSent) state.lastSent = {};
                const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
                for (const prayer of prayers) {
                    const pTime = timingsDefault[prayer]?.substring(0, 5);
                    const sentId = `${todayKey}_${prayer}`;

                    if (currentHHMM === pTime && !state.lastSent[sentId]) {
                        state.lastSent[sentId] = true;
                        saveState(state);

                        const message = buildPrayerMessage(prayer, pTime, state.city);

                        // Telegram
                        const tgUsers = readJsonFile(TG_USERS_FILE);
                        if (tgUsers.length > 0 && config.telegramToken) {
                            const { sendTelegramPrayerReminder } = require('./telegram');
                            for (const tgId of tgUsers) {
                                try { await sendTelegramPrayerReminder(tgId, message); } catch (e) { }
                            }
                        }

                        // Facebook
                        const fbUsers = readJsonFile(FB_USERS_FILE);
                        if (fbUsers.length > 0 && config.fbPageAccessToken) {
                            const { sendFacebookMessage } = require('./facebook');
                            for (const fbId of fbUsers) {
                                try { await sendFacebookMessage(fbId, message.replace(/\*/g, '').replace(/_/g, '')); } catch (e) { }
                            }
                        }
                    }
                }
                // Cleanup lastSent
                for (const key of Object.keys(state.lastSent)) {
                    if (!key.startsWith(todayKey)) delete state.lastSent[key];
                }
                saveState(state);
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
    subscribeWaUser,
    unsubscribeWaUser,
    isWaSubscribed,
    readWaSubs: () => Object.keys(readWaSubs()), // Return keys for backwards compatibility in lists
    getWaUserCity,
    PRAYER_NAMES,
    PRAYER_EMOJIS
};
