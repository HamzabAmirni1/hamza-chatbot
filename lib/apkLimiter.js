const fs = require('fs');
const path = require('path');

const LIMIT_FILE = path.join(__dirname, '../data/apk_limits.json');
const DAILY_LIMIT = 2;

// Initialize file if it doesn't exist
function initLimitFile() {
    if (!fs.existsSync(LIMIT_FILE)) {
        const dir = path.dirname(LIMIT_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(LIMIT_FILE, JSON.stringify({}));
    }
}

// Read limits data
function readLimits() {
    try {
        initLimitFile();
        const data = fs.readFileSync(LIMIT_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

// Write limits data
function writeLimits(data) {
    try {
        fs.writeFileSync(LIMIT_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing APK limits:', e);
    }
}

// Get today's date string (YYYY-MM-DD)
function getTodayKey() {
        const now = new Date();
    return now.toISOString().split('T')[0];
}

// Check if user can download
function canDownload(userId) {
    const limits = readLimits();
    const today = getTodayKey();

    if (!limits[userId]) {
        return { allowed: true, remaining: DAILY_LIMIT };
    }

    const userLimit = limits[userId];

    // Reset if it's a new day
    if (userLimit.date !== today) {
        return { allowed: true, remaining: DAILY_LIMIT };
    }

    const remaining = DAILY_LIMIT - userLimit.count;
    return {
        allowed: remaining > 0,
        remaining: Math.max(0, remaining),
        count: userLimit.count
    };
}

// Increment download count
function incrementDownload(userId) {
    const limits = readLimits();
    const today = getTodayKey();

    if (!limits[userId] || limits[userId].date !== today) {
        limits[userId] = {
            date: today,
            count: 1
        };
    } else {
        limits[userId].count++;
    }

    writeLimits(limits);
    return DAILY_LIMIT - limits[userId].count;
}

// Get user's remaining downloads
function getRemainingDownloads(userId) {
    const check = canDownload(userId);
    return check.remaining;
}

module.exports = {
    canDownload,
    incrementDownload,
    getRemainingDownloads,
    DAILY_LIMIT
};
