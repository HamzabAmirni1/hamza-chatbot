const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');

/**
 * Advanced Multi-Country Traffic & Ad Revenue Booster (v4.0)
 *
 * Improvements over v3:
 * - Auto-detects current asset hashes (no more hardcoded file paths)
 * - More realistic visit intervals to avoid bot detection
 * - Monetag direct-link hitting for guaranteed impressions
 * - Persistent summary logging
 */

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.164 Mobile Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Edge/122.0.2365.66',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'
];

const LANGUAGES = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.8',
    'fr-FR,fr;q=0.9',
    'es-ES,es;q=0.9',
    'de-DE,de;q=0.9',
    'ar-MA,ar;q=0.9,en;q=0.8',
    'pt-BR,pt;q=0.9',
    'it-IT,it;q=0.9',
    'ru-RU,ru;q=0.9',
    'hi-IN,hi;q=0.9'
];

const REFERRERS = [
    'https://l.facebook.com/',
    'https://www.facebook.com/',
    'https://m.facebook.com/',
    'https://t.me/',
    'https://web.whatsapp.com/',
    'https://www.instagram.com/',
    'https://l.instagram.com/',
    'android-app://com.zhiliaoapp.musically/', // TikTok
    'https://www.google.com/search?q=hamza+amirni+portfolio',
    'https://www.google.com/search?q=full+stack+developer+morocco',
    'https://www.bing.com/search?q=hamza+amirni+projects',
    'https://duckduckgo.com/?q=hamza+amirni+netlify'
];

// ─── Monetag ad tag URL — update this if your tag changes ────────────────────
const MONETAG_AD_TAG = 'https://quge5.com/88/tag.min.js';
const MAIN_SITE = 'https://hamzaamirni.netlify.app';

let globalProxyList = [];
let visitCounter = 0;
let adImpressionCounter = 0;

