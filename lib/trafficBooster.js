const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');

/**
 * Traffic Booster Module
 * 
 * Target: Increase website views and help with ad revenue by simulating visits
 * and encouraging user traffic.
 */

async function boostTraffic() {
    const urlsToBoost = [
        config.portfolio,
        'https://hamzaamirni.com', // Potential custom domain
        config.publicUrl
    ].filter(u => u && u.startsWith('http'));

    for (const url of urlsToBoost) {
        try {
            // Simple GET request to register a hit in analytics
            await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                },
                timeout: 10000
            });
            console.log(chalk.blue(`[Traffic] 🚀 Successfully pinged: ${url}`));
        } catch (e) {
            // Quiet failure
        }
    }
}

function startTrafficInterval() {
    console.log(chalk.green('✅ Traffic & Ad Booster started.'));

    // Visit sites every 5 minutes to keep stats alive and hosting awake
    setInterval(async () => {
        await boostTraffic();
    }, 5 * 60 * 1000);
}

module.exports = { startTrafficInterval, boostTraffic };
