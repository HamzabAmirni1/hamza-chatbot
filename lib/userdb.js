/**
 * lib/userdb.js
 * نظام قاعدة بيانات المستخدمين - مشترك بين جميع المنصات
 */

const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const DB_FILES = {
    whatsapp: path.join(DATA_DIR, 'users.json'),
    telegram: path.join(DATA_DIR, 'tg_users.json'),
};

function ensureDb() {
    fs.ensureDirSync(DATA_DIR);
    for (const file of Object.values(DB_FILES)) {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, '[]');
        }
    }
}

function readUsers(platform) {
    ensureDb();
    try {
        const raw = fs.readFileSync(DB_FILES[platform], 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function saveUser(platform, chatId) {
    ensureDb();
    try {
        const users = readUsers(platform);
        const id = chatId.toString();
        if (!users.includes(id)) {
            users.push(id);
            fs.writeFileSync(DB_FILES[platform], JSON.stringify(users, null, 2));
        }
    } catch (e) {
        console.error('[UserDB] Save error:', e.message);
    }
}

function getAllUsers() {
    ensureDb();
    return {
        whatsapp: readUsers('whatsapp'),
        telegram: readUsers('telegram'),
    };
}

function getUserCount() {
    const all = getAllUsers();
    return {
        whatsapp: all.whatsapp.length,
        telegram: all.telegram.length,
        total: all.whatsapp.length + all.telegram.length
    };
}

module.exports = { saveUser, readUsers, getAllUsers, getUserCount };
