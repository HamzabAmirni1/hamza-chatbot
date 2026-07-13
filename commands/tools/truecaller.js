const axios = require('axios');
const cheerio = require('cheerio');

/**
 * ✅ Scrape free-lookup.net for carrier/location/line-type info
 * Returns: { Owner, Country, Carrier, LineType, International, National, Spam, Views }
 */
async function scrapeFreeLookup(cleanNumber) {
    const url = `https://free-lookup.net/${cleanNumber}`;
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 12000
    });

    const $ = cheerio.load(data);
    const result = {};

    // Parse the report summary list
    $('.report-summary__list li').each((i, el) => {
        const label = $(el).find('.report-summary__list-txt').text().replace(/\s+/g, ' ').trim();
        const valDiv = $(el).find('.report-summary__lock-wrap');
        const isLocked = valDiv.find('img.report-summary__lock').length > 0;
        result[label] = isLocked ? null : valDiv.text().replace(/\s+/g, ' ').trim();
    });

    // Parse spam scoreboard
    const spamScore = $('#circles-1 .scoreboard-digit').text().trim();
    const spamReports = $('#circles-2 .scoreboard-digit').text().trim();
    if (spamScore) result['Spam Score'] = spamScore;
    if (spamReports) result['Spam Reports'] = spamReports;

    return result;
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const { command } = helpers || {};
    let phoneInput = args.join('').replace(/[\s\-\(\)\.]/g, '');

    // Also accept number from quoted message
    if (!phoneInput && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedText = msg.message.extendedTextMessage.contextInfo.quotedMessage?.conversation
            || msg.message.extendedTextMessage.contextInfo.quotedMessage?.extendedTextMessage?.text || '';
        phoneInput = quotedText.replace(/[\s\-\(\)\.]/g, '').match(/[\d]{7,15}/)?.[0] || '';
    }

    if (!phoneInput) {
        return await sock.sendMessage(chatId, {
            text: `🔍 *Truecaller / معرفة معطيات الرقم*\n\n📌 *طريقة الاستخدام:*\n\`.truecaller رقم_الهاتف\`\n\n*مثال:*\n\`.truecaller 0661234567\`\n\`.truecaller 212661234567\`\n\`.truecaller +1 800 555 0000\`\n\n📡 *البيانات اللي كتظهر:*\n• البلد (Country)\n• المشغل (Carrier)\n• نوع الخط (MOBILE/LANDLINE)\n• الرقم الدولي\n• درجة الإزعاج (Spam Score)`
        }, { quoted: msg });
    }

    // Remove leading + and keep all digits
    const cleanNumber = phoneInput.replace(/\D/g, '');

    if (cleanNumber.length < 7 || cleanNumber.length > 15) {
        return await sock.sendMessage(chatId, {
            text: `❌ *رقم غير صالح!*\nتأكد من إدخال رقم صحيح مع رمز الدولة.\nمثال: \`.truecaller 212661234567\``
        }, { quoted: msg });
    }

    // Send waiting message
    await sock.sendMessage(chatId, {
        text: `🔍 *جاري البحث عن معطيات الرقم...*\n📞 \`+${cleanNumber}\`\nيرجى الانتظار لحظة... ⏳`
    }, { quoted: msg });

    try {
        const info = await scrapeFreeLookup(cleanNumber);

        if (!info || Object.keys(info).length === 0) {
            return await sock.sendMessage(chatId, {
                text: `❌ *ما قدرناش نجدو معطيات لهذا الرقم.*\nممكن الرقم غير صالح أو السرفيس مشغول.`
            }, { quoted: msg });
        }

        const owner     = info['Owner'] || '🔒 مخفي';
        const country   = info['Country'] || '—';
        const carrier   = info['Carrier'] || '—';
        const lineType  = info['Line Type'] || '—';
        const intl      = info['International'] || `+${cleanNumber}`;
        const national  = info['National'] || '—';
        const spamScore = info['Spam Score'] || '0%';
        const spamRep   = info['Spam Reports'] || '0';

        // Spam risk label
        const scoreNum = parseInt(spamScore) || 0;
        const spamLabel = scoreNum >= 70
            ? '🔴 خطر عالي'
            : scoreNum >= 30
            ? '🟡 مشبوه'
            : '🟢 آمن';

        // Line type emoji
        const lineEmoji = lineType.toUpperCase().includes('MOBILE') ? '📱' : '☎️';

        const resultText =
`╔══════════════════════╗
📞 *Truecaller — معطيات الرقم*
╚══════════════════════╝

🔢 *الرقم:* \`${intl}\`
🏠 *الرقم الوطني:* \`${national}\`

━━━━━━━━━━━━━━━━━━━━━
👤 *الاسم (Owner):* ${owner}
🌍 *البلد:* ${country}
📡 *المشغل:* ${carrier}
${lineEmoji} *نوع الخط:* ${lineType}
━━━━━━━━━━━━━━━━━━━━━
⚠️ *درجة الإزعاج:* ${spamScore} — ${spamLabel}
📊 *تقارير Spam:* ${spamRep}
━━━━━━━━━━━━━━━━━━━━━

🤖 _Hamza Amirni Bot — بوت حمزة اعمرني_`;

        return await sock.sendMessage(chatId, { text: resultText }, { quoted: msg });

    } catch (err) {
        console.error('[Truecaller] Error:', err.message);
        return await sock.sendMessage(chatId, {
            text: `❌ *حدث خطأ أثناء البحث.*\n⚙️ السرفيس قد يكون مشغولاً، جرب مجدداً بعد لحظة.\n\n_Error: ${err.message.substring(0, 80)}_`
        }, { quoted: msg });
    }
};
