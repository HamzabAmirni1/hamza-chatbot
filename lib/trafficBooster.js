const axios = require('axios');
const chalk = require('chalk');
const config = require('../config');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Enable stealth plugin
puppeteer.use(StealthPlugin());

/**
 * Advanced Traffic & Ad Revenue Booster (v7.0 - Puppeteer Headless)
 * - Optimized for memory (runs well on Koyeb/Render/VPS)
 * - Triggers actual Monetag and AdSense impressions
 * 
 * Last Update: 2026-03-05 21:45 (Final Sync)
 */

const MAIN_SITE = 'https://hamzaamirni.netlify.app';

let globalProxyList = [];
let visitCounter = 0;
let sessionStartTime = Date.now();

// ─── Owner Notification via Telegram ─────────────────────────────────────────
async function sendOwnerNotification(message) {
    try {
        const token = config.telegramToken;
        if (!token) return;

        const ownerIds = (config.ownerNumber || []).filter(n => /^\d{5,}$/.test(n));
        if (ownerIds.length === 0) return;

        for (const chatId of ownerIds.slice(0, 2)) {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            }, { timeout: 8000 }).catch(() => { });
        }
    } catch (_) { }
}

// ─── Scrape Proxies ──────────────────────────────────────────────────────────
async function updateProxies() {
    try {
        console.log(chalk.yellow('[Ad-Booster] 🔄 Refreshing Global Proxy Pool...'));
        const sources = [
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=all',
            'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
            'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt'
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
            globalProxyList = [...new Set(allProxies)];
            console.log(chalk.green(`[Ad-Booster] ✅ Loaded ${globalProxyList.length} proxies.`));
        }
    } catch (e) {
        console.log(chalk.red(`[Ad-Booster] Proxy update error: ${e.message}`));
    }
}

function getProxy() {
    if (globalProxyList.length === 0) return null;
    return globalProxyList[Math.floor(Math.random() * globalProxyList.length)];
}

// ─── Traffic Sources Setup ───────────────────────────────────────────────────
const TRAFFIC_SOURCES = [
    { name: 'Facebook', url: '?utm_source=facebook&utm_medium=social&utm_campaign=fb_organic', ref: 'https://l.facebook.com/' },
    { name: 'Instagram', url: '?utm_source=instagram&utm_medium=social', ref: 'https://l.instagram.com/' },
    { name: 'Twitter', url: '?utm_source=twitter&utm_medium=social', ref: 'https://t.co/' },
    { name: 'Telegram', url: '?utm_source=telegram&utm_medium=social', ref: 'https://t.me/' },
    { name: 'WhatsApp', url: '?utm_source=whatsapp&utm_medium=social', ref: 'https://web.whatsapp.com/' },
    { name: 'Google', url: '', ref: 'https://www.google.com/' }
];

// ─── Puppeteer Worker ────────────────────────────────────────────────────────
async function boostTraffic() {
    let browser = null;
    try {
        const proxy = getProxy();
        const source = TRAFFIC_SOURCES[Math.floor(Math.random() * TRAFFIC_SOURCES.length)];
        const targetUrl = `${MAIN_SITE}${source.url}`;

        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1280,720',
            '--disable-notifications'
        ];

        if (proxy) args.push(`--proxy-server=http://${proxy}`);

        browser = await puppeteer.launch({
            headless: 'new', // Use new headless mode
            args: args,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined // Required for Koyeb
        });

        const page = await browser.newPage();

        // 🛑 CRITICAL OOM PROTECTION FOR KOYEB: Block heavy images/fonts but LOAD Ads (scripts)
        await page.setRequestInterception(true);
        page.on('request', req => {
            const type = req.resourceType();
            // Block fonts and media to save bandwidth/RAM. DON'T block scripts or we lose ad revenue
            if (['image', 'media', 'font'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Setup realistic spoofing
        await page.setExtraHTTPHeaders({ 'Referer': source.ref });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(chalk.cyan(`[Ad-Booster] 🚀 Target: ${targetUrl} | Proxy: ${proxy || 'Direct'}`));

        // Load the page
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });

        // Simulate scrolling up and down sequentially
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
        }

        // Wait to let Ads and Google Analytics fully track the engagement time
        await new Promise(resolve => setTimeout(resolve, 15000 + Math.random() * 10000));

        // Attempt a random internal click to reduce Bounce Rate
        const links = await page.$$('a[href^="/"]');
        if (links.length > 0 && Math.random() > 0.4) {
            const randomLink = links[Math.floor(Math.random() * links.length)];
            await randomLink.click().catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 10000 + Math.random() * 8000)); // wait on 2nd page
        }

        visitCounter++;
        console.log(chalk.green(`[Ad-Booster] ✅ Visit #${visitCounter} successful. Views & Ads generated!`));

    } catch (e) {
        console.log(chalk.red(`[Ad-Booster] ❌ Visit error: ${e.message.split('\n')[0]}`));
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
}

// ─── Main Controller ─────────────────────────────────────────────────────────
let isStarted = false;

async function startTrafficInterval() {
    if (isStarted) return;
    isStarted = true;

    console.log(chalk.green('🔥 Puppeteer Ad-Booster v7.0 started! Optimized for Koyeb.'));

    await updateProxies();
    setInterval(updateProxies, 30 * 60 * 1000);

    // Hourly Telegram Reports
    setInterval(async () => {
        const hours = ((Date.now() - sessionStartTime) / 3600000).toFixed(1);
        const emoji = '📊';
        const msg = `${emoji} <b>Puppeteer Ad-Booster Report</b>
        
🌍 <b>الزيارات الحقيقية بالمتصفح:</b> ${visitCounter}
📈 <b>الأرباح المحتسبة (Monetag):</b> ~${visitCounter}
⏱️ <b>وقت التشغيل:</b> ${hours}h

💡 <i>v7.0 — Koyeb Supported</i>`;

        console.log(chalk.magenta(`\n[Ad-Booster] Hourly mark: ${visitCounter} actual visits generated.\n`));
        await sendOwnerNotification(msg);
    }, 60 * 60 * 1000);

    // Instead of hundreds of axios requests, we use a slower but REAL browser
    // Koyeb Free handles 2 concurrent browsers effectively without crashing

    const runWorker = async () => {
        await boostTraffic().catch(() => { });
        // Wait 1-2 mins between visits per worker
        const delay = 60000 + Math.random() * 60000;
        setTimeout(runWorker, delay);
    };

    // Stagger the 2 workers
    setTimeout(runWorker, 0);       // Worker 1
    setTimeout(runWorker, 30000);   // Worker 2
}

function getStats() {
    return { visits: visitCounter, impressions: visitCounter };
}

module.exports = { startTrafficInterval, boostTraffic, getStats };
