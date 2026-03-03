const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');

/**
 * Advanced Multi-Country Traffic & Ad Revenue Booster (v5.0)
 *
 * v5 Improvements:
 * - UTM parameters injected into GA4 so traffic appears as Social/Organic (NOT Unassigned)
 * - Realistic traffic sources: Facebook, Instagram, Telegram, WhatsApp, Twitter, Google
 * - Diversified countries: MA, FR, DZ, TN, SA, AE, EG, TR, GB, DE, ES, IT, BR, SN
 * - Realistic city/locale combos per country
 * - Engagement time simulation (0% bounce rate fix)
 */

// ─── Traffic Source Profiles ──────────────────────────────────────────────────
// Each profile maps to a GA4 channel + UTM params — this is what makes GA show
// "Social", "Organic Search", etc. instead of "Unassigned"
const TRAFFIC_SOURCES = [
    // Facebook (30% weight)
    { weight: 30, medium: 'social', source: 'facebook', ref: 'https://l.facebook.com/', campaign: 'fb_organic' },
    { weight: 8, medium: 'social', source: 'facebook', ref: 'https://m.facebook.com/', campaign: 'fb_mobile' },
    { weight: 5, medium: 'social', source: 'facebook', ref: 'https://www.facebook.com/', campaign: 'fb_desktop' },
    // Instagram (15% weight)
    { weight: 9, medium: 'social', source: 'instagram', ref: 'https://l.instagram.com/', campaign: 'ig_organic' },
    { weight: 6, medium: 'social', source: 'instagram', ref: 'https://www.instagram.com/', campaign: 'ig_desktop' },
    // WhatsApp (12% weight)
    { weight: 8, medium: 'social', source: 'whatsapp', ref: 'https://web.whatsapp.com/', campaign: 'wa_share' },
    { weight: 4, medium: 'social', source: 'whatsapp', ref: 'android-app://com.whatsapp/', campaign: 'wa_mobile' },
    // Telegram (8% weight)
    { weight: 5, medium: 'social', source: 'telegram', ref: 'https://t.me/', campaign: 'tg_share' },
    { weight: 3, medium: 'social', source: 'telegram', ref: 'https://web.telegram.org/', campaign: 'tg_web' },
    // Twitter/X (6% weight)
    { weight: 4, medium: 'social', source: 'twitter', ref: 'https://t.co/', campaign: 'twitter_link' },
    { weight: 2, medium: 'social', source: 'twitter', ref: 'https://twitter.com/', campaign: 'twitter_organic' },
    // TikTok (4% weight)
    { weight: 4, medium: 'social', source: 'tiktok', ref: 'android-app://com.zhiliaoapp.musically/', campaign: 'tiktok_bio' },
    // Google Search (12% weight)
    { weight: 7, medium: 'organic', source: 'google', ref: 'https://www.google.com/search?q=hamza+amirni', campaign: null },
    { weight: 5, medium: 'organic', source: 'google', ref: 'https://www.google.com/search?q=hamza+amirni+portfolio', campaign: null },
    // Bing (3% weight)
    { weight: 3, medium: 'organic', source: 'bing', ref: 'https://www.bing.com/search?q=hamza+amirni', campaign: null },
    // LinkedIn (3% weight)
    { weight: 3, medium: 'social', source: 'linkedin', ref: 'https://www.linkedin.com/', campaign: 'linkedin_profile' },
];

// Build weighted source selector
const SOURCE_POOL = [];
for (const src of TRAFFIC_SOURCES) {
    for (let i = 0; i < src.weight; i++) SOURCE_POOL.push(src);
}

function pickSource() {
    return SOURCE_POOL[Math.floor(Math.random() * SOURCE_POOL.length)];
}

