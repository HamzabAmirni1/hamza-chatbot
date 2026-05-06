/**
 * lib/subscription.js
 * بوابة الاشتراك - يُجبر المستخدم الجديد على متابعة قنوات المطور قبل استخدام البوت
 * Subscription Gate - Forces new users to follow the developer's channels before using the bot
 */

const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUB_FILE = path.join(DATA_DIR, 'subscribed_users.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending_users.json');

function ensureFiles() {
    fs.ensureDirSync(DATA_DIR);
    if (!fs.existsSync(SUB_FILE)) fs.writeFileSync(SUB_FILE, '{}');
    if (!fs.existsSync(PENDING_FILE)) fs.writeFileSync(PENDING_FILE, '{}');
}

function readJson(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw) || {};
    } catch (e) { return {}; }
}

function writeJson(filePath, data) {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch (e) {}
}

/**
 * Check if user has already passed the subscription gate
 */
function isSubscribed(userId, platform = 'wa') {
    ensureFiles();
    const subs = readJson(SUB_FILE);
    const key = `${platform}:${userId}`;
    return !!subs[key];
}

/**
 * Mark user as subscribed (they clicked confirm / sent any message after seeing the gate)
 */
function markSubscribed(userId, platform = 'wa') {
    ensureFiles();
    const subs = readJson(SUB_FILE);
    const key = `${platform}:${userId}`;
    subs[key] = { subscribedAt: new Date().toISOString() };
    writeJson(SUB_FILE, subs);

    // Remove from pending
    const pending = readJson(PENDING_FILE);
    delete pending[key];
    writeJson(PENDING_FILE, pending);
}

/**
 * Check if user is in pending state (already received the gate message)
 */
function isPending(userId, platform = 'wa') {
    ensureFiles();
    const pending = readJson(PENDING_FILE);
    const key = `${platform}:${userId}`;
    return !!pending[key];
}

/**
 * Mark user as pending (they just received the gate message)
 */
function markPending(userId, platform = 'wa') {
    ensureFiles();
    const pending = readJson(PENDING_FILE);
    const key = `${platform}:${userId}`;
    pending[key] = { sentAt: new Date().toISOString() };
    writeJson(PENDING_FILE, pending);
}

/**
 * Generate the subscription required message
 */
function getSubscriptionMessage(platform = 'wa') {
    const isWA = platform === 'wa';
    const isTG = platform === 'tg';

    const arrow = isWA ? '➤' : '▶️';
    const check = '✅';
    const star = '⭐';

    return `╔══════════════════════╗
║  🤖 *بوت حمزة اعمرني* 🤖  ║
╚══════════════════════╝

${star} *مرحباً بك!*

قبل بدء استخدام البوت، المرجو *متابعة قنواتي* على جميع المنصات. هذا يساعدني على الاستمرار في توفير هذه الخدمة مجاناً لكم 💪

━━━━━━━━━━━━━━━━━━━━
📲 *قنوات المتابعة الإلزامية:*
━━━━━━━━━━━━━━━━━━━━

${arrow} 📸 *Instagram:*
${config.instagram}

${arrow} 📘 *Facebook:*
${config.facebookPage}

${arrow} 🎬 *YouTube:*
${config.youtube}

${arrow} 💬 *قناة WhatsApp:*
${config.officialChannel}

━━━━━━━━━━━━━━━━━━━━

${check} بعد المتابعة، أرسل أي رسالة وسيبدأ البوت في العمل تلقائياً!

_⚠️ هذا شرط إلزامي للاستخدام_`;
}

/**
 * Main gate function - call this at the start of every message handler.
 * Returns: 
 *   - 'allow'   → user is subscribed, process normally
 *   - 'pending' → user just confirmed, mark them and let this message through
 *   - 'blocked' → user is new or in pending, send gate message
 */
function checkSubscriptionGate(userId, platform = 'wa') {
    // Already subscribed → allow
    if (isSubscribed(userId, platform)) return 'allow';

    // Was pending (already received the message, now replying) → confirm & allow
    if (isPending(userId, platform)) {
        markSubscribed(userId, platform);
        return 'pending'; // allow this message through with a welcome reply
    }

    // Brand new user → send gate message and block
    markPending(userId, platform);
    return 'blocked';
}

/**
 * Welcome message after subscription confirmed
 */
function getWelcomeMessage() {
    return `✅ *شكراً على المتابعة!*

أهلاً بك في بوت حمزة اعمرني 🎉
يمكنك الآن الاستفادة من جميع الميزات:

🤖 دردشة مع الذكاء الاصطناعي
📥 تحميل من إنستا/تيكتوك/يوتيوب/فيسبوك
🎨 توليد صور بالـ AI
📖 القرآن الكريم وأوقات الصلاة
🌤️ الطقس والترجمة وأكثر!

اكتب *.help* لمعرفة جميع الأوامر 🚀`;
}

module.exports = {
    isSubscribed,
    markSubscribed,
    isPending,
    markPending,
    checkSubscriptionGate,
    getSubscriptionMessage,
    getWelcomeMessage
};
