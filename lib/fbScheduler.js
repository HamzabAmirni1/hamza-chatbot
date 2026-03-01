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
    const postPrompt = `أنت خبير في إدارة صفحات الفيسبوك النشطة والإبداعية.
المطلوب: اكتب بوست فيسبوك احترافي وجذاب باللغة العربية حول موضوع: "${prompt}"

⚠️ قواعد مهمة جداً للتنسيق:
1. لا تستخدم النجوم (**) أو أي تنسيق Markdown للخط العريض، لأن فيسبوك لا يدعمها وتظهر كرموز مشوهة.
2. استخدم الإيموجي (Emojis) بشكل ذكي في بداية الفقرات لجعلها جذابة.
3. اجعل النص مقسماً إلى فقرات قصيرة مع فواصل (مثل ــــــــــــــــــــــــــــــــــــ أو خطوط زخرفية).
4. ابدأ بعنوان جذاب في السطر الأول.
5. أضف هاشتاقات عربية نشطة في نهاية البوست.
6. لا تضع أي مقدمات مثل "إليك البوست" أو "تم توليد النص"، ابدأ بالبوست مباشرة.
7. استخدم أحياناً الدارجة المغربية المهذبة إذا كان ذلك سيزيد من التفاعل.

المحتوى يجب أن يكون ملهماً، مفيداً، وبجودة عالية جداً.`;

    // Try multiple AI providers
    const providers = [
        // Gemini (best quality)
        async () => {
            if (!config.geminiApiKey) return null;
            const res = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`,
                {
                    contents: [{ role: 'user', parts: [{ text: postPrompt }] }],
                    generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }
                },
                { timeout: 20000 }
            );
            return res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        },
        // Pollinations (free, reliable)
        async () => {
            const res = await axios.post('https://text.pollinations.ai/', {
                messages: [
                    { role: 'system', content: 'أنت خبير محتوى فيسبوك مبدع.' },
                    { role: 'user', content: postPrompt }
                ],
                model: 'openai',
                seed: Date.now() % 9999
            }, { timeout: 15000 });
            const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            return text.replace(/\*Support Pollinations.*$/s, '').trim();
        }
    ];

    for (const provider of providers) {
        try {
            const text = await provider();
            if (text && text.length > 20) {
                // Final cleanup: remove any lingering Markdown bold/italic symbols
                return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '').trim();
            }
        } catch (e) { }
    }

    return `📢 ${prompt}\n\nــــــــــــــــــــــــــــــــــــ\n⚔️ ${config.botName}`;
}

// ─── Image Generator (Pollinations - Free) ────────────────────────────────────
async function generateImage(prompt) {
    try {
        // Translate prompt to English for better results
        let enPrompt = prompt;
        try {
            const tr = await axios.get(
                `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(prompt)}`,
                { timeout: 7000 }
            );
            enPrompt = tr.data?.[0]?.[0]?.[0] || prompt;
        } catch (e) { }

        // Premium keywords for better image results
        const imgPrompt = `Professional cinematic photography of ${enPrompt}, high resolution 4k, realistic, daylight, highly detailed, sharp focus, aesthetic composition, NO text, NO watermarks`;
        const seed = Math.floor(Math.random() * 1000000);

        // Use Flux model for best quality
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=1080&height=1350&seed=${seed}&model=flux&nologo=true`;

        const res = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 45000 });
        return Buffer.from(res.data);
    } catch (e) {
        console.error('[fbScheduler] Image gen failed:', e.message);
        return null;
    }
}

// ─── Post to Facebook Pages ───────────────────────────────────────────────────
async function postToFacebook(text, imageBuffer = null) {
    const pages = [];

    // Page 1 (Main)
    const id1 = process.env.FB_PAGE_ID || config.fbPageId;
    const tok1 = config.fbPageAccessToken;
    if (id1 && tok1) pages.push({ id: id1, token: tok1 });

    // Look for more pages (Page 2, 3, 4, 5...)
    for (let i = 2; i <= 5; i++) {
        const id = process.env[`FB_PAGE_ID${i}`];
        const tok = process.env[`PAGE_ACCESS_TOKEN${i}`];
        if (id && tok) pages.push({ id, token: tok });
    }

    if (pages.length === 0) throw new Error('لم يتم العثور على أي صفحة فيسبوك مُعيَّنة (تأكد من FB_PAGE_ID و PAGE_ACCESS_TOKEN)');

    const results = [];
    for (const page of pages) {
        try {
            if (imageBuffer) {
                const form = new FormData();
                form.append('source', imageBuffer, { filename: 'auto_post.jpg', contentType: 'image/jpeg' });
                form.append('caption', text);
                form.append('access_token', page.token);

                const res = await axios.post(
                    `https://graph.facebook.com/v19.0/${page.id}/photos`,
                    form,
                    { headers: form.getHeaders(), timeout: 30000 }
                );
                results.push({ success: true, pageId: page.id, id: res.data.id });
            } else {
                const res = await axios.post(
                    `https://graph.facebook.com/v19.0/${page.id}/feed`,
                    { message: text, access_token: page.token },
                    { timeout: 15000 }
                );
                results.push({ success: true, pageId: page.id, id: res.data.id });
            }
        } catch (e) {
            results.push({ success: false, pageId: page.id, error: e.response?.data?.error?.message || e.message });
        }
    }
    return results;
}

// ─── Main Auto-Post Job ───────────────────────────────────────────────────────
async function runAutoPost(notifySock = null, notifyJid = null) {
    const schedule = readSchedule();
    if (!schedule.prompt) return { success: false, reason: 'لا يوجد prompt مُعيَّن' };

    console.log('[fbScheduler] 🚀 Running auto-post for all pages...');

    try {
        const postText = await generatePostText(schedule.prompt);
        let imgBuffer = null;
        if (schedule.withImage) {
            imgBuffer = await generateImage(schedule.prompt);
        }

        const results = await postToFacebook(postText, imgBuffer);

        const now = moment().tz(TZ).format('YYYY-MM-DD HH:mm');
        schedule.lastPosted = now;
        saveSchedule(schedule);

        const successCount = results.filter(r => r.success).length;

        if (notifySock && notifyJid) {
            let statusText = `✅ *Auto-Post تم بنجاح!* 📘\n\n` +
                `🕐 *الوقت:* ${now}\n` +
                `📊 *الصفحات:* تم النشر في ${successCount} من أصل ${results.length}\n\n`;

            results.forEach((r, idx) => {
                statusText += `📄 *صفحة ${idx + 1}:* ${r.success ? '✅ (' + r.id + ')' : '❌ (' + r.error + ')'}\n`;
            });

            await notifySock.sendMessage(notifyJid, { text: statusText + `\n⚔️ _${config.botName}_` });
        }

        return { success: successCount > 0, results };
    } catch (e) {
        console.error('[fbScheduler] ❌ Auto-post failed:', e.message);
        if (notifySock && notifyJid) {
            await notifySock.sendMessage(notifyJid, { text: `❌ *فشل Auto-Post الفيسبوك!*\n\nالسبب: ${e.message}` });
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
