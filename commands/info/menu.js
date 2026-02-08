const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');
const { getUptime } = require('../lib/utils');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const menuText = `✨ *───❪ ${config.botName.toUpperCase()} ❫───* ✨

🤖 *BOT IDENTITY:*
أنا الذكاء الاصطناعي المطور من طرف *حمزة اعمرني*.
أنا خدام أوتوماتيك (Auto-Reply) بلا ما تحتاج تدير نقطة، غير سولني وغادي نجاوبك فالحين! 🧠⚡

┏━━━━━━━━━━━━━━━━━━┓
┃  🛠️ *AI IMAGE TOOLS*
┃ ├ 🪄 *.nano* ┈ تعديل سحري
┃ ├ ✨ *.hd* ┈ تحسين الجودة
┃ ├ 🖼️ *.bg* ┈ إزالة الخلفية
┃ ├ 🎨 *.draw* ┈ الرسم الذكي
┃ └ 🧠 *.hl* ┈ تحليل الصور
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  🤖 *AI CHAT MODELS*
┃ ├ 🤖 *.gpt4o* ┈ GPT-4o
┃ ├ ⚡ *.gpt4om* ┈ 4o Mini
┃ ├ 🧠 *.o1* ┈ OpenAI O1
┃ └ 💬 *Auto-Reply*
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  📡 *ADDITIONAL SERVICES*
┃ ├ 📱 *.tempnum* ┈ أرقام وهمية
┃ ├ 🔍 *.yts* ┈ بحث يوتيوب
┃ ├ 🌡️ *.weather* ┈ حالة الطقس
┃ └ 🏓 *.ping* ┈ سرعة البوت
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  🕋 *ISLAMIC FEATURES*
┃ ├ 🤲 *.ad3iya* ┈ أدعية وأذكار
┃ ├ 📖 *.ayah* ┈ آية من القرآن
┃ ├ 🕋 *.quran* ┈ سورة كاملة
┃ └ 📚 *.tafsir* ┈ تفسير الآيات
┗━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━┓
┃  📱 *DEVELOPER SOCIALS*
┃ ├ 📸 *Instagram:*
┃   ${config.instagram}
┃ ├ 📺 *YouTube:*
┃   ${config.youtube}
┃ ├ ✈️ *Telegram:*
┃   ${config.telegram}
┃ ├ 📘 *Facebook:*
┃   ${config.facebook}
┃ ├ 📢 *WA Channel:*
┃   ${config.officialChannel}
┃ └ 🌐 *Portfolio:*
┃   ${config.portfolio}
┗━━━━━━━━━━━━━━━━━━┛

👑 *Developer:* ${config.botOwner}
📌 *Uptime:* ${getUptime()}

✨ *Active 24/7 on Koyeb* ✨`;

    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");
    const imageExists = fs.existsSync(imagePath);

    const messageContent = {
        image: imageExists
            ? { url: imagePath }
            : { url: "https://pollinations.ai/p/cool-robot-assistant" },
        caption: menuText,
        contextInfo: {
            externalAdReply: {
                title: config.botName,
                body: `Developed by ${config.botOwner}`,
                thumbnail: imageExists ? fs.readFileSync(imagePath) : null,
                sourceUrl: config.portfolio,
                mediaType: 1,
                renderLargerThumbnail: true,
            },
        },
    };

    await sock.sendMessage(chatId, messageContent, { quoted: msg });
    await sock.sendMessage(chatId, {
        react: { text: "📜", key: msg.key },
    });
};
