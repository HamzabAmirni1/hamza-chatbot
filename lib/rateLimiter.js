const db = require('./supabase');
const config = require('../config');

// Initialize caching structures
global.commandRulesCache = null;
global.dailyCommandUsageCache = null;

async function init() {
    try {
        if (!global.commandRulesCache) {
            const rules = await db.getCache('command_rules');
            global.commandRulesCache = rules || {
                commandLimits: {
                    "ytdl": 5
                },
                userCommandBans: {},
                userDailyLimits: {},
                globalUserDailyLimit: 0
            };
        }

        const today = new Date().toISOString().split('T')[0];
        if (!global.dailyCommandUsageCache || global.dailyCommandUsageCache.date !== today) {
            const usage = await db.getCache(`daily_usage:${today}`);
            global.dailyCommandUsageCache = usage || {
                date: today,
                users: {}
            };
        }
    } catch (e) {
        console.error('[RateLimiter Init Error]:', e.message);
    }
}

async function checkLimit(jid, command) {
    await init();

    if (!jid || !command) return { allowed: true };

    // Owner check: Bypass all rules
    const cleanJid = jid.replace('tg:', '').replace('fb:', '').split('@')[0];
    const isOwner = config.ownerNumber.some(n => n.replace(/[^0-9]/g, '') === cleanJid.replace(/[^0-9]/g, ''));
    if (isOwner) return { allowed: true };

    const cmd = command.toLowerCase();

    // 1. User banned from specific command
    const userBans = global.commandRulesCache.userCommandBans?.[jid] || [];
    if (userBans.includes(cmd)) {
        return { 
            allowed: false, 
            reason: 'banned', 
            message: '⚠️ *عذراً! لقد تم منعك من استخدام هذا الأمر من طرف الإدارة.*' 
        };
    }

    const today = new Date().toISOString().split('T')[0];
    const userUsage = global.dailyCommandUsageCache.users[jid] || { total: 0, commands: {} };

    // 2. Command specific daily limit
    const cmdLimit = parseInt(global.commandRulesCache.commandLimits?.[cmd]) || 0;
    const cmdCount = userUsage.commands?.[cmd] || 0;
    if (cmdLimit > 0 && cmdCount >= cmdLimit) {
        return {
            allowed: false,
            reason: 'cmd_limit',
            message: `⚠️ *عذراً! لقد بلغت الحد الأقصى اليومي لهذا الأمر (.${cmd}).*\n\nالحد الأقصى هو *${cmdLimit}* مرات في اليوم.`
        };
    }

    // 3. User total daily limit (Custom or Global)
    const customLimit = parseInt(global.commandRulesCache.userDailyLimits?.[jid]) || 0;
    const globalLimit = parseInt(global.commandRulesCache.globalUserDailyLimit) || 0;
    const activeLimit = customLimit > 0 ? customLimit : globalLimit;

    if (activeLimit > 0 && userUsage.total >= activeLimit) {
        return {
            allowed: false,
            reason: 'daily_limit',
            message: `⚠️ *عذراً! لقد تجاوزت الحد الأقصى المسموح به للأوامر اليوم.*\n\nالحد المسموح لك هو *${activeLimit}* أمر في اليوم.`
        };
    }

    return { allowed: true };
}

async function incrementUsage(jid, command) {
    try {
        await init();
        if (!jid || !command) return;

        // Bypass owners
        const cleanJid = jid.replace('tg:', '').replace('fb:', '').split('@')[0];
        const isOwner = config.ownerNumber.some(n => n.replace(/[^0-9]/g, '') === cleanJid.replace(/[^0-9]/g, ''));
        if (isOwner) return;

        const cmd = command.toLowerCase();
        const today = new Date().toISOString().split('T')[0];

        if (!global.dailyCommandUsageCache.users[jid]) {
            global.dailyCommandUsageCache.users[jid] = { total: 0, commands: {} };
        }

        global.dailyCommandUsageCache.users[jid].total++;
        global.dailyCommandUsageCache.users[jid].commands[cmd] = (global.dailyCommandUsageCache.users[jid].commands[cmd] || 0) + 1;

        // Persist asynchronously in background
        db.setCache(`daily_usage:${today}`, global.dailyCommandUsageCache).catch(err => {
            console.error('[RateLimiter save error]:', err.message);
        });
    } catch (e) {
        console.error('[RateLimiter increment error]:', e.message);
    }
}

module.exports = {
    checkLimit,
    incrementUsage,
    init
};
