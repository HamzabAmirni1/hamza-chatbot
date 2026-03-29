const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const moment = require('moment-timezone');

const DATA_DIR = path.join(__dirname, '..', 'data');
const NEWS_CACHE_FILE = path.join(DATA_DIR, 'last_news.json');

const NEWS_SOURCES = [
    { name: "الجزيرة", url: "https://www.aljazeera.net/rss" },
    { name: "هسبريس", url: "https://www.hespress.com/feed" },
    { name: "Le360", url: "https://ar.le360.ma/rss.xml" }
];

async function fetchBreakingNews() {
    const allNews = [];
    for (const source of NEWS_SOURCES) {
        try {
            const res = await axios.get(source.url, { 
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const $ = cheerio.load(res.data, { xmlMode: true });

            $('item').each((i, el) => {
                if (i < 3) {
                    const title = $(el).find('title').text().trim();
                    const description = $(el).find('description').text().trim().replace(/<[^>]*>?/gm, ''); // Remove HTML
                    const link = $(el).find('link').text().trim();
                    let pubDate = $(el).find('pubDate').text().trim();
                    const matchTime = pubDate.match(/\d{2}:\d{2}/);
                    const timeStr = matchTime ? matchTime[0] : "";
                    
                    if (title) allNews.push({ title, description, link, time: timeStr, source: source.name });
                }
            });
        } catch (e) {
            console.error(`[newsAutoPoster] Fetch error for ${source.name}:`, e.message);
        }
    }
    return allNews;
}

async function scrapeImage(url) {
    try {
        const { data } = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        return $('meta[property="og:image"]').attr('content') || null;
    } catch (e) { return null; }
}

async function postToFacebook(text, imageUrl = null) {
    const pages = [];
    const id1 = process.env.FB_PAGE_ID || config.fbPageId;
    const tok1 = config.fbPageAccessToken;
    if (id1 && tok1) pages.push({ id: id1, token: tok1 });
    // ... load more pages if any

    for (const page of pages) {
        try {
            if (imageUrl) {
                await axios.post(`https://graph.facebook.com/v19.0/${page.id}/photos`, {
                    url: imageUrl,
                    caption: text,
                    access_token: page.token
                });
            } else {
                await axios.post(`https://graph.facebook.com/v19.0/${page.id}/feed`, {
                    message: text,
                    access_token: page.token
                });
            }
            console.log(`[newsAutoPoster] Posted to FB Page: ${page.id}`);
        } catch (e) {
            console.error(`[newsAutoPoster] FB Post failed for ${page.id}:`, e.response?.data || e.message);
            // Fallback to text only if photo fails
            if (imageUrl) await postToFacebook(text, null);
        }
    }
}

async function postToTelegram(text) {
    if (!config.telegramToken) return;
    const targetId = config.ownerNumber[0]; // Or a dedicated channel ID if provided
    try {
        await axios.post(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
            chat_id: targetId,
            text: text,
            parse_mode: "Markdown"
        });
        console.log(`[newsAutoPoster] Posted to Telegram`);
    } catch (e) {
        console.error(`[newsAutoPoster] TG Post failed:`, e.message);
    }
}

function getCache() {
    fs.ensureDirSync(DATA_DIR);
    if (!fs.existsSync(NEWS_CACHE_FILE)) return { lastTitles: [] };
    return fs.readJsonSync(NEWS_CACHE_FILE);
}

function saveCache(cache) {
    fs.writeJsonSync(NEWS_CACHE_FILE, cache);
}

async function checkAndPostNews() {
    console.log("[newsAutoPoster] Checking for new breaking news...");
    const latestNews = await fetchBreakingNews();
    if (latestNews.length === 0) return;

    const cache = getCache();
    const newItems = latestNews.filter(item => !cache.lastTitles.includes(item.title));

    if (newItems.length > 0) {
        console.log(`[newsAutoPoster] Found ${newItems.length} new items!`);
        
        for (const item of newItems) {
            const shortDesc = item.description ? item.description.slice(0, 300) + (item.description.length > 300 ? "..." : "") : "";
            const postText = `🚨 *${item.title}*\n━━━━━━━━━━━━━━\n\n📖 ${shortDesc}\n\n🕒 ${item.time ? item.time : 'الآن'} | 📍 ${item.source}\n🔗 اقرأ المزيد: ${item.link}\n\n🛡️ *Hamza Amirni*\n📸 Instagram: ${config.instagram}`;
            
            const imageUrl = await scrapeImage(item.link);
            await postToFacebook(postText, imageUrl);
            // await postToTelegram(postText); // Disabled per user request
            
            cache.lastTitles.push(item.title);
        }

        if (cache.lastTitles.length > 100) cache.lastTitles = cache.lastTitles.slice(-100);
        saveCache(cache);
    } else {
        console.log("[newsAutoPoster] No new news found.");
    }
}

function startNewsScheduler() {
    // Check every 30 minutes
    setInterval(checkAndPostNews, 30 * 60 * 1000);
    // Run once immediately on start
    setTimeout(checkAndPostNews, 10000);
    console.log("[newsAutoPoster] 🗞️ News Auto-Poster Scheduler started (30m interval).");
}

module.exports = { startNewsScheduler };
