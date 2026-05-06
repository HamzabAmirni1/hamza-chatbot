const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '../data/quran_sessions.json');

// Helper to read sessions from file
function readSessions() {
    try {
        if (!fs.existsSync(SESSION_FILE)) return {};
        const data = fs.readFileSync(SESSION_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading Quran sessions:', e);
        return {};
    }
}

// Helper to write sessions to file
function writeSessions(sessions) {
    try {
        const dataDir = path.dirname(SESSION_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
    } catch (e) {
        console.error('Error writing Quran sessions:', e);
    }
}

// Cleanup old sessions (older than 24 hours)
function cleanupSessions() {
    const sessions = readSessions();
    const now = Date.now();
    let changed = false;
    for (const chatId in sessions) {
        if (now - sessions[chatId].timestamp > 86400000) { // 24 hours
            delete sessions[chatId];
            changed = true;
        }
    }
    if (changed) writeSessions(sessions);
}

module.exports = {
    setSession: (chatId, data) => {
        cleanupSessions();
        const sessions = readSessions();
        sessions[chatId] = {
            ...data,
            timestamp: Date.now()
        };
        writeSessions(sessions);
    },
    getSession: (chatId) => {
        const sessions = readSessions();
        return sessions[chatId];
    },
    deleteSession: (chatId) => {
        const sessions = readSessions();
        if (sessions[chatId]) {
            delete sessions[chatId];
            writeSessions(sessions);
        }
    }
};
