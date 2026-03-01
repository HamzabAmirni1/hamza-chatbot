const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('../../config');

const ANTICALL_PATH = path.join(__dirname, "..", "..", "data", "anticall.json");
const startTime = Date.now();

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

async function getYupraVideoByUrl(youtubeUrl) {
    try {
        const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
        if (res?.data?.success && res?.data?.data?.download_url) {
            return {
                download: res.data.data.download_url,
                title: res.data.data.title,
                thumbnail: res.data.data.thumbnail
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function getOkatsuVideoByUrl(youtubeUrl) {
    try {
        const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
        if (res?.data?.result?.mp4) {
            return { download: res.data.result.mp4, title: res.data.result.title };
        }
        return null;
    } catch (e) {
        return null;
    }
}

function readAntiCallState() {
    try {
        if (!fs.existsSync(ANTICALL_PATH)) {
            if (!fs.existsSync(path.dirname(ANTICALL_PATH)))
                fs.mkdirSync(path.dirname(ANTICALL_PATH), { recursive: true });
            fs.writeFileSync(
                ANTICALL_PATH,
                JSON.stringify({ enabled: true }, null, 2),
            );
            return { enabled: true };
        }
        const data = JSON.parse(fs.readFileSync(ANTICALL_PATH, "utf8") || "{}");
        return { enabled: !!data.enabled };
    } catch {
        return { enabled: true };
    }
}

function writeAntiCallState(enabled) {
    try {
        if (!fs.existsSync(path.dirname(ANTICALL_PATH)))
            fs.mkdirSync(path.dirname(ANTICALL_PATH), { recursive: true });
        fs.writeFileSync(
            ANTICALL_PATH,
            JSON.stringify({ enabled: !!enabled }, null, 2),
        );
    } catch { }
}

async function sendWithChannelButton(sock, jid, text, quoted) {
    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");
    let contextInfo = {};
    if (fs.existsSync(imagePath)) {
        contextInfo = {
            externalAdReply: {
                title: config.botName,
                body: "Click to visit our official website ✨",
                thumbnail: fs.readFileSync(imagePath),
                sourceUrl: Math.random() > 0.5 ? config.portfolio : config.officialChannel,
                mediaType: 1,
                renderLargerThumbnail: true,
            },
        };
    }
    await sock.sendMessage(jid, { text, contextInfo }, { quoted });
}

function getUptime() {
    const duration = Date.now() - startTime;
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function logUser(jid) {
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.includes("@newsletter")) return;
    const dataPath = path.join(__dirname, "..", "..", "data", "users.json");
    try {
        if (!fs.existsSync(path.dirname(dataPath))) fs.mkdirSync(path.dirname(dataPath), { recursive: true });
        let users = [];
        if (fs.existsSync(dataPath)) {
            const content = fs.readFileSync(dataPath, "utf8");
            users = JSON.parse(content || "[]");
        }
        if (!users.includes(jid)) {
            users.push(jid);
            fs.writeFileSync(dataPath, JSON.stringify(users, null, 2));
        }
    } catch (e) { }
}

module.exports = {
    sendWithChannelButton,
    getUptime,
    readAntiCallState,
    writeAntiCallState,
    getYupraVideoByUrl,
    getOkatsuVideoByUrl,
    tryRequest,
    logUser
};
