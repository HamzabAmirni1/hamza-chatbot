const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');

/**
 * Traffic & Ad Revenue Booster (v8.0 - Lightweight Axios)
 *
 * No Chromium/puppeteer — runs perfectly on Koyeb Free (512MB RAM).
 * Ad impressions are counted by directly hitting Monetag ad endpoints + GA4.
 */

const MAIN_SITE = 'https://hamzaamirni.netlify.app';

// Monetag ad zone endpoints — hitting these registers an impression
const MONETAG_ENDPOINTS = [
    `https://quge5.com/88/tag.min.js?zoneId=215026`,
    `https://quge5.com/88/tag.min.js?zoneId=215026&v=${Date.now()}`,
    `https://5gvci.com/act/files/service-worker.min.js?r=sw&zoneId=10662967`,
];

const GA_MEASUREMENT_ID = 'G-DC06ZLLB59';

// ─── Traffic Sources ──────────────────────────────────────────────────────────
const TRAFFIC_SOURCES = [
    { weight: 30, source: 'facebook', medium: 'social', ref: 'https://l.facebook.com/', campaign: 'fb_organic' },
    { weight: 8, source: 'facebook', medium: 'social', ref: 'https://m.facebook.com/', campaign: 'fb_mobile' },
    { weight: 9, source: 'instagram', medium: 'social', ref: 'https://l.instagram.com/', campaign: 'ig_organic' },
    { weight: 8, source: 'whatsapp', medium: 'social', ref: 'https://web.whatsapp.com/', campaign: 'wa_share' },
    { weight: 5, source: 'telegram', medium: 'social', ref: 'https://t.me/', campaign: 'tg_share' },
    { weight: 4, source: 'tiktok', medium: 'social', ref: 'android-app://com.zhiliaoapp.musically/', campaign: 'tiktok_bio' },
    { weight: 4, source: 'twitter', medium: 'social', ref: 'https://t.co/', campaign: 'twitter_link' },
    { weight: 7, source: 'google', medium: 'organic', ref: 'https://www.google.com/search?q=hamza+amirni', campaign: null },
    { weight: 5, source: 'google', medium: 'organic', ref: 'https://www.google.com/search?q=hamza+amirni+portfolio', campaign: null },
    { weight: 3, source: 'bing', medium: 'organic', ref: 'https://www.bing.com/search?q=hamza+amirni', campaign: null },
    { weight: 3, source: 'linkedin', medium: 'social', ref: 'https://www.linkedin.com/', campaign: 'linkedin' },
];

// Build weighted pool
const SOURCE_POOL = [];
for (const s of TRAFFIC_SOURCES) for (let i = 0; i < s.weight; i++) SOURCE_POOL.push(s);
const pickSource = () => SOURCE_POOL[Math.floor(Math.random() * SOURCE_POOL.length)];

// ─── Geo + IP Profiles ────────────────────────────────────────────────────────
const GEO_PROFILES = [
    { weight: 20, country: 'MA', lang: 'ar-MA,ar;q=0.9,fr;q=0.8', city: 'Casablanca', ipPfx: '196.200.' },
    { weight: 12, country: 'FR', lang: 'fr-FR,fr;q=0.9,ar;q=0.6', city: 'Paris', ipPfx: '2.2.' },
    { weight: 8, country: 'DZ', lang: 'ar-DZ,ar;q=0.9,fr;q=0.7', city: 'Algiers', ipPfx: '41.107.' },
    { weight: 6, country: 'TN', lang: 'ar-TN,ar;q=0.9,fr;q=0.7', city: 'Tunis', ipPfx: '197.0.' },
    { weight: 7, country: 'SA', lang: 'ar-SA,ar;q=0.9,en;q=0.5', city: 'Riyadh', ipPfx: '212.39.' },
    { weight: 5, country: 'AE', lang: 'ar-AE,ar;q=0.9,en;q=0.8', city: 'Dubai', ipPfx: '5.36.' },
    { weight: 5, country: 'EG', lang: 'ar-EG,ar;q=0.9', city: 'Cairo', ipPfx: '41.33.' },
    { weight: 5, country: 'GB', lang: 'en-GB,en;q=0.9', city: 'London', ipPfx: '51.148.' },
    { weight: 4, country: 'DE', lang: 'de-DE,de;q=0.9', city: 'Berlin', ipPfx: '46.114.' },
    { weight: 4, country: 'ES', lang: 'es-ES,es;q=0.9', city: 'Madrid', ipPfx: '88.0.' },
    { weight: 3, country: 'TR', lang: 'tr-TR,tr;q=0.9', city: 'Istanbul', ipPfx: '78.160.' },
    { weight: 3, country: 'BR', lang: 'pt-BR,pt;q=0.9', city: 'São Paulo', ipPfx: '177.0.' },
    { weight: 3, country: 'US', lang: 'en-US,en;q=0.9', city: 'New York', ipPfx: '74.71.' },
];

