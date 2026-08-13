const { db } = require('./supabase');

// In-memory cache for the leaderboard
global.leaderboardCache = null;
let isSaving = false;
let hasChanges = false;

// Load leaderboard from DB if not already loaded
async function ensureLoaded() {
    if (global.leaderboardCache) return;
    try {
        const cached = await db.getCache('user_leaderboard');
        if (cached) {
            global.leaderboardCache = cached;
        } else {
            global.leaderboardCache = { whatsapp: {}, telegram: {}, facebook: {} };
        }
    } catch (e) {
        console.error('[Leaderboard] failed to load:', e.message);
        global.leaderboardCache = { whatsapp: {}, telegram: {}, facebook: {} };
    }
}

// Periodically save leaderboard to DB
async function saveToDB() {
    if (!hasChanges || isSaving) return;
    isSaving = true;
    try {
        await ensureLoaded();
        const success = await db.setCache('user_leaderboard', global.leaderboardCache);
        if (success) {
            hasChanges = false;
        }
    } catch (e) {
        console.error('[Leaderboard] save error:', e.message);
    } finally {
        isSaving = false;
    }
}

// Save interval (every 30 seconds)
setInterval(saveToDB, 30000);

/**
 * Increment message/command count for a user
 * @param {string} platform 'whatsapp' | 'telegram' | 'facebook'
 * @param {string} jid 
 * @param {string} name 
 */
async function incrementUser(platform, jid, name) {
    try {
        await ensureLoaded();
        const plat = platform.toLowerCase();
        if (!global.leaderboardCache[plat]) {
            global.leaderboardCache[plat] = {};
        }
        
        const cleanName = name || 'مستخدم';
        if (!global.leaderboardCache[plat][jid]) {
            global.leaderboardCache[plat][jid] = {
                name: cleanName,
                count: 0,
                lastActive: new Date().toISOString()
            };
        }
        
        global.leaderboardCache[plat][jid].count++;
        global.leaderboardCache[plat][jid].name = cleanName; // update name if changed
        global.leaderboardCache[plat][jid].lastActive = new Date().toISOString();
        hasChanges = true;
    } catch (e) {
        console.error('[Leaderboard] increment error:', e.message);
    }
}

/**
 * Get top users sorted by count
 * @param {string} platform 
 * @param {number} limit 
 */
async function getTopUsers(platform, limit = 20) {
    await ensureLoaded();
    const plat = platform.toLowerCase();
    const users = global.leaderboardCache[plat] || {};
    return Object.entries(users)
        .map(([jid, data]) => ({ jid, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

module.exports = {
    incrementUser,
    getTopUsers,
    saveToDB
};
