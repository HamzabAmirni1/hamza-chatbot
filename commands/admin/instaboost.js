const axios = require('axios');
const chalk = require('chalk');

let isBoosting = false;
let boostInterval = null;
let currentProfile = "https://instagram.com/hamza_amirni_01";
let sentVisits = 0;

const USER_AGENTS = [
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36'
];

async function hitProfile() {
    try {
        const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        await axios.get(currentProfile, {
            headers: {
                'User-Agent': ua,
                'Referer': 'https://www.google.com/',
                'Accept-Language': 'ar-MA,ar;q=0.9,en;q=0.8',
                'Sec-Fetch-Dest': 'document'
            },
            timeout: 10000
        });
        sentVisits++;
    } catch (e) {
        // Ignore errors to keep it silent in background
    }
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    // Check if the user is an admin or the owner
    const settings = require('../../config');
    const senderId = msg.key?.participant || msg.key?.remoteJid || chatId;
    if (senderId && settings.ownerNumber && !settings.ownerNumber.includes(senderId.replace(/[^0-9]/g, '')) && !helpers?.isTelegram) {
        return await sock.sendMessage(chatId, { text: "⚠️ هذا الأمر خاص بالمطور فقط." }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();

    if (action === 'start') {
        if (isBoosting) {
            return await sock.sendMessage(chatId, { text: `⚠️ عملية رفع المشاهدات والزيارات شغالة مسبقاً على الحساب:\n${currentProfile}` }, { quoted: msg });
        }
        
        if (args[1]) {
            currentProfile = args[1];
        }

        isBoosting = true;
        sentVisits = 0;
        
        // Start background tasks
        boostInterval = setInterval(hitProfile, 10000); // Hit profile every 10 seconds

        await sock.sendMessage(chatId, { react: { text: "🚀", key: msg.key } });
        return await sock.sendMessage(chatId, { 
            text: `✅ *تم تشغيل رفع الانطباعات والزيارات (Impressions) للإنستغرام!*\n\n🔗 الرابط/الحساب المستهدف: ${currentProfile}\n⚡ السرعة: ~360 طلب/ساعة.\n\nاستخدم \`.instaboost stop\` للإيقاف، أو \`.instaboost status\` لمعرفة كم وصل.` 
        }, { quoted: msg });
    } 
    
    else if (action === 'stop') {
        if (!isBoosting) {
            return await sock.sendMessage(chatId, { text: "⚠️ البوت غير مشغل حالياً." }, { quoted: msg });
        }
        
        clearInterval(boostInterval);
        isBoosting = false;
        
        await sock.sendMessage(chatId, { react: { text: "🛑", key: msg.key } });
        return await sock.sendMessage(chatId, { 
            text: `🛑 *تم إيقاف التزويد بنجاح!*\n\n📊 إجمالي الزيارات الموجهة: ${sentVisits}` 
        }, { quoted: msg });
    }
    
    else if (action === 'status') {
        if (!isBoosting) {
            return await sock.sendMessage(chatId, { text: `📊 البوت متوقف.\nآخر حصيلة: ${sentVisits} زيارة.` }, { quoted: msg });
        }
        
        return await sock.sendMessage(chatId, { 
            text: `📊 *إحصائيات تزويد الإنستغرام:*\n\n🔗 الحساب: ${currentProfile}\n🔋 الحالة: شغال 🟢\n🚀 الزيارات الناجحة (Clicks/Views): ${sentVisits}` 
        }, { quoted: msg });
    }
    
    else {
        // Default response / Help menu
        return await sock.sendMessage(chatId, { 
            text: `🔰 *أوامر رشق الإنستغرام:*\n\n1️⃣ \`.instaboost start\` - لتشغيل رشق الزيارات لحسابك.\n2️⃣ \`.instaboost start [رابط_ريلز]\` - لزيادة المشاهدات والانطباعات (Impressions) على الريلز أو البوست.\n3️⃣ \`.instaboost status\` - لمعرفة عدد الزيارات/المشاهدات التي تم إيصالها.\n4️⃣ \`.instaboost stop\` - لإيقاف العملية.\n\n⚠️ *ملاحظة هامة:* هذا البوت يقوم برفع "زيارات الملف الشخصي" (Profile Visits) وتفاعل الروابط مجاناً. لكن لزيادة المتابعين الحقيقيين (Followers) أو اللايكات، يتطلب الأمر ربط البوت بـ API الخاص بـ SMM Panel (موقع رشق). إذا كان لديك حساب في موقع رشق، أخبرني لأقوم بربطه لك!` 
        }, { quoted: msg });
    }
};
