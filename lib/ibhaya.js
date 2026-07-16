const path = require('path');
const fs = require('fs-extra');
const { db } = require('./supabase');

const IBHAYA_WORDS = [...new Set(require('./ibhaya-words'))];

function normalizeText(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/\s+/g, ' ');
}

/**
 * Scan a message for adult/pornographic content requests
 * @param {string} text
 * @returns {string|null}
 */
function scanMessage(text) {
    if (!text) return null;
    const normalized = normalizeText(text);
    const compact = normalized.replace(/\s+/g, '');

    for (const word of IBHAYA_WORDS) {
        const w = normalizeText(word);
        const wCompact = w.replace(/\s+/g, '');

        if (w.includes(' ')) {
            // Multi-word phrase: exact substring match is fine
            if (normalized.includes(w) || compact.includes(wCompact)) return word;
        } else if (w.length >= 5) {
            // Long single word (5+ chars): substring match ok
            if (normalized.includes(w)) return word;
        } else {
            // Short word (1-4 chars): ONLY whole-word boundary match to avoid false positives
            const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|[\\s\\p{P}،؟!،؛]|يا|ال|في|بنت|ولد)${escaped}($|[\\s\\p{P}،؟!،؛]|ك|نا|كم|هم|يك|ين|ية|ي)`, 'iu');
            if (regex.test(normalized)) return word;
        }
    }
    return null;
}

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
        console.error('[Ibhaya] banUser Error:', e.message);
    }
}

async function handleIbhaya(platform, senderJid, senderName, text, matchedWord, sockOrBot, msgObj) {
    try {
        // Feature toggle — skip silently if disabled from dashboard
        const cfg = require('../config');
        if (cfg.enableIbhaya === 'false') return false;

        const warningsKey = `ibhaya_warnings:${senderJid}`;
        let warningsInfo = await db.getCache(warningsKey) || { warnings_left: 3 };

        warningsInfo.warnings_left = (warningsInfo.warnings_left || 3) - 1;
        await db.setCache(warningsKey, warningsInfo);

        const warningsLeft = warningsInfo.warnings_left;
        let replyText = '';

        if (warningsLeft <= 0) {
            await banUser(senderJid);
            replyText = '❌ *تم حظرك من استخدام البوت بسبب طلب محتوى إباحي متكرر.*';
        } else {
            replyText = `🚫 *ممنوع طلب أو مشاركة محتوى إباحي!*\n\nهذا البوت لا يوفر أي محتوى من هذا النوع.\nبقي لديك *${warningsLeft}* تحذيرات قبل الحظر التلقائي.`;
        }

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
            console.error('[Ibhaya] Failed to send reply:', sendErr.message);
        }

        let logs = await db.getCache('ibhaya_logs') || [];
        logs.unshift({
            jid: senderJid,
            name: senderName || 'مستخدم غير معروف',
            platform,
            bad_word: matchedWord,
            message: text,
            warnings_left: warningsLeft,
            timestamp: new Date().toISOString()
        });
        if (logs.length > 200) logs = logs.slice(0, 200);
        await db.setCache('ibhaya_logs', logs);

        console.log(`[Ibhaya] Violation logged for ${senderName} (${senderJid}) on ${platform}. Warnings left: ${warningsLeft}`);
        return true;
    } catch (e) {
        console.error('[Ibhaya] handleIbhaya Error:', e.message);
        return false;
    }
}

module.exports = {
    IBHAYA_WORDS,
    scanMessage,
    handleIbhaya
};
