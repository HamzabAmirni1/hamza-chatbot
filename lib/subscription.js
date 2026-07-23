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

const { db } = require('./supabase');

// Initialize memory caches if not already present
global.subscribedUsersCache = global.subscribedUsersCache || null;
global.pendingUsersCache = global.pendingUsersCache || new Set();

/**
 * Lazy load users from Supabase into memory cache.
 */
async function ensureCacheLoaded() {
    if (global.subscribedUsersCache !== null) return;
    try {
        console.log('[Subscription] 🔄 Loading subscribed users from Supabase...');
        const allUsers = await db.getAllUsers();
        global.subscribedUsersCache = new Set(allUsers.map(u => u.jid));
        console.log(`[Subscription] 🌸 Loaded ${global.subscribedUsersCache.size} users into memory cache`);
    } catch (e) {
        console.error('[Subscription] ❌ Failed to load users from Supabase, initializing empty:', e.message);
        global.subscribedUsersCache = new Set();
    }
}

/**
 * Check if user has already passed the subscription gate
 */
function isSubscribed(userId, platform = 'wa') {
    if (global.subscribedUsersCache === null) {
        // Fallback for async load lag: assume not subscribed but trigger load
        ensureCacheLoaded().catch(() => {});
        return false;
    }
    const cleanId = userId.toString().replace('fb:', '').replace('tg:', '');
    const platformJid = platform === 'wa' ? cleanId : `${platform}:${cleanId}`;
    return global.subscribedUsersCache.has(platformJid);
}

/**
 * Mark user as subscribed (they clicked confirm / sent any message after seeing the gate)
 */
function markSubscribed(userId, platform = 'wa') {
    const cleanId = userId.toString().replace('fb:', '').replace('tg:', '');
    const platformJid = platform === 'wa' ? cleanId : `${platform}:${cleanId}`;

    if (global.subscribedUsersCache) {
        global.subscribedUsersCache.add(platformJid);
    }
    global.pendingUsersCache.delete(platformJid);

    // Persist to Supabase
    db.upsertPlatformUser(platformJid).catch(e => {
        console.error(`[Subscription] ❌ Failed to save user ${platformJid} to Supabase:`, e.message);
    });
}

/**
 * Check if user is in pending state (already received the gate message)
 */
function isPending(userId, platform = 'wa') {
    const cleanId = userId.toString().replace('fb:', '').replace('tg:', '');
    const platformJid = platform === 'wa' ? cleanId : `${platform}:${cleanId}`;
    return global.pendingUsersCache.has(platformJid);
}

/**
 * Mark user as pending (they just received the gate message)
 */
function markPending(userId, platform = 'wa') {
    const cleanId = userId.toString().replace('fb:', '').replace('tg:', '');
    const platformJid = platform === 'wa' ? cleanId : `${platform}:${cleanId}`;
    global.pendingUsersCache.add(platformJid);
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
║  🤖 *${config.botName}* 🤖  ║
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

${arrow} 📢 *قناة Instagram:*
${config.instagramChannel || 'https://www.instagram.com/channel/AbbqrMVbExH_EZLD/'}

━━━━━━━━━━━━━━━━━━━━

${check} بعد المتابعة، أرسل أي رسالة وسيبدأ البوت في العمل تلقائياً!

_⚠️ هذا شرط إلزامي للاستخدام_`;
}

/**
 * Auto-subscribes a user to prayer reminders and daily duas.
 */
function autoSubscribeUser(userId, platform = 'wa') {
    try {
        const cleanId = userId.toString().replace('fb:', '').replace('tg:', '');

        // 1. Auto-subscribe to prayer reminders (Opt-in table helper)
        try {
            const { subscribeUser, isSubscribed: isPrayerSubscribed } = require('./prayerScheduler');
            if (!isPrayerSubscribed(cleanId, platform)) {
                subscribeUser(cleanId, config.defaultPrayerCity || 'Casablanca', 'MA', platform);
                console.log(`[Auto-Subscribe] 🕌 Subscribed ${platform} user ${cleanId} to prayer reminders`);
            }
        } catch (e) {
            console.error('[Auto-Subscribe] Prayer error:', e.message);
        }

        // 2. Auto-subscribe to daily duas (Only for WhatsApp; Telegram/Facebook already auto-broadcast to all)
        if (platform === 'wa') {
            try {
                const { loadDuasData, saveDuasData } = require('./islamic');
                const duasData = loadDuasData();
                if (!duasData.subscribers.includes(cleanId)) {
                    duasData.subscribers.push(cleanId);
                    saveDuasData(duasData);
                    console.log(`[Auto-Subscribe] 🤲 Subscribed WA user ${cleanId} to daily duas`);
                }
            } catch (e) {
                console.error('[Auto-Subscribe] Duas error:', e.message);
            }
        }
    } catch (err) {
        console.error('[Auto-Subscribe] Global error:', err.message);
    }
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
        // Also auto-subscribe them to prayers/duas immediately!
        autoSubscribeUser(userId, platform);
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

أهلاً بك في *${config.botName}* 🎉
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
    getWelcomeMessage,
    autoSubscribeUser
};
