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
    'Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1'
];

const REFERRERS = [
    'https://www.google.com/',
    'https://www.google.com/search?q=hamza+amirni+portfolio',
    'https://www.google.com/search?q=full+stack+developer+morocco',
    'https://www.bing.com/search?q=hamza+amirni',
    'https://duckduckgo.com/?q=portfolio+developer',
    'https://www.facebook.com/',
    'https://t.co/',
    'https://www.linkedin.com/',
];

// ─── Monetag ad tag URL — update this if your tag changes ────────────────────
const MONETAG_AD_TAG = 'https://quge5.com/88/tag.min.js';
const MAIN_SITE = 'https://hamzaamirni.netlify.app';

let usProxyList = [];
let visitCounter = 0;
let adImpressionCounter = 0;

// ─── Proxy Pool Update ────────────────────────────────────────────────────────
async function updateProxies() {
    try {
        console.log(chalk.yellow('[Ad-Booster] 🔄 Refreshing US Proxy Pool...'));
        const sources = [
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=us&ssl=yes&anonymity=all',
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
                if (allProxies.length > 1000) break;
            } catch (_) { }
        }

        if (allProxies.length > 0) {
            usProxyList = [...new Set(allProxies)];
            console.log(chalk.green(`[Ad-Booster] ✅ Loaded ${usProxyList.length} Premium/US proxies.`));
        }
    } catch (e) {
        console.log(chalk.red(`[Ad-Booster] Proxy update error: ${e.message}`));
    }
}

// ─── Build proxy config from pool ─────────────────────────────────────────────
function getProxyConfig() {
    if (usProxyList.length === 0) return null;
    const proxyStr = usProxyList[Math.floor(Math.random() * usProxyList.length)];
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
async function simulateGoogleAnalytics(siteUrl, proxyConfig, ua, route = '') {
    const gaId = 'G-DC06ZLLB59';
    const clientId = Math.random().toString().substring(2, 12) + '.' + Math.random().toString().substring(2, 12);
    const sessionId = Date.now().toString();
    const encodedUrl = encodeURIComponent(`${siteUrl}${route}`);

    // Build the GA4 collect URL
    const gaUrl = `https://www.google-analytics.com/g/collect?v=2&tid=${gaId}&cid=${clientId}&en=page_view&dl=${encodedUrl}&dt=${encodeURIComponent('Hamza Amirni')}&sr=1920x1080&ul=en-us&sid=${sessionId}&sct=1&seg=1`;

    try {
        await axios.get(gaUrl, {
            headers: { 'User-Agent': ua, 'Referer': siteUrl },
            proxy: proxyConfig,
            timeout: 10000
        });
    } catch (_) { }
}

// ─── Simulate realistic user engagement ──────────────────────────────────────
async function simulateEngagement(siteUrl, proxyConfig, ua) {
    try {
        // 0. Fire Google Analytics for the main page
        await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, '');

        // 1. Load assets (simulate actual browser loading page resources)
        const assets = await detectAssets(siteUrl);
        for (const asset of assets.slice(0, 3)) { // Load first 3 (JS/CSS blocking resources)
            await new Promise(r => setTimeout(r, Math.random() * 1500 + 500));
            await axios.get(`${siteUrl}${asset}`, {
                headers: { 'User-Agent': ua, 'Referer': siteUrl },
                proxy: proxyConfig,
                timeout: 10000
            }).catch(() => { });
        }

        // 2. Hit the Monetag ad tag directly — this is what counts as an impression
        await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));

        // Monetag Main Tag (Zone: 215026)
        await axios.get(`${MONETAG_AD_TAG}?zoneId=215026`, {
            headers: {
                'User-Agent': ua,
                'Referer': siteUrl,
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9'
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
                'Accept-Language': 'en-US,en;q=0.9'
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
            await new Promise(r => setTimeout(r, Math.random() * 4000 + 2000));

            // Fire GA4 pixel for the internal route
            await simulateGoogleAnalytics(siteUrl, proxyConfig, ua, route);

            await axios.get(`${siteUrl}${route}`, {
                headers: { 'User-Agent': ua, 'Referer': siteUrl },
                proxy: proxyConfig,
                timeout: 10000
            }).catch(() => { });
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
                // 1. Visit main page
                await axios.get(url, {
                    headers: {
                        'User-Agent': ua,
                        'Referer': ref,
                        'Accept-Language': 'en-US,en;q=0.9',
                        'DNT': '1',
                        'Cache-Control': 'no-cache'
                    },
                    proxy: proxyConfig,
                    timeout: 10000 // Shorter timeout to skip dead proxies fast
                });

                success = true;
                visitCounter++;
                console.log(chalk.blue(`[Ad-Booster] 🚀 Visit #${visitCounter} → ${url} (via ${proxyConfig ? proxyConfig.host : 'Direct'})`));

                // 2. Simulate engagement (assets + ad tag + routing) if the proxy works
                await simulateEngagement(url, proxyConfig, ua);
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
