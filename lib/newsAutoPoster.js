const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const moment = require('moment-timezone');

const DATA_DIR = path.join(__dirname, '..', 'data');
const NEWS_CACHE_FILE = path.join(DATA_DIR, 'last_news.json');

const { getAutoGPTResponse } = require('./ai');

const NEWS_SOURCES = [
    { name: "الجزيرة", url: "https://www.aljazeera.net/rss" },
    { name: "هسبريس", url: "https://www.hespress.com/feed" },
    { name: "Le360", url: "https://ar.le360.ma/arc/outboundfeeds/rss/?outputType=xml" },
    { name: "Hacker News", url: "https://news.ycombinator.com/rss", type: 'tech' },
    { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", type: 'tech' }
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
                    const description = $(el).find('description').text().trim().replace(/<[^>]*>?/gm, '');
                    const link = $(el).find('link').text().trim();
                    let pubDate = $(el).find('pubDate').text().trim();
                    const matchTime = pubDate.match(/\d{2}:\d{2}/);
                    const timeStr = matchTime ? matchTime[0] : "";
                    
                    if (title) allNews.push({ title, description, link, time: timeStr, source: source.name, type: source.type || 'news' });
                }
            });
        } catch (e) {
            console.error(`[newsAutoPoster] Fetch error for ${source.name}:`, e.message);
        }
    }
    return allNews;
}

async function scrapeContent(url) {
    try {
        const { data } = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);
        const image = $('meta[property="og:image"]').attr('content') || null;
        
        let fullText = "";
        $('article p, .article-body p, .content p, .post-content p').each((i, el) => {
            const txt = $(el).text().trim();
            if (txt.length > 50) fullText += txt + "\n\n";
        });

        return { image, fullText: fullText.trim() };
    } catch (e) { return { image: null, fullText: "" }; }
}

async function getFacebookPages() {
    let pages = [];
    
    // 1. 가져오기 기본 페이지들 from config.fbPages
    if (config.fbPages && Array.isArray(config.fbPages)) {
        for (const p of config.fbPages) {
            if (p.id && p.token) {
                pages.push({ id: p.id, access_token: p.token });
            }
        }
    }

    // 2. محاولة جلب صفحات من خلال Graph API (في حالة كان التوكن الأول User Token)
    if (pages.length > 0) {
        try {
            const firstToken = pages[0].access_token;
            const { data } = await axios.get(`https://graph.facebook.com/v19.0/me/accounts?access_token=${firstToken}`);
            if (data && data.data && data.data.length > 0) {
                for (const apiPage of data.data) {
                    if (!pages.find(p => p.id === apiPage.id)) {
                        pages.push({ id: apiPage.id, access_token: apiPage.access_token });
                    }
                }
            }
        } catch (e) {
            // تجاهل الخطأ إذا كان Page Token
        }
    }

    // 3. إزالة التكرار
    const uniquePages = [];
    const map = new Map();
    for (const item of pages) {
        if (!map.has(item.id)) {
            map.set(item.id, true);
            uniquePages.push(item);
        }
    }

    return uniquePages;
}

async function postToFacebook(text, imageUrl = null) {
    const pages = await getFacebookPages();
    if (pages.length === 0) {
        console.error('[newsAutoPoster] No Facebook pages found.');
        return;
    }

    for (const page of pages) {
        const pId = page.id;
        const pTok = page.access_token;
        
        try {
            let postId = null;
            let finalImg = imageUrl || 'https://raw.githubusercontent.com/HamzabAmirni1/hamza-chatbot/main/media/tech-news.jpg';
            
            try {
                const { data } = await axios.post(`https://graph.facebook.com/v19.0/${pId}/photos`, {
                    url: finalImg,
                    caption: text,
                    access_token: pTok
                });
                postId = data.post_id || data.id;
            } catch (imgErr) {
                console.error(`[newsAutoPoster] Photo post failed for page ${pId}, fallback to text:`, imgErr.response?.data?.error?.message || imgErr.message);
                const { data } = await axios.post(`https://graph.facebook.com/v19.0/${pId}/feed`, {
                    message: text,
                    access_token: pTok
                });
                postId = data.id;
            }

            if (postId) console.log(`[newsAutoPoster] FB Post successful to page ${pId}: ${postId}`);
        } catch (e) {
            console.error(`[newsAutoPoster] FB Total Failure for page ${pId}:`, e.response?.data?.error?.message || e.message);
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
            const { image, fullText } = await scrapeContent(item.link);
            
            let postText = "";
            if (item.type === 'tech') {
                const aiPrompt = `أنت خبير تقني. قم بصياغة هذا الخبر التقني بالدارجة المغربية أو العربية الفصحى بشكل احترافي وجذاب للمتابعين، وقم بتوضيح أهمية المشروع أو التقنية الجديدة:
                العنوان: ${item.title}
                الوصف: ${item.description}
                النص الكامل: ${fullText.slice(0, 1000)}
                ---
                - استعمل ايموجيات تقنية مناسبة.
                - اذكر أنه مشروع 오픈 مصدر أو ذكاء اصطناعي جديد من GitHub.
                - لا تذكر العبارات الافتتاحية للمساعدين مثل "أبشر" أو "بالتأكيد". ابدأ مباشرة بالخبر.
                - اجعل التوقيع في النهاية: 🛡️ *Hamza Amirni* | 📸 Instagram: ${config.instagram}`;
                
                const aiResponse = await getAutoGPTResponse("system", aiPrompt);
                postText = aiResponse || `🚀 *${item.title}*\n\n${item.description}\n\n🔗 ${item.link}`;
            } else {
                const contentBody = fullText || item.description || "";
                const cleanBody = contentBody.slice(0, 5000); 
                postText = `📰 *${item.title}*\n━━━━━━━━━━━━━━\n\n${cleanBody}\n\n🕒 ${item.time || 'الآن'} | 📍 المصدر: ${item.source}\n🔗 المصدر الأصلي: ${item.link}\n\n🛡️ *Hamza Amirni*\n📸 Instagram: ${config.instagram}`;
            }
            
            await postToFacebook(postText, image);
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
