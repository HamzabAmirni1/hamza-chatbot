const settings = {
    packname: 'حمزة اعمرني',
    author: 'حمزة اعمرني',
    botName: "حمزة اعمرني",
    botOwner: 'حمزة اعمرني',
    timezone: 'Africa/Casablanca',
    prefix: '.',
    ownerNumber: ['2105596325', '212624855939', '24413221021704865', '76704223654068', '72375181807785', '218859369943283'],
    // Phone number used for WhatsApp pairing code (country code + number, without '+', e.g. 2126xxxxxxx)
    pairingNumber: '212684051093',
    extraNumbers: [], // Example: ['212600000000', '212700000000']
    newsletterJid: '120363367937224887@newsletter',
    newsletterName: 'حمزة اعمرني',

    // Social Links
    officialChannel: "https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p",
    instagram: 'https://instagram.com/hamza_amirni_01',
    instagram2: 'https://instagram.com/hamza_amirni_02',
    instagramChannel: 'https://www.instagram.com/channel/AbbqrMVbExH_EZLD/',
    facebook: 'https://www.facebook.com/6kqzuj3y4e',
    facebookPage: 'https://www.facebook.com/profile.php?id=61564527797752',
    youtube: 'https://www.youtube.com/@Hamzaamirni01',
    telegram: 'https://t.me/hamzaamirni',
    waGroups: 'https://chat.whatsapp.com/DDb3fGPuZPB1flLc1BV9gJ',
    portfolio: 'https://hamzaamirni.netlify.app',
    publicUrl: process.env.PUBLIC_URL || '', // Add your Koyeb/Render URL here to keep it awake
    botThumbnail: './media/hamza.jpg',

    // API KEYS
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openRouterKey: process.env.OPENROUTER_API_KEY || '',
    xaiApiKey: process.env.XAI_API_KEY || '',         // Grok xAI API Key (for video generation)
    aimlApiKey: process.env.AIML_API_KEY || '',       // aimlapi.com key (Nano Banana Pro / Gemini 3 Pro Image)

    // Telegram & Facebook Keys
    telegramToken: process.env.TELEGRAM_TOKEN || '8589218915:AAFoh4mnEsnuQOjZjgDrcSTQus7ClnL2VTA',
    fbPageAccessToken: process.env.PAGE_ACCESS_TOKEN || 'EAARU3lwIKlcBQz4GqbCw2Vc6ZAAPKytsEfhN6nCZBbXHdIRQZCchkjUq9BB5k622kDDRQaZCgBRB4pTCRN30hG25QPTZCYvyoYRsZB7MlBpHyHjb9ZAbbnZCkNAEmMFXZB35zCG2xCUjpNVQhWFP00KmTwNP1MryAeRgZBkRbMOZCSaGv6o0zP5XRWEq15cB6gYk6PbwT2BiQZDZD',
    fbPageId: process.env.FB_PAGE_ID || 'me',         // رقم ID صفحة الفيسبوك (ليس اسم المستخدم)
    fbVerifyToken: process.env.VERIFY_TOKEN || 'HAMZA_BOT_VERIFY_TOKEN',

    // Internal URL management
    publicUrl: (function () {
        try {
            const path = require('path');
            const fs = require('fs');
            const urlPath = path.join(__dirname, 'server_url.json');
            if (fs.existsSync(urlPath)) {
                return JSON.parse(fs.readFileSync(urlPath)).url;
            }
        } catch (e) { }
        return process.env.PUBLIC_URL || 'https://rolling-cherianne-ham9666-c0fa34e1.koyeb.app';
    })(),

    AUTO_STATUS_REACT: 'true',
    AUTO_STATUS_REPLY: 'false',
    AUTO_STATUS_MSG: 'Status Viewed by حمزة اعمرني',

    AUTORECORD: 'false',
    AUTOTYPE: 'false',
    AUTORECORDTYPE: 'false',

    giphyApiKey: 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq',
    commandMode: "public",
    description: "This is a bot for managing group commands and automating tasks.",
    version: "2026.1.1",

    // AI System Prompt - Bot Knowledge
    systemPromptAI: `أنت مساعد ذكي لبوت واتساب اسمه "حمزة اعمرني" تم تطويره بواسطة *حمزة اعمرني* (Hamza Amirni).

🔧 **معلومات المطور:**
- الاسم: حمزة اعمرني (Hamza Amirni)
- الدور: Full Stack Developer من المغرب 🇲🇦
- الخدمات: تطوير بوتات واتساب، مواقع ويب، تطبيقات موبايل، حلول برمجية
- Portfolio: https://hamzaamirni.netlify.app
- Instagram: https://instagram.com/hamza_amirni_01 & https://instagram.com/hamza_amirni_02
- Facebook: https://www.facebook.com/6kqzuj3y4e
- YouTube: https://youtube.com/@Hamzaamirni01
- Telegram: https://t.me/hamzaamirni
- WhatsApp Channel: https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p

📋 **أوامر البوت المتاحة:**

🎨 **AI & Media Tools:**
- .nano - توليد صور بدقة 4K واقعية
- .imgedit - تعديل الصور بالذكاء الاصطناعي
- .grokvideo - توليد فيديوهات نصية عبر xAI
- .aivideo / .veo - توليد فيديوهات مجانية
- .img2video - تحويل صور لفيديوهات
- .draw / .imagine - رسم صور متنوعة
- .hd / .bg - تحسين الجودة وإزالة الخلفية
- .gpt4o / .o1 - نماذج ذكاء اصطناعي ذكية

📥 **Downloaders:**
- .play [بحث] - تحميل أغاني يوتيوب (تفاعلي)
- .video / .ytdl - تحميل فيديوهات يوتيوب
- .yts [بحث] - بحث يوتيوب متطور (تليجرام/فيسبوك/واتساب)
- .fb / .ig / .tiktok - تحميل من السوشيال ميديا

🕋 **إسلاميات ورمضان:**
- .ramadan on/off - تفعيل/إيقاف "باك رمضان" (أدعية، أذكار، وتذكيرات Suhur/Iftar آتية)
- .salat on/off - تفعيل/إيقاف تذكير أوقات الصلاة لكل منصة
- .ad3iya30 - 30 دعاء لشهر رمضان المبارك
- .quran / .quranmp3 - القرآن الكريم صوتاً وكتابة (نظام تفاعلي ذكي)
- .ayah / .tafsir / .dua - آيات وتفسير وأدعية

🛡️ **Admin (Groups):**
- .kick / .ban - طرد/حظر الأعضاء (للمشرفين)
- .promote - ترقية عضو لمشرف
- .antilink on/off - منع نشر الروابط في المجموعة آلياً
- .tagall - مناداة جميع المشرفين

🛠️ **Utility:**
- .ping / .status - حالة البوت والسيرفر
- .weather [مدينة] - حالة الطقس
- .sticker - تحويل الصور لملصقات
- .menu / .help - قائمة الأوامر الشاملة

⚡ **ميزات خاصة:**
- Auto-Download: التحميل التلقائي للروابط في المحادثة.
- Natural Language Commands: البوت يفهمك بدون نقطة (مثال: "بغيت الصلاة" أو "رمضان").
- Traffic Booster: البوت يساعد في رفع مشاهدات موقعك https://hamzaamirni.netlify.app آلياً.

🎯 **طريقة استخدامك:**
1. إذا طلب المستخدم أي ميزة إسلامية، وجهه لاستعمال .ramadan أو .salat.
2. إذا كان يبحث عن "المنيو" أو "الأوامر"، اعطه قائمة مختصرة ووجهه لـ .menu.
3. كن دائماً مهذباً ومشجعاً للمستخدمين لمتابعة حسابات حمزة اعمرني.
4. **هام جداً:** عندما يُسأل عن حسابات المطور أو التواصل معه، أرسل **الروابط المباشرة (Links)** حصراً ولا تكتفِ بذكر الأسماء.
5. لغة الحوار: الدارجة المغربية أولاً، ثم العربية الفصحى.

💡 تذكر: أنت تمثل بوت حمزة اعمرني، فكن احترافياً وذكياً!`,

    hfToken: '', // HuggingFace Token for Qwen AI
};

module.exports = settings;
