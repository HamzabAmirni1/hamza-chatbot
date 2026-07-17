const path = require('path');
const fs = require('fs-extra');
const { db } = require('./supabase');
const config = require('../config');

// List of profanity/bad words (Darija, standard Arabic, and Darija written in Latin/French letters)
const BAD_WORDS = [
    // --- Arabic Script ---
    "قلاوي", "الزب", "طابون", "طبون", "قحبة", "قحاب", "منيك", "زامل", "زواميل", "شمايت",
    "ولد القحبة", "بنت القحبة", "منيكة", "تقود", "سير تقود", "نعل مك", "نعل والديك", 
    "طبون مك", "طبون يماك", "ولد الحرام", "بنت الحرام", "ولد الزنا", "ديوث", "قحبة مك", 
    "قحبة يماك", "زبك", "قلاويك", "خريه", "خرا", "شمايته", "زمل", "زب", "زبي", "الزبي",
    "قحبه", "منيكه", "شمايتة", "نعل والديك", "نعل دين مك", "نعل بو مك", "قود", "قودو",
    "تفو عليك", "تفوه عليك", "ولد قحبة", "بنت قحبة", "بنت الحرام", "ولد زنا", "بنت زنا",
    "ديوت", "قحبة ختك", "قحبة اختك", "طبون ختك", "طبون اختك", "نعل بوك", "يا زامل",
    "يا قحبة", "يا كلب", "يا حمار", "تفو", "تفوه", "كلب", "حمار", "الكلب", "الحمار",

    // --- Darija in Latin script (Franco-Arabic) ---
    "tabon", "taboun", "qlaoui", "9laoui", "9lawi", "qlawi", "zamel", "zamal", "zaml", 
    "zawamel", "zamel-mok", "zamel mok", "khra", "5ra", "chra", "khria", "5ria", "9ahba", 
    "qahba", "9ahba mok", "qahba mok", "9hba", "qhba", "zab", "zbi", "zeb", "zebi", 
    "zbouba", "zboub", "mnyek", "mneyek", "mnyk", "mnyeka", "mneyeka", "mny3k", "t9wed", 
    "tqwed", "t9ewed", "tqewed", "9wed", "qwed", "sir t9wed", "sir tqwed", "sir t9ewed", 
    "lhmar", "hmar", "7mar", "l7mar", "lkelb", "kelb", "klb", "tfou", "tfo", "wld l9ahba", 
    "wld lqahba", "wld 9ahba", "weld 9ahba", "weld lqahba", "weld l9ahba", "wld l9hba", 
    "weld l9hba", "bnt l9ahba", "bnt lqahba", "bnt 9ahba", "bent 9ahba", "bent lqahba", 
    "bent l9ahba", "bnt l9hba", "bent l9hba", "wld lhram", "wld l7ram", "weld l7ram", 
    "weld lhram", "bnt lhram", "bnt l7ram", "bent l7ram", "bent lhram", "dyout", "dyouth", 
    "dayout", "dayouth", "na3l", "na3l-mok", "n3l-mok", "na3l-dinn-mok", "n3l-dinn-mok", 
    "n3l-waldik", "na3l-waldik", "na3lmok", "n3lmok", "n3l waldik", "na3l waldik",
    "9lavy", "qlavy", "tabon mok", "tabonmok", "taboun mok", "tabounmok", "qahba mok",
    "9ahbamok", "qahbamok", "wld 9ahba", "wld qahba", "wld 9hba", "wld qhba",
    "bnt 9ahba", "bnt qahba", "bnt 9hba", "bnt qhba", "mney3k", "t9awed", "tqawed",
    "sirt9wed", "sirtqwed", "sirt9ewed", "sir t9awed", "sir tqawed"
];

/**
 * Scan a message for profanity
 * @param {string} text 
 * @returns {string|null} The matched bad word or null
 */
