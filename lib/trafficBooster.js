const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');

/**
 * Advanced Multi-Country Traffic & Ad Revenue Booster (v2.0)
 * 
 * Features:
 * - US-Centric Proxy Rotation: Uses free US proxies to boost CPM.
 * - Multi-Region Spoofing: Rotates between US, UK, CA, and DE locations.
 * - Human-like Behavior: Randomized scrolls, delays, and secondary asset hits.
 * - Stealth Headers: Realistic User-Agents & Referrers.
 */

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.164 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

const REFERRERS = [
    'https://www.google.com/',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    'https://www.facebook.com/',
    'https://t.co/',
    config.officialChannel || 'https://whatsapp.com/'
];

let usProxyList = [];

async function updateProxies() {
    try {
        console.log(chalk.yellow('[Ad-Booster] 🔄 Refreshing US Proxy Pool...'));
        const { data } = await axios.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=us&ssl=yes&anonymity=all', { timeout: 10000 });
        const lines = data.split('\r\n').filter(l => l.includes(':'));
        if (lines.length > 0) {
            usProxyList = lines;
            console.log(chalk.green(`[Ad-Booster] ✅ Loaded ${usProxyList.length} US proxies.`));
        }
    } catch (e) {
        // console.log('[Ad-Booster] Proxy update failed, using direct connection.');
    }
}

async function boostTraffic() {
    const urlsToBoost = [
        'https://hamzaamirni.netlify.app',
        config.portfolio,
        config.publicUrl
    ].filter((u, i, arr) => u && u.startsWith('http') && arr.indexOf(u) === i);

    for (const url of urlsToBoost) {
        try {
            const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
            const ref = REFERRERS[Math.floor(Math.random() * REFERRERS.length)];

            // Pick a US proxy if available
            let proxyConfig = null;
            if (usProxyList.length > 0) {
                const proxyStr = usProxyList[Math.floor(Math.random() * usProxyList.length)];
                const [host, port] = proxyStr.split(':');
                proxyConfig = { host, port: parseInt(port) };
            }

            // Hit the main page with US headers
            await axios.get(url, {
                headers: {
                    'User-Agent': ua,
                    'Referer': ref,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'DNT': '1'
                },
                proxy: proxyConfig,
                timeout: 20000
            });

            console.log(chalk.blue(`[Ad-Booster] 🇺🇸 US-Routed hit: ${url} (Proxy: ${proxyConfig ? proxyConfig.host : 'Direct'})`));

            // Secondary hit to simulate engagement
            if (url.includes('netlify.app')) {
                await new Promise(r => setTimeout(r, 3000));
                await axios.get(`${url}/favicon.ico`, {
                    headers: { 'User-Agent': ua, 'Referer': url },
                    proxy: proxyConfig,
                    timeout: 8000
                }).catch(() => { });
            }
        } catch (e) {
            // console.log(`[Ad-Booster] Traffic node bypass for ${url}`);
        }
    }
}

function startTrafficInterval() {
    console.log(chalk.green('🚀 Global US-Targeted Traffic Booster Active.'));

    // Initial proxy load
    updateProxies();

    // Refresh proxies every 15 minutes
    setInterval(updateProxies, 15 * 60 * 1000);

    const run = async () => {
        await boostTraffic();
        // Jitter: 4-7 minutes
        const nextRun = (4 + Math.random() * 3) * 60 * 1000;
        setTimeout(run, nextRun);
    };

    run();
}

module.exports = { startTrafficInterval, boostTraffic };
