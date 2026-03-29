const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const { getAutoGPTResponse } = require('./ai');

const DATA_DIR = path.join(__dirname, '..', 'data');
const GITHUB_CACHE_FILE = path.join(DATA_DIR, 'last_github_trending.json');

function getCache() {
    fs.ensureDirSync(DATA_DIR);
    if (!fs.existsSync(GITHUB_CACHE_FILE)) return { lastRepos: [] };
    return fs.readJsonSync(GITHUB_CACHE_FILE);
}

function saveCache(cache) {
    fs.writeJsonSync(GITHUB_CACHE_FILE, cache);
}

// دالة لجلب المستودعات الطالعة (Trending) من GitHub
async function fetchTrendingRepos() {
    const repos = [];
    try {
        const res = await axios.get('https://github.com/trending', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        const $ = cheerio.load(res.data);
        
        $('.Box-row').each((i, el) => {
            if (i < 5) { // نجلب أعلى 5 لتوفير بدائل إذا نُشر أحدها مسبقاً
                const titleText = $(el).find('h2 a').text().replace(/\s+/g, '').replace(/\n/g, ''); // "owner/repo"
                const desc = $(el).find('p').text().trim();
                const lang = $(el).find('[itemprop="programmingLanguage"]').text().trim() || 'غير محدد';
                const starsText = $(el).find('a[href$="/stargazers"]').first().text().trim();
                
                if (titleText) {
                    repos.push({ 
                        full_name: titleText, 
                        description: desc, 
                        language: lang, 
                        stars: starsText,
                        url: `https://github.com/${titleText}`,
                        // توفر GitHub صورة جاهزة لكل مستودع (OpenGraph Image) تحتوي على إحصائيات واسم المستودع!
                        image: `https://opengraph.githubassets.com/1/${titleText}`
                    });
                }
            }
        });
    } catch (e) {
        console.error('[githubAutoPoster] Error fetching trending:', e.message);
    }
    return repos;
}

// دالة للنشر على الفيسبوك
async function postToFacebook(text, imageUrl) {
    const pId = config.fbPageId;
    const pTok = config.fbPageAccessToken;
    if (!pId || !pTok) {
        console.error('[githubAutoPoster] Missing Facebook Page ID or Token.');
        return false;
    }

    try {
        let postId = null;
        try {
            // محاولة النشر مع الصورة الفريدة لـ GitHub
            const { data } = await axios.post(`https://graph.facebook.com/v19.0/${pId}/photos`, {
                url: imageUrl,
                caption: text,
                access_token: pTok
            });
            postId = data.post_id || data.id;
        } catch (imgErr) {
            console.error(`[githubAutoPoster] Photo FB post failed, fallback to text:`, imgErr.response?.data?.error?.message || imgErr.message);
            // إذا فشل نشر الصورة، انشر النص فقط
            const { data } = await axios.post(`https://graph.facebook.com/v19.0/${pId}/feed`, {
                message: text,
                access_token: pTok
            });
            postId = data.id;
        }

        if (postId) {
            console.log(`[githubAutoPoster] FB Post successful: ${postId}`);
            return true;
        }
    } catch (e) {
        console.error(`[githubAutoPoster] FB Total Failure:`, e.response?.data?.error?.message || e.message);
        return false;
    }
    return false;
}

async function checkAndPostTrending() {
    console.log("[githubAutoPoster] Checking for new trending GitHub projects...");
    const trendingRepos = await fetchTrendingRepos();
    if (trendingRepos.length === 0) return;

    const cache = getCache();
    // البحث عن مستودع جديد لم يسبق نشره
    const repoToPost = trendingRepos.find(repo => !cache.lastRepos.includes(repo.full_name));

    if (repoToPost) {
        console.log(`[githubAutoPoster] Found new trending repo to post: ${repoToPost.full_name}`);
        
        let postText = "";
        try {
            // تحضير الـ Prompt لإنشاء نص احترافي بالدارجة المغربية باستخدام الذكاء الاصطناعي الخاص بك
            const aiPrompt = `أنت مبرمج مغربي وخبير في الـ Open Source. قم بصياغة منشور لتشجيع المبرمجين المغاربة والعرب على المساهمة في هذا المشروع مفتوح المصدر الذي يتصدر قائمة Trending في GitHub اليوم. استعمل الدارجة المغربية بأسلوب احترافي وتشويقي:
            
الاسم: ${repoToPost.full_name}
الوصف: ${repoToPost.description}
لغة البرمجة: ${repoToPost.language}
عدد النجوم: ${repoToPost.stars}

المطلوب:
- ابدأ بتحية تشجيعية.
- اشرح فائدة المشروع باختصار ولماذا هو مشهور اليوم.
- شجعهم على الدخول للرابط والمساهمة بكود أو استخدامه للتعلم.
- استعمل إيموجيات مناسبة ومظهر مرتب.
- لا تذكر العبارات الافتتاحية مثل "بالتأكيد" أو "مرحباً سأقوم بذلك".
- ضع هذا الرابط في الشرح: ${repoToPost.url}
- التوقيع في النهاية بالضبط هكذا: 🛡️ *Hamza Amirni* | 📸 Instagram: ${config.instagram}`;
            
            const aiResponse = await getAutoGPTResponse("system", aiPrompt);
            if (aiResponse && aiResponse.length > 50) {
                postText = aiResponse;
            }
        } catch (e) {
            console.error("[githubAutoPoster] AI Error, using fallback text.");
        }

        if (!postText) {
            // نص احتياطي في حالة فشل الذكاء الاصطناعي
            postText = `🔥 *مشاريع GitHub الطالعة اليوم (Trending)* 🔥\n\n` +
                       `بغيتو تستافدو وتطورو من المهارات ديالكم؟ شوفو هاد المشروع المفتوح المصدر اللي داير البوز اليوم على GitHub:\n\n` +
                       `📌 *الاسم:* ${repoToPost.full_name}\n` +
                       `📝 *الوصف:* ${repoToPost.description}\n` +
                       `💻 *اللغة:* ${repoToPost.language}\n` +
                       `⭐ *النجوم:* ${repoToPost.stars} نجمة\n\n` +
                       `🔗 *الرابط:* ${repoToPost.url}\n\n` +
                       `دخلو شوفو الكود، تعلمو منو، وساهمو فيه باش تقويو الـ Portfolio ديالكم! 🚀\n\n` +
                       `🛡️ *Hamza Amirni*\n📸 Instagram: ${config.instagram}`;
        }

        // نشر المشروع على الفيسبوك بصحة الصورة المأخوذة من جيتهاب
        const success = await postToFacebook(postText, repoToPost.image);
        
        if (success) {
            cache.lastRepos.push(repoToPost.full_name);
            if (cache.lastRepos.length > 50) cache.lastRepos = cache.lastRepos.slice(-50);
            saveCache(cache);
        }
    } else {
        console.log("[githubAutoPoster] No new trending repos to post right now.");
    }
}

function startGithubScheduler() {
    // نشر تلقائي كل 12 ساعة (احتمال نشر مشروعين في اليوم كحد أقصى)
    setInterval(checkAndPostTrending, 12 * 60 * 60 * 1000);
    // التنفيذ الفوري عند بداية التشغيل للتجربة
    setTimeout(checkAndPostTrending, 15000);
    console.log("[githubAutoPoster] 💻 GitHub Trending Auto-Poster started (12h interval).");
}

module.exports = { startGithubScheduler };