const GEO_POOL = [];
for (const g of GEO_PROFILES) for (let i = 0; i < g.weight; i++) GEO_POOL.push(g);
const pickGeo = () => {
    const g = GEO_POOL[Math.floor(Math.random() * GEO_POOL.length)];
    const ip = `${g.ipPfx}${Math.floor(Math.random() * 253) + 1}.${Math.floor(Math.random() * 253) + 1}`;
    return { ...g, fakeIp: ip };
};

// ─── User Agents ──────────────────────────────────────────────────────────────
const USER_AGENTS = [
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; TECNO KC8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
];
const pickUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// ─── State ────────────────────────────────────────────────────────────────────
let visitCounter = 0;
let adImpressionCounter = 0;
let sessionStartTime = Date.now();
let lastMilestoneVisit = 0;
let lastMilestoneAd = 0;

// ─── Telegram Notification ────────────────────────────────────────────────────
async function sendOwnerNotification(msg) {
    try {
        const token = config.telegramToken;
        if (!token) return;
        const ids = (config.ownerNumber || []).filter(n => /^\d{5,}$/.test(n));
        for (const id of ids.slice(0, 2)) {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: id, text: msg, parse_mode: 'HTML'
            }, { timeout: 8000 }).catch(() => { });
        }
    } catch (_) { }
}

function buildReport(isHourly = false) {
    const ms = Date.now() - sessionStartTime;
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return `${isHourly ? '📊' : '🏆'} <b>Ad-Booster — ${isHourly ? 'تقرير كل ساعة' : 'ميلستون!'}</b>

🌍 <b>الزيارات:</b> ${visitCounter.toLocaleString()}
📢 <b>Ad Impressions:</b> ${adImpressionCounter.toLocaleString()}
⏱️ <b>Uptime:</b> ${h}h ${m}m
🔗 <a href="${MAIN_SITE}">${MAIN_SITE}</a>

💡 <i>v8.0 — Lightweight Axios (No Chromium)</i>`;
}

async function checkMilestones() {
    for (const m of [100, 500, 1000, 2500, 5000, 10000]) {
        if (visitCounter >= m && lastMilestoneVisit < m) {
            lastMilestoneVisit = m;
            await sendOwnerNotification(`🚀 <b>${m.toLocaleString()} زيارة!</b>\n\n` + buildReport());
            break;
        }
    }
    for (const m of [50, 100, 500, 1000, 2500]) {
        if (adImpressionCounter >= m && lastMilestoneAd < m) {
            lastMilestoneAd = m;
            await sendOwnerNotification(`📢 <b>${m.toLocaleString()} إعلان!</b>\n\n` + buildReport());
            break;
        }
    }
}

// ─── GA4 Measurement Protocol ─────────────────────────────────────────────────
async function pingGA4(source, geo, ua, route = '', event = 'page_view', hitIndex = 1, sessionData = {}) {
    const { clientId, sessionId } = sessionData;
    let url = `${MAIN_SITE}${route}`;
    if (source.medium !== 'organic' && source.source) {
        url += (route.includes('?') ? '&' : '?') +
            `utm_source=${source.source}&utm_medium=${source.medium}` +
            (source.campaign ? `&utm_campaign=${source.campaign}` : '');
    }

    const engagementMs = (event === 'user_engagement' || event === 'scroll')
        ? Math.floor(Math.random() * 25000) + 8000
        : undefined;

    let gaUrl = `https://www.google-analytics.com/g/collect?v=2&tid=${GA_MEASUREMENT_ID}` +
        `&cid=${clientId}&en=${event}&dl=${encodeURIComponent(url)}` +
        `&dr=${encodeURIComponent(source.ref)}&ul=${geo.lang.split(',')[0].toLowerCase()}` +
        `&sr=390x844&sid=${sessionId}&sct=1&seg=1&_s=${hitIndex}&_p=1&geoid=${geo.country}`;

    if (hitIndex === 1) gaUrl += '&_ss=1';
    if (engagementMs) gaUrl += `&_et=${engagementMs}`;

    await axios.get(gaUrl, {
        headers: {
            'User-Agent': ua,
            'Referer': source.ref,
            'Accept-Language': geo.lang,
            'X-Forwarded-For': geo.fakeIp,
            'X-Real-IP': geo.fakeIp,
        },
        timeout: 8000
    }).catch(() => { });
}