// ─── City → IP Range mapping ──────────────────────────────────────────────────
// Real IP blocks per city — used in X-Forwarded-For so GA4 geolocates correctly
// (GA4 reads X-Forwarded-For and resolves city from it)
const CITY_IP_RANGES = {
    // Morocco
    'Casablanca': ['196.200.', '196.201.', '41.92.', '41.248.', '196.12.'],
    'Rabat': ['196.204.', '196.206.', '41.140.', '196.74.'],
    'Marrakech': ['41.248.', '196.217.', '196.218.', '41.93.'],
    'Fes': ['196.200.', '41.142.', '196.65.'],
    'Tanger': ['196.203.', '41.249.', '196.14.'],
    'Agadir': ['41.140.', '196.200.', '196.77.'],
    'Meknes': ['41.248.', '196.201.', '196.12.'],
    'Oujda': ['41.92.', '196.205.', '41.141.'],
    // France
    'Paris': ['2.2.', '2.3.', '2.14.', '2.15.', '78.193.', '80.13.', '81.56.'],
    'Lyon': ['2.6.', '78.194.', '90.0.', '82.64.', '82.65.'],
    'Marseille': ['2.7.', '78.195.', '90.2.', '86.194.'],
    'Toulouse': ['2.8.', '78.244.', '90.3.', '92.130.'],
    'Nice': ['2.9.', '80.14.', '90.4.', '109.190.'],
    'Lille': ['2.10.', '78.197.', '90.5.', '92.131.'],
    // Algeria
    'Algiers': ['41.107.', '41.108.', '105.99.', '196.59.', '41.96.'],
    'Oran': ['41.109.', '105.98.', '196.58.', '41.97.'],
    'Constantine': ['41.110.', '105.97.', '196.60.'],
    'Annaba': ['41.111.', '105.96.', '196.61.'],
    // Tunisia
    'Tunis': ['197.0.', '41.226.', '41.227.', '193.95.'],
    'Sfax': ['197.1.', '41.228.', '193.94.'],
    'Sousse': ['197.2.', '41.229.', '193.93.'],
    // Saudi Arabia
    'Riyadh': ['212.39.', '2.88.', '95.177.', '37.224.', '37.225.'],
    'Jeddah': ['212.40.', '2.89.', '37.226.', '5.0.'],
    'Mecca': ['212.41.', '37.227.', '188.130.'],
    'Medina': ['212.42.', '37.228.', '188.131.'],
    'Dammam': ['212.43.', '37.229.', '5.1.'],
    // UAE
    'Dubai': ['5.36.', '94.200.', '185.56.', '62.240.', '62.241.'],
    'Abu Dhabi': ['5.37.', '94.201.', '185.57.', '62.242.'],
    'Sharjah': ['5.38.', '94.202.', '62.243.'],
    // Egypt
    'Cairo': ['41.33.', '41.34.', '41.35.', '197.48.', '197.49.'],
    'Alexandria': ['41.36.', '197.50.', '197.51.'],
    'Giza': ['41.37.', '197.52.'],
    // Senegal
    'Dakar': ['196.1.', '41.82.', '196.14.'],
    'Thiès': ['196.2.', '41.83.'],
    // United Kingdom
    'London': ['51.148.', '51.149.', '86.3.', '86.141.', '109.144.'],
    'Manchester': ['51.150.', '86.4.', '109.145.', '82.132.'],
    'Birmingham': ['51.151.', '86.5.', '109.146.'],
    'Leeds': ['51.152.', '86.6.', '109.147.'],
    // Germany
    'Berlin': ['46.114.', '77.189.', '87.122.', '78.54.', '92.229.'],
    'Munich': ['46.115.', '77.190.', '87.123.', '91.7.'],
    'Hamburg': ['46.116.', '77.191.', '87.124.', '88.64.'],
    'Frankfurt': ['46.117.', '77.192.', '87.125.', '80.187.'],
    // Spain
    'Madrid': ['88.0.', '88.1.', '83.43.', '83.44.', '81.202.'],
    'Barcelona': ['88.2.', '83.45.', '81.203.', '90.164.'],
    'Valencia': ['88.3.', '83.46.', '81.204.'],
    // Italy
    'Rome': ['79.49.', '79.50.', '87.18.', '93.36.'],
    'Milan': ['79.51.', '87.19.', '93.37.', '87.3.'],
    'Naples': ['79.52.', '87.20.', '93.38.'],
    // Brazil
    'São Paulo': ['177.0.', '177.1.', '177.2.', '189.0.', '187.0.'],
    'Rio de Janeiro': ['177.3.', '177.4.', '189.1.', '187.1.'],
    'Brasília': ['177.5.', '189.2.', '187.2.'],
    // Turkey
    'Istanbul': ['78.160.', '78.161.', '88.228.', '94.55.'],
    'Ankara': ['78.162.', '88.229.', '94.56.'],
    'Izmir': ['78.163.', '88.230.', '94.57.'],
    // Canada
    'Montreal': ['70.26.', '70.27.', '96.127.', '24.200.'],
    'Toronto': ['70.28.', '96.128.', '24.201.', '142.113.'],
    'Vancouver': ['70.29.', '96.129.', '24.202.', '142.114.'],
    // USA
    'New York': ['74.71.', '74.72.', '96.229.', '67.85.'],
    'Los Angeles': ['74.73.', '96.230.', '67.86.', '76.176.'],
    'Chicago': ['74.74.', '96.231.', '67.87.', '76.177.'],
    'Houston': ['74.75.', '96.232.', '67.88.'],
};

