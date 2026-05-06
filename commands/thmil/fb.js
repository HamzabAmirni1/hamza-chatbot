const axios = require('axios');
const settings = require('../../config');

async function fesnuk(postUrl, cookie = "", userAgent = "") {
    if (!postUrl || !postUrl.trim()) throw new Error("Please specify a valid Facebook URL.");
    if (!/(facebook.com|fb.watch)/.test(postUrl)) throw new Error("Invalid Facebook URL.");

    const headers = {
        "sec-fetch-user": "?1", "sec-ch-ua-mobile": "?0", "sec-fetch-site": "none",
        "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "cache-control": "max-age=0",
        authority: "www.facebook.com", "upgrade-insecure-requests": "1", "accept-language": "en-GB,en;q=0.9",
        "sec-ch-ua": '"Google Chrome";v="89", "Chromium";v="89", ";Not A Brand";v="99"',
        "user-agent": userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        cookie: cookie || "",
    };

    try {
        const { data } = await axios.get(postUrl, { headers });
        const extractData = data.replace(/"/g, '"').replace(/&/g, "&");

        const match = (data, ...patterns) => {
            for (const pattern of patterns) {
                const result = data.match(pattern);
                if (result) return result;
            }
            return null;
        };
        const parseString = (string) => {
            try { return JSON.parse(`{"text": "${string}"}`).text; } catch (e) { return string; }
        };

        const sdUrl = match(extractData, /"browser_native_sd_url":"(.*?)"/, /sd_src\s*:\s*"([^"]*)"/)?.[1];
        const hdUrl = match(extractData, /"browser_native_hd_url":"(.*?)"/, /hd_src\s*:\s*"([^"]*)"/)?.[1];
        const title = match(extractData, /<meta\sname="description"\scontent="(.*?)"/)?.[1] || "";

        if (sdUrl || hdUrl) {
            return {
                url: postUrl,
                title: parseString(title),
                quality: {
                    sd: parseString(sdUrl),
                    hd: parseString(hdUrl || ""),
                },
            };
        } else {
            throw new Error("Unable to fetch media at this time.");
        }
    } catch (error) {
        throw new Error("Unable to fetch media at this time. Make sure the video is public.");
    }
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const url = args[0];
        if (!url || !/(facebook.com|fb.watch)/.test(url)) return sock.sendMessage(chatId, { text: "المرجو وضع رابط فيسبوك صحيح." }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '⌛', key: msg.key } });

        const result = await fesnuk(url);
        let videoUrl = result.quality.hd || result.quality.sd;

        if (!videoUrl) throw new Error("لم يتم العثور على جودة الفيديو");

        await sock.sendMessage(chatId, {
            video: { url: videoUrl },
            caption: `✅ *Facebook Download*\n\n${result.title ? `📌 ${result.title}\n` : ''}⚔️ ${settings.botName}`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ فشل التحميل: ${e.message}` }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
    }
};
