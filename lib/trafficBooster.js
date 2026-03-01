const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');

/**
 * Advanced Traffic & Ad Revenue Booster
 * 
 * Features:
 * - Rotates User-Agents (Mobile/Desktop) to look like real devices.
 * - Rotates Referrers (Google, FB, Twitter) for organic look in Analytics.
 * - Jittered intervals to avoid bot detection patterns.
 * - Simulates small bursts (visiting main page + some assets).
 */

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.101 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

const REFERRERS = [
    'https://www.google.com/',
    'https://www.facebook.com/',
    'https://t.co/',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    'https://l.instagram.com/',
    config.officialChannel,
    config.publicUrl
];

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

            // Hit the main page
            await axios.get(url, {
                headers: {
                    'User-Agent': ua,
                    'Referer': ref,
                    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 15000
            });

            // Simulate "Session" - visit a common sub-resource if it's the main portfolio
            if (url.includes('netlify.app')) {
                // Randomly wait a few seconds and ping again as if browsing
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
                await axios.get(`${url}/favicon.ico`, { headers: { 'User-Agent': ua, 'Referer': url }, timeout: 5000 }).catch(() => { });
            }

            console.log(chalk.blue(`[Ad-Booster] 🚀 Organic hit registered for: ${url} (Referrer: ${ref})`));
        } catch (e) {
            // console.log(`[Ad-Booster] Error pinging ${url}: ${e.message}`);
        }
    }
}

function startTrafficInterval() {
    console.log(chalk.green('✅ Advanced Ad Revenue & Traffic Booster active.'));

    const run = async () => {
        await boostTraffic();
        // Add jitter: 5-8 minutes
        const nextRun = (5 + Math.random() * 3) * 60 * 1000;
        setTimeout(run, nextRun);
    };

    run();
}

module.exports = { startTrafficInterval, boostTraffic };