// ─── Proxy Pool Update ────────────────────────────────────────────────────────
async function updateProxies() {
    try {
        console.log(chalk.yellow('[Ad-Booster] 🔄 Refreshing Global Proxy Pool (Heavy on US)...'));

        // Diversified sources: US specifically + Global
        const sources = [
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=us&ssl=yes&anonymity=all',
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=gb&ssl=yes&anonymity=all',
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=ca&ssl=yes&anonymity=all',
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

// ─── Build proxy config from pool ─────────────────────────────────────────────
function getProxyConfig() {
    if (globalProxyList.length === 0) return null;
    const proxyStr = globalProxyList[Math.floor(Math.random() * globalProxyList.length)];
    const [host, port] = proxyStr.split(':');
    if (!host || !port) return null;
    return { host, port: parseInt(port) };
}

// ─── Auto-detect asset hashes from live HTML ─────────────────────────────────
let cachedAssets = null;
let assetsCacheTime = 0;

async function detectAssets(siteUrl) {
    const now = Date.now();
    // Cache for 30 minutes to avoid fetching HTML every visit
    if (cachedAssets && (now - assetsCacheTime) < 30 * 60 * 1000) return cachedAssets;

    try {
        const res = await axios.get(siteUrl, { timeout: 15000, headers: { 'User-Agent': USER_AGENTS[0] } });
        const html = res.data;

        // Extract JS and CSS asset paths from the HTML
        const jsMatches = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
        const cssMatches = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map(m => m[1]);

        cachedAssets = [...jsMatches, ...cssMatches, '/favicon.ico'];
        assetsCacheTime = now;
        console.log(chalk.cyan(`[Ad-Booster] 🔍 Auto-detected ${cachedAssets.length} assets`));
        return cachedAssets;
    } catch (_) {
        // Fallback: return common static assets
        return ['/favicon.ico'];
    }
}

// ─── Simulate Google Analytics 4 Pixel ────────────────────────────────────────
async function simulateGoogleAnalytics(siteUrl, proxyConfig, ua, ref, route = '', isEngagement = false, lang = 'en-US', eventOverride = null) {
    const gaId = 'G-DC06ZLLB59';
    const clientId = Math.random().toString().substring(2, 12) + '.' + Math.random().toString().substring(2, 12);
    const sessionId = Date.now().toString();
    const encodedUrl = encodeURIComponent(`${siteUrl}${route}`);
    const encodedRef = encodeURIComponent(ref || siteUrl);

    let eventName = isEngagement ? 'user_engagement' : 'page_view';
    if (eventOverride) eventName = eventOverride;

    const ul = lang.split(',')[0].toLowerCase();

    // Randomize screen resolution for better stealth
    const resolutions = ['1920x1080', '1366x768', '1536x864', '1440x900', '1280x720', '390x844', '414x896'];
    const sr = resolutions[Math.floor(Math.random() * resolutions.length)];

    // Build the GA4 collect URL
    let gaUrl = `https://www.google-analytics.com/g/collect?v=2&tid=${gaId}&cid=${clientId}&en=${eventName}&dl=${encodedUrl}&dr=${encodedRef}&dt=${encodeURIComponent('Hamza Amirni')}&sr=${sr}&ul=${ul}&sid=${sessionId}&sct=1&seg=1`;

    if (eventName === 'user_engagement') {
        // Send a random engagement time between 15s to 45s
        gaUrl += `&epn.engagement_time_msec=${Math.floor(Math.random() * 30000) + 15000}`;
    }

    try {
        await axios.get(gaUrl, {
            headers: {
                'User-Agent': ua,
                'Referer': ref,
                'X-Forwarded-For': proxyConfig ? proxyConfig.host : undefined
            },
            proxy: proxyConfig,
            timeout: 10000
        });
    } catch (_) { }
}

// ─── Simulate realistic user engagement ──────────────────────────────────────
async function simulateEngagement(siteUrl, proxyConfig, ua, ref, lang = 'en-US') {
    try {
        // 0. Fire Google Analytics for the main page
        await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, ref, '', false, lang);

        // 1. Load assets (simulate actual browser loading page resources)
        const assets = await detectAssets(siteUrl);
        const assetsToLoad = Math.floor(Math.random() * 3) + 1; // Load 1 to 3 assets
        for (const asset of assets.slice(0, assetsToLoad)) {
            await new Promise(r => setTimeout(r, Math.random() * 1500 + 500));
            await axios.get(`${siteUrl}${asset}`, {
                headers: { 'User-Agent': ua, 'Referer': siteUrl },
                proxy: proxyConfig,
                timeout: 10000
            }).catch(() => { });
        }

        // 1.5 Simulate Scroll (only 75% of the time to look more human)
        if (Math.random() > 0.25) {
            await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, ref, '', false, lang, 'scroll');
        }

        // Wait a few seconds like a real user reading the screen
        await new Promise(r => setTimeout(r, Math.random() * 8000 + 5000));

        // Fire engagement hit
        await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, ref, '', true);

        // 2. Hit the Monetag ad tag directly — this is what counts as an impression
        await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));

        // Fire engagement hit
        await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, ref, '', true, lang);

        // Monetag Main Tag (Zone: 215026)
        await axios.get(`${MONETAG_AD_TAG}?zoneId=215026`, {
            headers: {
                'User-Agent': ua,
                'Referer': siteUrl,
                'Accept': '*/*',
                'Accept-Language': lang
            },
            proxy: proxyConfig,
            timeout: 10000
        }).then(() => {
            adImpressionCounter++;
        }).catch(() => { });

        // Google Tag Manager tracking ping
        await axios.get(`https://www.googletagmanager.com/gtm.js?id=GTM-M2C9JFRT`, {
            headers: { 'User-Agent': ua, 'Referer': siteUrl },
            proxy: proxyConfig,
            timeout: 10000
        }).catch(() => { });

        // 2.5 Hit the Monetag Push Notification Ad (Zone: 10662967, Domain: 5gvci.com)
        await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
        await axios.get('https://5gvci.com/act/files/service-worker.min.js?r=sw&zoneId=10662967', {
            headers: {
                'User-Agent': ua,
                'Referer': siteUrl,
                'Accept': '*/*',
                'Accept-Language': lang
            },
            proxy: proxyConfig,
            timeout: 10000
        }).then(() => {
            adImpressionCounter++; // Count push notification as another impression
        }).catch(() => { });

        // 3. Simulate browsing internal pages (React Router)
        const routes = ['/services', '/portfolio', '/contact', '/projects', '/blog'];
        const pagesToVisit = routes.filter(() => Math.random() > 0.4); // Visit ~60% of pages randomly

        for (const route of pagesToVisit) {
            // Wait 15-30 seconds per internal page to lower bounce rate and increase session duration
            await new Promise(r => setTimeout(r, Math.random() * 15000 + 15000));

            // Fire GA4 pixel for the internal route (referer is now the base siteUrl)
            await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, `${siteUrl}/`, route, false, lang);

            // Random interaction: Click (30% chance)
            if (Math.random() > 0.7) {
                await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, `${siteUrl}/`, route, false, lang, 'click');
            }

            await axios.get(`${siteUrl}${route}`, {
                headers: { 'User-Agent': ua, 'Referer': `${siteUrl}/`, 'Accept-Language': lang },
                proxy: proxyConfig,
                timeout: 10000
            }).catch(() => { });

            // GA4 Engagement ping for this internal route
            await new Promise(r => setTimeout(r, Math.random() * 6000 + 4000));
            await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, `${siteUrl}/`, route, true, lang);
        }
    } catch (_) { }
}

