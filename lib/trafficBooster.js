const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');

/**
 * Advanced Multi-Country Traffic & Ad Revenue Booster (v3.0)
 * 
 * Optimized for Monetag & Google Analytics.
 * Features:
 * - US/Premium Proxy Rotation for High CPM.
 * - Ad-Script Simulation: Hits Monetag/Popunder tags to count as impressions.
 * - Deep Crawling: Visits internal paths and assets.
 * - Human Behavior: Randomized delays, scrolls, and multiple sub-requests.
 */

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.164 Mobile Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

const REFERRERS = [
    'https://www.google.com/',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    'https://www.facebook.com/',
    'https://t.co/',
    'https://www.google.com/search?q=hamza+amirni+portfolio',
    'https://www.google.com/search?q=best+full+stack+developer+morocco'
];

let usProxyList = [];

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
                if (allProxies.length > 500) break;
            } catch (err) { }
        }

        if (allProxies.length > 0) {
            usProxyList = [...new Set(allProxies)];
            console.log(chalk.green(`[Ad-Booster] ✅ Loaded ${usProxyList.length} Premium/US proxies.`));
        }
    } catch (e) {
        console.log(chalk.red(`[Ad-Booster] Proxy update error: ${e.message}`));
    }
}

async function simulateEngagement(url, proxyConfig, ua) {
    try {
        const assets = [
            '/favicon.ico',
            '/hamza-logo.svg',
            '/assets/index-BDMlYt5R.js', // Current detected asset
            '/assets/index-Dn7N8__h.css',
            'https://quge5.com/88/tag.min.js' // Monetag Ad Tag
        ];

        for (const asset of assets) {
            const assetUrl = asset.startsWith('http') ? asset : `${url}${asset}`;
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
            await axios.get(assetUrl, {
                headers: { 'User-Agent': ua, 'Referer': url },
                proxy: proxyConfig,
                timeout: 10000
            }).catch(() => { });
        }

        // Simulating clicks on internal routes (React Router)
        const routes = ['/services', '/portfolio', '/contact', '/blog', '/projects'];
        for (const route of routes) {
            if (Math.random() > 0.5) {
                await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
                await axios.get(`${url}${route}`, {
                    headers: { 'User-Agent': ua, 'Referer': url },
                    proxy: proxyConfig,
                    timeout: 10000
                }).catch(() => { });
                console.log(chalk.gray(`[Ad-Booster] 🖱️ Simulated click: ${route}`));
            }
        }
    } catch (e) { }
}

async function boostTraffic() {
    const mainSite = 'https://hamzaamirni.netlify.app';
    const urlsToBoost = [mainSite, config.portfolio, config.publicUrl].filter((u, i, arr) => u && u.startsWith('http') && arr.indexOf(u) === i);

    for (const url of urlsToBoost) {
        try {
            const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
            const ref = REFERRERS[Math.floor(Math.random() * REFERRERS.length)];

            let proxyConfig = null;
            if (usProxyList.length > 0) {
                const proxyStr = usProxyList[Math.floor(Math.random() * usProxyList.length)];
                const [host, port] = proxyStr.split(':');
                proxyConfig = { host, port: parseInt(port) };
            }

            // 1. Visit Main Page
            await axios.get(url, {
                headers: {
                    'User-Agent': ua,
                    'Referer': ref,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'DNT': '1'
                },
                proxy: proxyConfig,
                timeout: 20000
            });

            console.log(chalk.blue(`[Ad-Booster] 🚀 Target hit (US Proxy): ${url}`));

            // 2. Perform Engagement & Ad Clicks
            if (url.includes('netlify.app')) {
                await simulateEngagement(url, proxyConfig, ua);
            }

        } catch (e) {
            // console.log(`[Ad-Booster] Bypass fail for ${url}`);
        }
    }
}

async function startTrafficInterval() {
    console.log(chalk.green('🔥 Mega Ad-Revenue & Traffic Booster Active (v3.0).'));

    await updateProxies();
    setInterval(updateProxies, 30 * 60 * 1000);

    const run = async () => {
        try {
            await boostTraffic();
        } catch (e) { }

        // High frequency during peak, lower during night?
        // Let's keep it steady with jitter: 2-5 minutes
        const nextRun = (2 + Math.random() * 3) * 60 * 1000;
        setTimeout(run, nextRun);
    };

    run();
}

module.exports = { startTrafficInterval, boostTraffic };