function scanMessage(text) {
    if (!text) return null;
    const cleanText = text.toLowerCase().trim();
    const normalized = cleanText
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u065F]/g, '');
    const compact = normalized.replace(/\s+/g, '');

    for (const word of BAD_WORDS) {
        const w = word.toLowerCase().trim()
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[\u064B-\u065F]/g, '');
        const wCompact = w.replace(/\s+/g, '');

        if (w.includes(' ')) {
            // Multi-word phrase: exact substring match is fine
            if (normalized.includes(w) || compact.includes(wCompact)) return word;
        } else if (w.length >= 5) {
            // Long single word (5+ chars): substring match ok
            if (normalized.includes(w)) return word;
        } else {
            // Short word (1-4 chars): ONLY whole-word boundary match to avoid false positives like 'zab' in 'czaban'
            const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|[\\s\\p{P}]|يا|ال|بو|ولد|بنت)${escaped}($|[\\s\\p{P}]|ك|نا|كم|هم|يك|ين|ية)`, 'iu');
            if (regex.test(normalized)) return word;
        }
    }
    return null;
}

/**
 * Ban user by adding to banned list
 * @param {string} jid 
 */
async function banUser(jid) {
    try {
        let banned = [...(global.bannedUsersCache || [])];
        if (!banned.includes(jid)) {
            banned.push(jid);
            if (typeof global.syncBannedList === 'function') {
                await global.syncBannedList(banned);
            } else {
                const bannedPath = path.join(__dirname, '../data/banned.json');
                fs.ensureDirSync(path.dirname(bannedPath));
                fs.writeFileSync(bannedPath, JSON.stringify(banned, null, 2));
            }
        }
    } catch (e) {
        console.error('[Profanity] banUser Error:', e.message);
    }
}

/**
 * Handle profanity incident
 * @param {string} platform 'WA' | 'TG' | 'FB'
 * @param {string} senderJid 
 * @param {string} senderName 
 * @param {string} text 
 * @param {string} matchedWord 
 * @param {object} sockOrBot 
 * @param {object} msgObj 
 */
async function handleProfanity(platform, senderJid, senderName, text, matchedWord, sockOrBot, msgObj) {
    try {
        // Feature toggle — skip silently if disabled from dashboard
        const cfg = require('../config');
        if (cfg.enableProfanity === 'false') return false;

        const warningsKey = `profanity_warnings:${senderJid}`;
        // Get existing warnings info or default to 3 warnings
        let warningsInfo = await db.getCache(warningsKey) || { warnings_left: 3 };
        
        warningsInfo.warnings_left = (warningsInfo.warnings_left || 3) - 1;
        await db.setCache(warningsKey, warningsInfo);

        const warningsLeft = warningsInfo.warnings_left;
        let replyText = "";

        const monitorOnly = cfg.profanityMonitorOnly === 'true';

        if (!monitorOnly) {
            if (warningsLeft <= 0) {
                await banUser(senderJid);
                replyText = `❌ *تم حظرك من استخدام البوت بسبب السب والشتم المتكرر.*\n\nℹ️ *يمكنك الاستمرار في مراسلة المطور لتقديم اعتذار أو طلب إلغاء الحظر باستخدام الأمر:*\n\`.msgtodev [رسالتك]\``;
            } else {
                replyText = `⚠️ *ممنوع السب والشتم!* لقد تم تسجيل هذه المخالفة.\n\nبقي لديك *${warningsLeft}* تحذيرات قبل الحظر التلقائي.`;
            }

            // Send warning/ban reply to user
            try {
                if (platform === 'WA') {
                    await sockOrBot.sendMessage(senderJid, { text: replyText }, { quoted: msgObj });
                } else if (platform === 'TG') {
                    const tgChatId = parseInt(senderJid) || senderJid;
                    const replyOpts = { parse_mode: 'Markdown' };
                    if (msgObj && msgObj.message_id) replyOpts.reply_to_message_id = msgObj.message_id;
                    await sockOrBot.sendMessage(tgChatId, replyText, replyOpts);
                } else if (platform === 'FB') {
                    await sockOrBot.sendMessage(senderJid, { text: replyText });
                }
            } catch (sendErr) {
                console.error('[Profanity] Failed to send reply:', sendErr.message);
            }
        }

        // Always log the violation (even in monitor-only mode)
        let logs = await db.getCache('profanity_logs') || [];
        logs.unshift({
            jid: senderJid,
            name: senderName || 'مستخدم غير معروف',
            platform: platform,
            bad_word: matchedWord,
            message: text,
            warnings_left: monitorOnly ? (warningsLeft + 1) : warningsLeft, // don't consume warnings in monitor mode
            timestamp: new Date().toISOString()
        });
        if (logs.length > 200) logs = logs.slice(0, 200);
        await db.setCache('profanity_logs', logs);

        // Save permanently to dev_messages table
        try {
            await db.saveDevMessage({
                id: 'prof_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                sender: senderJid,
                senderName: senderName || 'مستخدم غير معروف',
                platform: platform.toLowerCase(),
                text: `⚠️ [مخالفة سب وشتم] الكلمة: ${matchedWord}\nالرسالة: ${text}`
            });
        } catch (dbErr) {
            console.error('[Profanity] Failed to save violation to DB:', dbErr.message);
        }

        // Restore warnings counter if monitor-only (don't actually deduct)
        if (monitorOnly) {
            await db.setCache(warningsKey, { warnings_left: warningsInfo.warnings_left + 1 });
        }

        console.log(`[Profanity] ${monitorOnly ? '[MONITOR]' : ''} Violation logged for ${senderName} (${senderJid}) on ${platform}. Warnings left: ${warningsLeft}`);
        return true;
    } catch (e) {
        console.error('[Profanity] handleProfanity Error:', e.message);
        return false;
    }
}

module.exports = {
    scanMessage,
    handleProfanity
};