// ─── Main Boost Function ──────────────────────────────────────────────────────
async function boostTraffic() {
    const urlsToBoost = [MAIN_SITE];
    if (config.portfolio && config.portfolio !== MAIN_SITE && config.portfolio.startsWith('http')) {
        urlsToBoost.push(config.portfolio);
    }
    const uniqueUrls = [...new Set(urlsToBoost)];

    for (const url of uniqueUrls) {
        const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        const ref = REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
        const lang = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];

        let success = false;
        let attempts = 0;

        // Try up to 5 times. On the 5th attempt, force direct connection (proxy: null) to guarantee success.
        while (!success && attempts < 5) {
            attempts++;
            let proxyConfig = getProxyConfig();

            // Force direct connection on the last attempt to avoid 0 visits
            if (attempts === 5) {
                proxyConfig = null;
            }

            try {
                // 0. Bounce Chance (20% of users leave without interaction)
                const willBounce = Math.random() < 0.2;

                // 1. Visit main page
                await axios.get(url, {
                    headers: {
                        'User-Agent': ua,
                        'Referer': ref,
                        'Accept-Language': lang,
                        'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                        'Sec-Ch-Ua-Mobile': ua.includes('Mobile') ? '?1' : '?0',
                        'Sec-Ch-Ua-Platform': ua.includes('Windows') ? '"Windows"' : '"Android"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': (new URL(ref).hostname === new URL(url).hostname) ? 'same-origin' : 'cross-site',
                        'DNT': '1',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    proxy: proxyConfig,
                    timeout: 10000
                });

                success = true;
                visitCounter++;
                console.log(chalk.blue(`[Ad-Booster] 🚀 Visit #${visitCounter} → ${url} (${proxyConfig ? proxyConfig.host : 'Direct'}) [${lang.split(',')[0]}] ${willBounce ? '(Bounce)' : ''}`));

                if (!willBounce) {
                    // 2. Simulate engagement (assets + ad tag + routing) if the proxy works
                    await simulateEngagement(url, proxyConfig, ua, ref, lang);
                } else {
                    // Just one GA view if bouncing
                    await simulateGoogleAnalytics(url, proxyConfig, ua, ref, '', false, lang);
                }
            } catch (err) {
                // Dead proxy - loop will try the next one
            }
        }

        // If 5 proxies fail, we silently skip to avoid spamming the log
    }
}

// ─── Start the Traffic Booster ────────────────────────────────────────────────
let isStarted = false;

async function startTrafficInterval() {
    if (isStarted) return;
    isStarted = true;

    console.log(chalk.green('🔥 Ad-Revenue & Traffic Booster v4.0 Active. Target: 1000+ daily visits + Monetag impressions.'));

    // Load proxies immediately, then refresh every 30 minutes
    await updateProxies();
    setInterval(updateProxies, 30 * 60 * 1000);

    // Summary log every hour
    setInterval(() => {
        console.log(chalk.magenta(
            `\n📊 [Ad-Booster Summary] Visits: ${visitCounter} | Ad impressions triggered: ${adImpressionCounter}\n`
        ));
    }, 60 * 60 * 1000);

    // 4 parallel "user" workers, staggered starts
    const workerCount = 4;
    for (let i = 0; i < workerCount; i++) {
        const run = async () => {
            try {
                await boostTraffic();
            } catch (_) { }

            // Randomized delay between 4–9 minutes per worker (more human-like)
            const nextRunMs = (4 + Math.random() * 5) * 60 * 1000;
            setTimeout(run, nextRunMs);
        };

        // Stagger worker starts by 25 seconds
        setTimeout(run, i * 25000);
    }
}

function getStats() {
    return {
        visits: visitCounter,
        impressions: adImpressionCounter
    };
}

module.exports = { startTrafficInterval, boostTraffic, getStats };
