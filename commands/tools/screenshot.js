/**
 * 📸 WEBSITE SCREENSHOT
 * Adapted from silana-lite-ofc-master (ssweb.js + screenshotmachine.js)
 * Takes a screenshot of any website and sends it as an image
 * Usage: .ss https://example.com
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

/**
 * Uses multiple free screenshot APIs as fallback chain
 */
async function takeScreenshot(url) {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    const encoded = encodeURIComponent(url);
    const tmpDir = path.join(__dirname, '../../tmp');
    fs.ensureDirSync(tmpDir);
    const tmpOut = path.join(tmpDir, `ss_${Date.now()}.png`);

    const apis = [
        // API 1: screenshotapi.net (free, no key needed for basic)
        `https://shot.screenshotapi.net/screenshot?token=&url=${encoded}&width=1280&height=720&output=image&file_type=png&wait_for_event=load`,
        // API 2: s-shot.ru (free, no key)
        `https://mini.s-shot.ru/1280x720/PNG/1280/Z1/?${encoded}`,
        // API 3: webscreenshot via urlbox alternative
        `https://api.screenshotone.com/take?url=${encoded}&viewport_width=1280&viewport_height=720&format=png&response_type=image`,
    ];

    let lastError = null;
    for (const apiUrl of apis) {
        try {
            const res = await axios.get(apiUrl, {
                responseType: 'arraybuffer',
                timeout: 25000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                }
            });

            // Validate that we got an actual image back (not an error page)
            const contentType = res.headers['content-type'] || '';
            if (res.data.byteLength < 5000) {
                lastError = new Error('الصورة المستلمة صغيرة جداً، ربما فشل الطلب');
                continue;
            }

            fs.writeFileSync(tmpOut, Buffer.from(res.data));
            return tmpOut;
        } catch (err) {
            lastError = err;
            continue;
        }
    }

    throw lastError || new Error('جميع خدمات لقطة الشاشة فشلت');
}

function isValidUrl(str) {
    try {
        const u = new URL(str.startsWith('http') ? str : 'https://' + str);
        return u.hostname.includes('.');
    } catch (_) {
        return false;
    }
}

module.exports = async (sock, sender, msg, args) => {
    const url = args[0];

    if (!url || !isValidUrl(url)) {
        return await sock.sendMessage(sender, {
            text: `📸 *لقطة شاشة المواقع | Website Screenshot*\n\n` +
                  `📌 *الاستخدام:*\n` +
                  `*.ss رابط الموقع*\n\n` +
                  `📌 *أمثلة:*\n` +
                  `• .ss google.com\n` +
                  `• .ss https://youtube.com\n` +
                  `• .ss github.com/hamza\n\n` +
                  `⚔️ ${config.botName}`
        }, { quoted: msg });
    }

    let tmpPath = null;
    try {
        const displayUrl = url.startsWith('http') ? url : 'https://' + url;
        await sock.sendMessage(sender, {
            text: `⏳ *جاري التقاط لقطة الشاشة...*\n🌐 ${displayUrl}`
        }, { quoted: msg });

        tmpPath = await takeScreenshot(url);

        const caption = `📸 *لقطة الشاشة جاهزة!*\n\n` +
                        `🌐 *الموقع:* ${displayUrl}\n` +
                        `📐 *الأبعاد:* 1280 × 720\n\n` +
                        `⚔️ ${config.botName}`;

        await sock.sendMessage(sender, {
            image: { url: tmpPath },
            caption
        }, { quoted: msg });

    } catch (err) {
        console.error('[Screenshot Error]:', err.message);
        await sock.sendMessage(sender, {
            text: `❌ *فشل التقاط لقطة الشاشة*\n${err.message}\n\n💡 تأكد من صحة الرابط وأن الموقع يعمل.\n⚔️ ${config.botName}`
        }, { quoted: msg });
    } finally {
        if (tmpPath) {
            try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
    }
};