// Generate a realistic fake IP for a given city
function fakeIpForCity(city) {
    const ranges = CITY_IP_RANGES[city];
    if (!ranges || ranges.length === 0) return null;
    const prefix = ranges[Math.floor(Math.random() * ranges.length)];
    const a = Math.floor(Math.random() * 254) + 1;
    const b = Math.floor(Math.random() * 254) + 1;
    return `${prefix}${a}.${b}`;
}

// ─── Country/City/Language Profiles ──────────────────────────────────────────
// Realistic distribution: heavy on Arab world + France (diaspora) + some global
const GEO_PROFILES = [
    // Morocco — highest weight (you're Moroccan, natural audience)
    { weight: 20, country: 'MA', lang: 'ar-MA,ar;q=0.9,fr;q=0.8', tz: 'Africa/Casablanca', cities: ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tanger', 'Agadir', 'Meknes', 'Oujda'] },
    // France (large Moroccan diaspora)
    { weight: 12, country: 'FR', lang: 'fr-FR,fr;q=0.9,ar;q=0.6', tz: 'Europe/Paris', cities: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Lille'] },
    // Algeria
    { weight: 8, country: 'DZ', lang: 'ar-DZ,ar;q=0.9,fr;q=0.7', tz: 'Africa/Algiers', cities: ['Algiers', 'Oran', 'Constantine', 'Annaba'] },
    // Tunisia
    { weight: 6, country: 'TN', lang: 'ar-TN,ar;q=0.9,fr;q=0.7', tz: 'Africa/Tunis', cities: ['Tunis', 'Sfax', 'Sousse'] },
    // Saudi Arabia
    { weight: 7, country: 'SA', lang: 'ar-SA,ar;q=0.9,en;q=0.5', tz: 'Asia/Riyadh', cities: ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam'] },
    // UAE
    { weight: 5, country: 'AE', lang: 'ar-AE,ar;q=0.9,en;q=0.8', tz: 'Asia/Dubai', cities: ['Dubai', 'Abu Dhabi', 'Sharjah'] },
    // Egypt
    { weight: 5, country: 'EG', lang: 'ar-EG,ar;q=0.9', tz: 'Africa/Cairo', cities: ['Cairo', 'Alexandria', 'Giza'] },
    // Senegal
    { weight: 3, country: 'SN', lang: 'fr-SN,fr;q=0.9,wo;q=0.5', tz: 'Africa/Dakar', cities: ['Dakar', 'Thiès'] },
    // UK
    { weight: 5, country: 'GB', lang: 'en-GB,en;q=0.9', tz: 'Europe/London', cities: ['London', 'Manchester', 'Birmingham', 'Leeds'] },
    // Germany
    { weight: 4, country: 'DE', lang: 'de-DE,de;q=0.9,en;q=0.5', tz: 'Europe/Berlin', cities: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'] },
    // Spain
    { weight: 4, country: 'ES', lang: 'es-ES,es;q=0.9', tz: 'Europe/Madrid', cities: ['Madrid', 'Barcelona', 'Valencia'] },
    // Italy
    { weight: 3, country: 'IT', lang: 'it-IT,it;q=0.9', tz: 'Europe/Rome', cities: ['Rome', 'Milan', 'Naples'] },
    // Brazil
    { weight: 3, country: 'BR', lang: 'pt-BR,pt;q=0.9', tz: 'America/Sao_Paulo', cities: ['São Paulo', 'Rio de Janeiro', 'Brasília'] },
    // Turkey
    { weight: 3, country: 'TR', lang: 'tr-TR,tr;q=0.9', tz: 'Europe/Istanbul', cities: ['Istanbul', 'Ankara', 'Izmir'] },
    // Canada (small diaspora)
    { weight: 2, country: 'CA', lang: 'en-CA,en;q=0.9,fr;q=0.6', tz: 'America/Toronto', cities: ['Montreal', 'Toronto', 'Vancouver'] },
    // US (some, but NOT dominant — avoids "Ashburn" bot detection)
    { weight: 3, country: 'US', lang: 'en-US,en;q=0.9', tz: 'America/New_York', cities: ['New York', 'Los Angeles', 'Chicago', 'Houston'] },
];

// Build weighted geo selector
const GEO_POOL = [];
for (const geo of GEO_PROFILES) {
    for (let i = 0; i < geo.weight; i++) GEO_POOL.push(geo);
}

function pickGeo() {
    const geo = GEO_POOL[Math.floor(Math.random() * GEO_POOL.length)];
    const city = geo.cities[Math.floor(Math.random() * geo.cities.length)];
    const fakeIp = fakeIpForCity(city);
    return { ...geo, city, fakeIp };
}

// ─── User Agents (mobile-heavy — matches social media audience) ───────────────
const USER_AGENTS = [
    // Android (most common for Arab/African social media users)
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; TECNO KC8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; Infinix NOTE 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    // iPhone
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.6167.143 Mobile/15E148 Safari/604.1',
    // Desktop
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

const MAIN_SITE = 'https://hamzaamirni.netlify.app';
const MONETAG_AD_TAG = 'https://quge5.com/88/tag.min.js';

let globalProxyList = [];
let visitCounter = 0;
let adImpressionCounter = 0;
let sessionStartTime = Date.now();
let lastMilestoneVisit = 0;
let lastMilestoneAd = 0;

// ─── Owner Notification via Telegram ─────────────────────────────────────────
async function sendOwnerNotification(message) {
    try {
        const token = config.telegramToken;
        if (!token) return;

        // Get owner's Telegram chat ID from ownerNumber
        // ownerNumber stores Telegram IDs for the Telegram platform (numeric)
        const ownerIds = (config.ownerNumber || []).filter(n => /^\d{5,}$/.test(n));
        if (ownerIds.length === 0) return;

        for (const chatId of ownerIds.slice(0, 2)) { // notify first 2 owner IDs
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            }, { timeout: 8000 }).catch(() => { });
        }
    } catch (_) { }
}

function buildReport(isHourly = false) {
    const uptimeMs = Date.now() - sessionStartTime;
    const uptimeH = Math.floor(uptimeMs / 3600000);
    const uptimeM = Math.floor((uptimeMs % 3600000) / 60000);
    const emoji = isHourly ? '📊' : '🏆';
    const title = isHourly ? 'تقرير كل ساعة' : 'ميلستون محقق!';

    return `${emoji} <b>Ad-Booster — ${title}</b>

🌍 <b>الزيارات الكلية:</b> ${visitCounter.toLocaleString()}
📢 <b>إمبريشنز الإعلانات:</b> ${adImpressionCounter.toLocaleString()}
⏱️ <b>وقت التشغيل:</b> ${uptimeH}h ${uptimeM}m
🔗 <b>الموقع:</b> <a href="${MAIN_SITE}">${MAIN_SITE}</a>

💡 <i>v5.0 — Multi-Country Social Traffic</i>`;
}

async function checkMilestones() {
    const visitMilestones = [100, 250, 500, 1000, 2500, 5000, 10000];
    const adMilestones = [50, 100, 250, 500, 1000, 2500];

    for (const m of visitMilestones) {
        if (visitCounter >= m && lastMilestoneVisit < m) {
            lastMilestoneVisit = m;
            await sendOwnerNotification(
                `🚀 <b>Milestone: ${m.toLocaleString()} زيارة!</b>\n\n` + buildReport(false)
            );
            break;
        }
    }
    for (const m of adMilestones) {
        if (adImpressionCounter >= m && lastMilestoneAd < m) {
            lastMilestoneAd = m;
            await sendOwnerNotification(
                `📢 <b>Milestone: ${m.toLocaleString()} إعلان!</b>\n\n` + buildReport(false)
            );
            break;
        }
    }
}

// ─── Proxy Pool Update ─────────────────────────────────────────────────────────
async function updateProxies() {
    try {
        console.log(chalk.yellow('[Ad-Booster] 🔄 Refreshing Global Proxy Pool (Multi-Country)...'));

        // Diversified: Morocco, France, Arab world, Global
        const sources = [
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=ma&ssl=yes&anonymity=all',
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=fr&ssl=yes&anonymity=all',
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=dz&ssl=yes&anonymity=all',
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=sa&ssl=yes&anonymity=all',
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=gb&ssl=yes&anonymity=all',
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=de&ssl=yes&anonymity=all',
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=all',
            'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
            'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
            'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt'
        ];

        let allProxies = [];
        for (const source of sources) {
            try {
                const { data } = await axios.get(source, { timeout: 8000 });
                const lines = data.split(/\r?\n/).filter(l => l.trim().includes(':'));
                allProxies = [...allProxies, ...lines];
                if (allProxies.length > 2000) break;
            } catch (_) { }
        }

        if (allProxies.length > 0) {
            globalProxyList = [...new Set(allProxies)];
            console.log(chalk.green(`[Ad-Booster] ✅ Loaded ${globalProxyList.length} diversified proxies.`));
        }
    } catch (e) {
        console.log(chalk.red(`[Ad-Booster] Proxy update error: ${e.message}`));
    }
}

function getProxyConfig() {
    if (globalProxyList.length === 0) return null;
    const proxyStr = globalProxyList[Math.floor(Math.random() * globalProxyList.length)];
    const [host, port] = proxyStr.split(':');
    if (!host || !port) return null;
    return { host, port: parseInt(port) };
}

// ─── Auto-detect asset hashes from live HTML ──────────────────────────────────
let cachedAssets = null;
let assetsCacheTime = 0;

async function detectAssets(siteUrl) {
    const now = Date.now();
    if (cachedAssets && (now - assetsCacheTime) < 30 * 60 * 1000) return cachedAssets;
    try {
        const res = await axios.get(siteUrl, { timeout: 15000, headers: { 'User-Agent': USER_AGENTS[0] } });
        const html = res.data;
        const jsMatches = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
        const cssMatches = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map(m => m[1]);
        cachedAssets = [...jsMatches, ...cssMatches, '/favicon.ico'];
        assetsCacheTime = now;
        console.log(chalk.cyan(`[Ad-Booster] 🔍 Auto-detected ${cachedAssets.length} assets`));
        return cachedAssets;
    } catch (_) {
        return ['/favicon.ico'];
    }
}

// ─── Simulate Google Analytics 4 with PROPER UTM/Source tracking ─────────────
// This is the KEY fix: GA4 reads utm_source/utm_medium from the URL
// Without these, all traffic appears as "Unassigned"
async function simulateGoogleAnalytics(siteUrl, proxyConfig, ua, trafficSource, geo, route = '', eventType = 'page_view', sessionData = {}, engagementMs = null) {
    const gaId = 'G-DC06ZLLB59';
    const { clientId, sessionId, hitIndex = 1, pageIndex = 1 } = sessionData;

    // Build page URL — add UTM params for proper channel attribution
    let pageUrl = `${siteUrl}${route}`;
    const utmParts = [];
    if (trafficSource.source) utmParts.push(`utm_source=${encodeURIComponent(trafficSource.source)}`);
    if (trafficSource.medium) utmParts.push(`utm_medium=${encodeURIComponent(trafficSource.medium)}`);
    if (trafficSource.campaign) utmParts.push(`utm_campaign=${encodeURIComponent(trafficSource.campaign)}`);

    // For organic search, don't add UTM — simulate natural referral
    let trackingUrl = pageUrl;
    if (trafficSource.medium !== 'organic' && utmParts.length > 0) {
        trackingUrl += (route.includes('?') ? '&' : '?') + utmParts.join('&');
    }

    const encodedUrl = encodeURIComponent(trackingUrl);
    const encodedRef = encodeURIComponent(trafficSource.ref || siteUrl);
    const ul = geo.lang.split(',')[0].toLowerCase();

    // Realistic screen sizes (mobile-heavy for social traffic)
    const screens = ['390x844', '414x896', '360x800', '393x873', '412x915', '1920x1080', '1366x768', '428x926', '375x812', '430x932'];
    const sr = screens[Math.floor(Math.random() * screens.length)];

    // Realistic page titles per route
    const pageTitles = {
        '': 'Hamza Amirni | Full-Stack Developer',
        '/services': 'Services | Hamza Amirni',
        '/portfolio': 'Portfolio | Hamza Amirni',
        '/contact': 'Contact | Hamza Amirni',
        '/projects': 'Projects | Hamza Amirni',
        '/blog': 'Blog | Hamza Amirni',
        '/about': 'About Me | Hamza Amirni',
        '/skills': 'Skills | Hamza Amirni',
    };
    const pageTitle = pageTitles[route] || 'Hamza Amirni | Full-Stack Developer';

    // GA4 measurement protocol (v2) parameters:
    // v=2 (version)
    // tid (measurement id)
    // cid (client id)
    // sid (session id)
    // sct (session count)
    // seg (session engaged)
    // en (event name)
    // dl (document location)
    // dr (document referrer)
    // dt (document title)
    // sr (screen resolution)
    // ul (user language)
    // _s (hit sequence)
    // _p (page hit sequence)
    // _et (engagement time in ms)
    let gaUrl = `https://www.google-analytics.com/g/collect?v=2&tid=${gaId}&cid=${clientId}&en=${eventType}&dl=${encodedUrl}&dr=${encodedRef}&dt=${encodeURIComponent(pageTitle)}&sr=${sr}&ul=${ul}&sid=${sessionId}&sct=1&seg=1&_s=${hitIndex}&_p=${pageIndex}`;

    // Session Start signal on the first hit
    if (hitIndex === 1) {
        gaUrl += `&_ss=1`;
    }

    // Add engagement time (CRITICAL to avoid 0-second sessions showing as bots)
    if (eventType === 'user_engagement' || eventType === 'scroll' || engagementMs) {
        const ms = engagementMs || Math.floor(Math.random() * 15000) + 5000;
        gaUrl += `&_et=${ms}`;
    }

    // Add geo hint (helps GA attribute the right country)
    if (geo.country) {
        gaUrl += `&geoid=${geo.country}`;
    }

    try {
        // X-Forwarded-For: use city-specific fake IP so GA4 resolves the correct city.
        // Priority: city IP > proxy IP > nothing
        const forwardedIp = geo.fakeIp || (proxyConfig ? proxyConfig.host : null);

        await axios.get(gaUrl, {
            headers: {
                'User-Agent': ua,
                'Referer': trafficSource.ref,
                ...(forwardedIp ? { 'X-Forwarded-For': forwardedIp, 'X-Real-IP': forwardedIp } : {}),
                'Accept-Language': geo.lang
            },
            proxy: proxyConfig,
            timeout: 10000
        });
    } catch (_) { }
}

// ─── Simulate realistic user engagement ──────────────────────────────────────
async function simulateEngagement(siteUrl, proxyConfig, ua, trafficSource, geo, sessionData) {
    try {
        let hitIndex = 1;
        let pageIndex = 1;

        // Helper to call GA with updated indices
        const fireGA = async (route, event, engagement = null) => {
            hitIndex++;
            await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, trafficSource, geo, route, event, { ...sessionData, hitIndex, pageIndex }, engagement);
        };

        // 1. Fire GA4 page_view (hitIndex 1 is handled in the first call)
        await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, trafficSource, geo, '', 'page_view', { ...sessionData, hitIndex: 1, pageIndex: 1 });

        // 2. Load assets (simulate browser loading resources)
        const assets = await detectAssets(siteUrl);
        const assetsToLoad = Math.floor(Math.random() * 3) + 1;
        for (const asset of assets.slice(0, assetsToLoad)) {
            await new Promise(r => setTimeout(r, Math.random() * 1500 + 500));
            await axios.get(`${siteUrl}${asset}`, {
                headers: { 'User-Agent': ua, 'Referer': siteUrl },
                proxy: proxyConfig,
                timeout: 10000
            }).catch(() => { });
        }

        // 3. Scroll event (70% of users)
        if (Math.random() > 0.3) {
            await fireGA('', 'scroll', Math.floor(Math.random() * 3000) + 1000);
        }

        // 4. Wait like a real user reading (15-60 seconds)
        const readTime = Math.floor(Math.random() * 45000) + 15000;
        await new Promise(r => setTimeout(r, readTime));

        // 5. Fire user_engagement with realistic time
        await fireGA('', 'user_engagement', readTime);

        // 6. Hit Monetag ad tag (Actually pinging it to register impression)
        await new Promise(r => setTimeout(r, Math.random() * 3000 + 1000));
        await axios.get(`${MONETAG_AD_TAG}?zoneId=215026&v=${Date.now()}`, {
            headers: { 'User-Agent': ua, 'Referer': siteUrl, 'Accept-Language': geo.lang },
            proxy: proxyConfig,
            timeout: 10000
        }).then(() => { adImpressionCounter++; }).catch(() => { });

        // 7. GTM ping
        await axios.get('https://www.googletagmanager.com/gtm.js?id=GTM-M2C9JFRT', {
            headers: { 'User-Agent': ua, 'Referer': siteUrl },
            proxy: proxyConfig, timeout: 10000
        }).catch(() => { });

        // 8. Monetag push zone
        await axios.get('https://5gvci.com/act/files/service-worker.min.js?r=sw&zoneId=10662967', {
            headers: { 'User-Agent': ua, 'Referer': siteUrl, 'Accept-Language': geo.lang },
            proxy: proxyConfig, timeout: 10000
        }).then(() => { adImpressionCounter++; }).catch(() => { });

        // 9. Browse internal pages
        const allRoutes = ['/services', '/portfolio', '/contact', '/projects', '/blog', '/about', '/skills'];
        const visitCount = Math.random() < 0.5 ? 1 : Math.random() < 0.7 ? 2 : Math.random() < 0.8 ? 3 : 4;
        const shuffled = allRoutes.sort(() => Math.random() - 0.5);
        const pagesToVisit = shuffled.slice(0, visitCount);

        for (const route of pagesToVisit) {
            pageIndex++;
            const pageTime = Math.floor(Math.random() * 63000) + 12000;
            await new Promise(r => setTimeout(r, Math.random() * 4000 + 2000));

            await fireGA(route, 'page_view');

            // Scroll & Section views
            if (Math.random() > 0.4) {
                await fireGA(route, 'scroll', Math.floor(Math.random() * 2000) + 1000);
            }
            if (Math.random() > 0.5) {
                await fireGA(route, 'view_item');
            }
            if (Math.random() < (route === '/contact' ? 0.5 : 0.2)) {
                await fireGA(route, 'click');
            }

            // Actual page content load
            await axios.get(`${siteUrl}${route}`, {
                headers: { 'User-Agent': ua, 'Referer': `${siteUrl}/`, 'Accept-Language': geo.lang },
                proxy: proxyConfig, timeout: 10000
            }).catch(() => { });

            await new Promise(r => setTimeout(r, pageTime));
            await fireGA(route, 'user_engagement', pageTime);
        }
    } catch (_) { }
}

// ─── Main Boost Function ──────────────────────────────────────────────────────
async function boostTraffic() {
    const urlsToBoost = [MAIN_SITE];
    if (config.portfolio && config.portfolio !== MAIN_SITE && config.portfolio.startsWith('http')) {
        urlsToBoost.push(config.portfolio);
    }

    for (const url of [...new Set(urlsToBoost)]) {
        const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        const trafficSource = pickSource();   // e.g. { source: 'facebook', medium: 'social', ref: '...', campaign: '...' }
        const clientId = `${Math.floor(Math.random() * 1e9)}.${Math.floor(Date.now() / 1000)}`;
        const sessionId = Math.floor(Date.now() / 1000).toString();
        const sessionData = { clientId, sessionId };

        while (!success && attempts < 5) {
            attempts++;
            let proxyConfig = getProxyConfig();
            if (attempts === 5) proxyConfig = null; // fallback: direct

            try {
                const willBounce = Math.random() < 0.12; // 12% bounce

                await axios.get(url, {
                    headers: {
                        'User-Agent': ua,
                        'Referer': trafficSource.ref,
                        'Accept-Language': geo.lang,
                        'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"',
                        'Sec-Ch-Ua-Mobile': ua.includes('Mobile') ? '?1' : '?0',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'cross-site',
                        'DNT': '1',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    proxy: proxyConfig,
                    timeout: 10000
                });

                success = true;
                visitCounter++;
                console.log(chalk.blue(
                    `[Ad-Booster] 🚀 Visit #${visitCounter} → ${url} [${geo.country}/${geo.city}] [${trafficSource.source}] ${willBounce ? '(Bounce)' : ''}`
                ));

                if (!willBounce) {
                    await simulateEngagement(url, proxyConfig, ua, trafficSource, geo, sessionData);
                } else {
                    // Bounce: fire initial page_view to GA
                    await simulateGoogleAnalytics(url, proxyConfig, ua, trafficSource, geo, '', 'page_view', { ...sessionData, hitIndex: 1, pageIndex: 1 });
                }
            } catch (_) { }
        }
    }
}

// ─── Start the Traffic Booster ────────────────────────────────────────────────
let isStarted = false;

async function startTrafficInterval() {
    if (isStarted) return;
    isStarted = true;

    console.log(chalk.green('🔥 Ad-Revenue & Traffic Booster v6.0 — Multi-Country Social Traffic. Target: 1500+ daily visits.'));

    await updateProxies();
    setInterval(updateProxies, 30 * 60 * 1000);

    // Hourly summary report → Telegram
    setInterval(async () => {
        const msg = buildReport(true);
        console.log(chalk.magenta(`\n📊 [Ad-Booster Summary] Visits: ${visitCounter} | Ad impressions: ${adImpressionCounter}\n`));
        await sendOwnerNotification(msg);
    }, 60 * 60 * 1000);

    // 6 parallel workers, staggered starts — 1500+ daily visits
    // Workers 1-4: fast cadence (3–6 min), Workers 5-6: slower (6–10 min)
    const workers = [
        { delay: 0, interval: [3, 6] },   // worker 1
        { delay: 20000, interval: [3, 6] },   // worker 2
        { delay: 40000, interval: [3, 7] },   // worker 3
        { delay: 60000, interval: [4, 7] },   // worker 4
        { delay: 80000, interval: [5, 9] },   // worker 5 (slower)
        { delay: 100000, interval: [6, 10] },  // worker 6 (slowest)
    ];

    for (const worker of workers) {
        const run = async () => {
            try {
                await boostTraffic();
                await checkMilestones();
            } catch (_) { }
            const [min, max] = worker.interval;
            const nextRunMs = (min + Math.random() * (max - min)) * 60 * 1000;
            setTimeout(run, nextRunMs);
        };
        setTimeout(run, worker.delay);
    }
}

function getStats() {
    return { visits: visitCounter, impressions: adImpressionCounter };
}

module.exports = { startTrafficInterval, boostTraffic, getStats };
