const settings = require('../../config');

async function ownerCommand(sock, chatId, msg, args, commands, userLang) {
    const primaryOwner = Array.isArray(settings.ownerNumber) ? settings.ownerNumber[0] : settings.ownerNumber;

    const ownerInfo = `👑 *معلومات المطور*

╔════════════════════╗
  📋 *البيانات الشخصية*
╚════════════════════╝
▫️ *الاسم:* ${settings.botOwner}
▫️ *الدور:* Full Stack Developer
▫️ *البلد:* المغرب 🇲🇦
▫️ *الحالة:* متاح للعمل ✅

🛠️ *الخدمات المتوفرة*
━━━━━━━━━━━━━━━━━━━━
✅ تطوير بوتات واتساب
✅ تطوير مواقع ويب احترافية
✅ تطبيقات موبايل
✅ حلول برمجية مخصصة

🚀 *المشاريع والأعمال*
🌐 ${settings.portfolio}

╭━━━━━ 🔗 قنوات التواصل ━━━━━╮

📸 *Instagram:*
  └ 1st: ${settings.instagram}
  └ 2nd: ${settings.instagram2}

👤 *Facebook:*
  └ Profile: ${settings.facebook}
  └ Page: ${settings.facebookPage}

✈️ *Telegram:* ${settings.telegram}
🎥 *YouTube:* ${settings.youtube}
👥 *WhatsApp Groups:* ${settings.waGroups}
🔔 *Official Channel:* ${settings.officialChannel}

╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

💡 *"نحول أفكارك إلى واقع رقمي"*
💼 Powered by: ${settings.author}

*#${settings.botName.replace(/\\s/g, '')} #WebDeveloper #Projects*`;

    // Send owner info message
    await sock.sendMessage(chatId, { text: ownerInfo }, { quoted: msg });

    // Send contact card
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${settings.botOwner}
ORG:${settings.botOwner} - Professional Developer
TEL;type=CELL;type=VOICE;waid=${primaryOwner}:+${primaryOwner}
item1.URL:${settings.portfolio}
item1.X-ABLabel:Portfolio
item2.URL:${settings.instagram}
item2.X-ABLabel:Instagram
item3.URL:${settings.youtube}
item3.X-ABLabel:YouTube
item4.URL:${settings.officialChannel}
item4.X-ABLabel:WhatsApp Channel
END:VCARD`;

    await sock.sendMessage(chatId, {
        contacts: {
            displayName: settings.botOwner,
            contacts: [{ vcard }]
        }
    }, { quoted: msg });
}

module.exports = ownerCommand;