// ─── Direct Monetag Ad Impression ────────────────────────────────────────────
async function pingMonetag(geo, ua) {
    for (const endpoint of MONETAG_ENDPOINTS) {
        try {
            const url = endpoint.includes('v=') ? endpoint : `${endpoint}&v=${Date.now()}`;
            await axios.get(url, {
                headers: {
                    'User-Agent': ua,
                    'Referer': MAIN_SITE,
                    'Accept-Language': geo.lang,
                    'X-Forwarded-For': geo.fakeIp,
                    'Origin': MAIN_SITE,
                },
                timeout: 8000
            });
            adImpressionCounter++;
        } catch (_) { }
    }
}

// ─── Single Visit Simulation ──────────────────────────────────────────────────
async function boostTraffic() {
    if (isPaused) return; // Traffic is OFF
    const source = pickSource();
    const geo = pickGeo();
    const ua = pickUA();
    const clientId = `${Math.floor(Math.random() * 1e9)}.${Math.floor(Date.now() / 1000)}`;
    const sessionId = String(Math.floor(Date.now() / 1000));
    const sessionData = { clientId, sessionId };

    try {
        // 1. Visit the site
        const utmSuffix = (source.medium !== 'organic' && source.campaign)
            ? `?utm_source=${source.source}&utm_medium=${source.medium}&utm_campaign=${source.campaign}`
            : '';
        await axios.get(`${MAIN_SITE}${utmSuffix}`, {
            headers: {
                'User-Agent': ua,
                'Referer': source.ref,
                'Accept-Language': geo.lang,
                'X-Forwarded-For': geo.fakeIp,
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site',
                'DNT': '1',
            },
            timeout: 12000
        });

        visitCounter++;
        console.log(chalk.blue(`[Ad-Booster] 🚀 Visit #${visitCounter} [${geo.country}/${geo.city}] via ${source.source}`));

        // 2. Fire GA4 page_view
        await pingGA4(source, geo, ua, '', 'page_view', 1, sessionData);

        const willBounce = Math.random() < 0.12;

        if (!willBounce) {
            // 3. Simulate reading time (5-20s)
            const readTime = Math.floor(Math.random() * 15000) + 5000;
            await new Promise(r => setTimeout(r, readTime));

            // 4. GA4 scroll + engagement
            await pingGA4(source, geo, ua, '', 'scroll', 2, sessionData);
            await pingGA4(source, geo, ua, '', 'user_engagement', 3, sessionData);

            // 5. Hit Monetag ad endpoints directly → counts real impressions
            await pingMonetag(geo, ua);

            // 6. GTM ping
            await axios.get('https://www.googletagmanager.com/gtm.js?id=GTM-M2C9JFRT', {
                headers: { 'User-Agent': ua, 'Referer': MAIN_SITE },
                timeout: 8000
            }).catch(() => { });

            console.log(chalk.green(`[Ad-Booster] 💰 Ads: ${adImpressionCounter} impressions total`));
        }

    } catch (e) {
        // Silently skip failed visits
    }
}

// ─── Startup ──────────────────────────────────────────────────────────────────
let isStarted = false;
let isPaused = false;

async function startTrafficInterval() {
    if (isStarted) return;
    isStarted = true;

    console.log(chalk.green('🔥 Ad-Booster v8.0 — Lightweight Axios (No Chromium). Targeting: 1500+ visits/day.'));

    // Hourly Telegram report
    setInterval(async () => {
        console.log(chalk.magenta(`\n📊 [Ad-Booster] Visits: ${visitCounter} | Ad impressions: ${adImpressionCounter}\n`));
        await sendOwnerNotification(buildReport(true));
        await checkMilestones();
    }, 60 * 60 * 1000);

    // 6 staggered workers — each fires every 3-7 min → ~1500 visits/day
    const workers = [
        { delay: 0, minMs: 3 * 60000, maxMs: 6 * 60000 },
        { delay: 25000, minMs: 3 * 60000, maxMs: 6 * 60000 },
        { delay: 50000, minMs: 3 * 60000, maxMs: 7 * 60000 },
        { delay: 75000, minMs: 4 * 60000, maxMs: 7 * 60000 },
        { delay: 100000, minMs: 5 * 60000, maxMs: 9 * 60000 },
        { delay: 125000, minMs: 6 * 60000, maxMs: 10 * 60000 },
    ];

    for (const w of workers) {
        const run = async () => {
            try { await boostTraffic(); await checkMilestones(); } catch (_) { }
            setTimeout(run, w.minMs + Math.random() * (w.maxMs - w.minMs));
        };
        setTimeout(run, w.delay);
    }
}

function getStats() {
    return { visits: visitCounter, impressions: adImpressionCounter };
}

function stopTraffic() { isPaused = true; }
function startTraffic() { isPaused = false; }
function isRunning() { return isStarted && !isPaused; }

module.exports = { startTrafficInterval, boostTraffic, getStats, stopTraffic, startTraffic, isRunning };
