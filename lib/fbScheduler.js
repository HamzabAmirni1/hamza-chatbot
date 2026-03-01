/**
 * lib/fbScheduler.js
 * 📘 Auto-Poster مجدول لصفحة الفيسبوك
 * 
 * - المالك يضبط: prompt + وقت النشر اليومي
 * - البوت يولّد نصاً بـ AI + صورة بـ Pollinations
 * - ينشرها تلقائياً على الصفحة كل يوم في الوقت المحدد
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'fb_autopost.json');
const TZ = 'Africa/Casablanca';

// ─── State Management ─────────────────────────────────────────────────────────
function readSchedule() {
    fs.ensureDirSync(DATA_DIR);
    try {
        if (!fs.existsSync(SCHEDULE_FILE)) {
            const def = {
                enabled: true,
                time: '10:00',
                prompt: 'نصائح إسلامية قيمة، حكم وأمثال مغربية، ومعلومات مفيدة للشباب العربي باسلوب جذاب وإبداعي',
                withImage: true,
                lastPosted: ''
            };
            fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(def, null, 2));
            return def;
        }
        const s = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        // Ensure defaults if missing or first run
        if (s.enabled === undefined) s.enabled = true;
        if (!s.time) s.time = '10:00';
        if (!s.prompt) s.prompt = 'نصائح إسلامية وقيم مغربية بأسلوب إبداعي';
        return s;
    } catch (e) {
        return { enabled: true, time: '10:00', prompt: 'نصائح إسلامية وقيم مغربية', withImage: true, lastPosted: '' };
    }
}

function saveSchedule(data) {
    fs.ensureDirSync(DATA_DIR);
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
}

function getSchedule() { return readSchedule(); }
function setScheduleEnabled(val) { const s = readSchedule(); s.enabled = val; saveSchedule(s); }
function setScheduleTime(time) { const s = readSchedule(); s.time = time; saveSchedule(s); }
function setSchedulePrompt(prompt, withImage = true) { const s = readSchedule(); s.prompt = prompt; s.withImage = withImage; saveSchedule(s); }

// ─── AI Text Generator ────────────────────────────────────────────────────────
async function generatePostText(prompt) {
    const postPrompt = `أنت مساعد إبداعي لإنشاء محتوى صفحة فيسبوك احترافية.
المطلوب: اكتب بوست فيسبوك جذاب وإبداعي باللغة العربية بناءً على هذا الموضوع:

"${prompt}"

القواعد:
- النص جذاب وسلس مناسب لصفحة فيسبوك
- أضف إيموجي مناسبة
- أضف هاشتاقات عربية مناسبة في النهاية
- لا تتجاوز 300 كلمة
- لا تضع مقدمة أو شرح، فقط البوست مباشرة`;

    // Try multiple AI providers
    const providers = [
        // Gemini (best quality)
        async () => {
            if (!config.geminiApiKey) return null;
            const res = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`,
                {
                    contents: [{ role: 'user', parts: [{ text: postPrompt }] }],
                    generationConfig: { temperature: 0.9, maxOutputTokens: 1024 }
                },
                { timeout: 15000 }
            );
            return res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        },
        // Pollinations (free, reliable)
        async () => {
            const res = await axios.post('https://text.pollinations.ai/', {
                messages: [
                    { role: 'system', content: 'أنت مساعد إبداعي لإنشاء محتوى صفحات فيسبوك.' },
                    { role: 'user', content: postPrompt }
                ],
                model: 'openai',
                seed: Date.now() % 9999
            }, { timeout: 12000 });
            const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            return text.replace(/\*Support Pollinations.*$/s, '').trim();
        },
        // Vreden
        async () => {
            const res = await axios.get(
                `https://api.vreden.my.id/api/ai/gpt?query=${encodeURIComponent(postPrompt)}`,
                { timeout: 10000 }
            );
            return res.data?.result;
        }
    ];

    for (const provider of providers) {
        try {
            const text = await provider();
            if (text && text.length > 20) return text;
        } catch (e) { }
    }

    // Fallback: use the prompt as-is
    return `📢 ${prompt}\n\n⚔️ ${config.botName}`;
}

// ─── Image Generator (Pollinations - Free) ────────────────────────────────────
async function generateImage(prompt) {
    try {
        // Translate prompt to English for better results
        let enPrompt = prompt;
        try {
            const tr = await axios.get(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(prompt)}`,
                { timeout: 5000 }
            );
            enPrompt = tr.data?.[0]?.[0]?.[0] || prompt;
        } catch (e) { }

        const imgPrompt = `${enPrompt}, professional photography, high quality, vibrant colors, social media post`;
        const seed = Math.floor(Math.random() * 99999);
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=1200&height=630&seed=${seed}&model=flux`;

        // Download the image
        const res = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000 });
        return Buffer.from(res.data);
    } catch (e) {
        console.error('[fbScheduler] Image gen failed:', e.message);
        return null;
    }
}

// ─── Post to Facebook Page ────────────────────────────────────────────────────
async function postToFacebook(text, imageBuffer = null) {
    const pageId = process.env.FB_PAGE_ID || config.fbPageId || 'me';
    const token = config.fbPageAccessToken;

    if (!token) throw new Error('fbPageAccessToken غير مُعيَّن!');

    if (imageBuffer) {
        const form = new FormData();
        form.append('source', imageBuffer, { filename: 'auto_post.jpg', contentType: 'image/jpeg' });
        form.append('caption', text);
        form.append('access_token', token);

        const res = await axios.post(
            `https://graph.facebook.com/v19.0/${pageId}/photos`,
            form,
            { headers: form.getHeaders(), timeout: 30000 }
        );
        return res.data;
    } else {
        const res = await axios.post(
            `https://graph.facebook.com/v19.0/${pageId}/feed`,
            { message: text, access_token: token },
            { timeout: 15000 }
        );
        return res.data;
    }
}

// ─── Main Auto-Post Job ───────────────────────────────────────────────────────
async function runAutoPost(notifySock = null, notifyJid = null) {
    const schedule = readSchedule();
    if (!schedule.prompt) return { success: false, reason: 'لا يوجد prompt مُعيَّن' };

    console.log('[fbScheduler] 🚀 Running auto-post...');

    try {
        // 1. Generate post text
        const postText = await generatePostText(schedule.prompt);

        // 2. Generate image (optional)
        let imgBuffer = null;
        if (schedule.withImage) {
            imgBuffer = await generateImage(schedule.prompt);
        }

        // 3. Post to Facebook
        const result = await postToFacebook(postText, imgBuffer);

        // 4. Update lastPosted
        const now = moment().tz(TZ).format('YYYY-MM-DD HH:mm');
        schedule.lastPosted = now;
        saveSchedule(schedule);

        console.log(`[fbScheduler] ✅ Posted! ID: ${result.id}`);

        // 5. Notify owner on WhatsApp if sock is available
        if (notifySock && notifyJid) {
            try {
                await notifySock.sendMessage(notifyJid, {
                    text:
                        `✅ *Auto-Post تم بنجاح!* 📘\n\n` +
                        `🕐 *الوقت:* ${now}\n` +
                        `🖼️ *صورة:* ${imgBuffer ? 'تم الإنشاء ✅' : 'بدون صورة'}\n` +
                        `📝 *النص:* ${postText.substring(0, 100)}...\n` +
                        `🆔 *Post ID:* ${result.id || 'N/A'}\n\n` +
                        `⚔️ _${config.botName}_`
                });
            } catch (e) { }
        }

        return { success: true, postId: result.id, text: postText };
    } catch (e) {
        console.error('[fbScheduler] ❌ Auto-post failed:', e.response?.data || e.message);

        if (notifySock && notifyJid) {
            try {
                await notifySock.sendMessage(notifyJid, {
                    text: `❌ *فشل Auto-Post الفيسبوك!*\n\nالسبب: ${e.response?.data?.error?.message || e.message}`
                });
            } catch (e2) { }
        }

        return { success: false, reason: e.message };
    }
}

// ─── Scheduler Loop ───────────────────────────────────────────────────────────
function startFbPostScheduler(sock, ownerJid) {
    if (global.fbPostInterval) clearInterval(global.fbPostInterval);

    global.fbPostInterval = setInterval(async () => {
        try {
            const schedule = readSchedule();
            if (!schedule.enabled || !schedule.prompt || !schedule.time) return;

            const now = moment().tz(TZ);
            const currentHHMM = now.format('HH:mm');
            const todayKey = now.format('YYYY-MM-DD');

            // Check if time matches and hasn't been posted today
            if (currentHHMM === schedule.time) {
                const lastPostedDate = schedule.lastPosted ? schedule.lastPosted.substring(0, 10) : '';
                if (lastPostedDate === todayKey) return; // Already posted today

                // Find owner JID from config
                const jid = ownerJid || (config.ownerNumber?.[0] ? `${config.ownerNumber[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
                const currentSock = global.sock || sock;

                await runAutoPost(currentSock, jid);
            }
        } catch (e) {
            console.error('[fbScheduler] Interval error:', e.message);
        }
    }, 60000); // Check every minute

    console.log('[fbScheduler] 📘 Facebook Auto-Post Scheduler started.');
    return global.fbPostInterval;
}

module.exports = {
    startFbPostScheduler,
    getSchedule,
    setScheduleEnabled,
    setScheduleTime,
    setSchedulePrompt,
    runAutoPost,
    readSchedule,
    saveSchedule
};
