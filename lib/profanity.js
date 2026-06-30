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
    // Normalize arabic letters for robust matching
    const normalized = cleanText
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u065F]/g, ''); // remove harakat/diacritics

    for (const word of BAD_WORDS) {
        // Match word as a standalone word/phrase (boundaries)
        const regex = new RegExp(`(^|\\s|\\p{P})${word}($|\\s|\\p{P})`, 'iu');
        if (regex.test(normalized)) {
            return word;
        }
    }
    return null;
}

/**
 * Ban user by adding to banned.json
 * @param {string} jid 
 */
function banUser(jid) {
    try {
        const bannedPath = path.join(__dirname, '../data/banned.json');
        if (!fs.existsSync(path.dirname(bannedPath))) {
            fs.mkdirSync(path.dirname(bannedPath), { recursive: true });
        }
        let banned = [];
        try {
            banned = JSON.parse(fs.readFileSync(bannedPath, 'utf-8') || '[]');
        } catch (e) {
            banned = [];
        }
        if (!banned.includes(jid)) {
            banned.push(jid);
            fs.writeFileSync(bannedPath, JSON.stringify(banned, null, 2));
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
        const warningsKey = `profanity_warnings:${senderJid}`;
        // Get existing warnings info or default to 3 warnings
        let warningsInfo = await db.getCache(warningsKey) || { warnings_left: 3 };
        
        warningsInfo.warnings_left = (warningsInfo.warnings_left || 3) - 1;
        await db.setCache(warningsKey, warningsInfo);

        const warningsLeft = warningsInfo.warnings_left;
        let replyText = "";

        if (warningsLeft <= 0) {
            banUser(senderJid);
            replyText = `❌ *تم حظرك من استخدام البوت بسبب السب والشتم المتكرر.*`;
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
                // sockOrBot is a mockSock that wraps sendFacebookMessage
                await sockOrBot.sendMessage(senderJid, { text: replyText });
            }
        } catch (sendErr) {
            console.error('[Profanity] Failed to send reply:', sendErr.message);
        }

        // Save log to the global profanity list cache
        let logs = await db.getCache('profanity_logs') || [];
        logs.unshift({
            jid: senderJid,
            name: senderName || 'مستخدم غير معروف',
            platform: platform,
            bad_word: matchedWord,
            message: text,
            warnings_left: warningsLeft,
            timestamp: new Date().toISOString()
        });
        if (logs.length > 200) logs = logs.slice(0, 200);
        await db.setCache('profanity_logs', logs);



        console.log(`[Profanity] Violation logged for ${senderName} (${senderJid}) on ${platform}. Warnings left: ${warningsLeft}`);
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
