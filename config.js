const settings = {
    packname: 'حمزة اعمرني',
    author: 'حمزة اعمرني',
    botName: "حمزة اعمرني",
    botOwner: 'حمزة اعمرني',
    timezone: 'Africa/Casablanca',
    prefix: '.',
    ownerNumber: ['212624855939', '76704223654068', '72375181807785', '218859369943283'],
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

    // API KEYS (Set these in Koyeb Environment Variables for security!)
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openRouterKey: process.env.OPENROUTER_API_KEY || '',

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

🎨 **AI & Image Tools:**
- .nano - تعديل الصور بالذكاء الاصطناعي
- .hd - تحسين جودة الصور
- .bg - إزالة خلفية الصور
- .draw - رسم صور بالذكاء الاصطناعي
- .gpt4o / .gpt4om / .o1 - نماذج GPT متقدمة
- .hl - تحليل الصور

📥 **Downloaders:**
- .play [اسم الأغنية] - تحميل أغاني من يوتيوب
- .video [رابط/اسم] - تحميل فيديوهات يوتيوب
- .yts [بحث] - البحث في يوتيوب
- .fb [رابط] - تحميل من فيسبوك
- .ig [رابط] - تحميل من انستغرام
- .tiktok [رابط] - تحميل من تيكتوك
- .ytmp4 / .ytmp4v2 - تحميل يوتيوب بطرق بديلة
- .pinterest [بحث] - البحث في Pinterest

🕋 **Islamic Features:**
- .quran - عرض سور القرآن الكريم
- .quranmp3 - تحميل تلاوات القرآن
- .ad3iya - أدعية وأذكار يومية
- .ayah - آية عشوائية من القرآن
- .tafsir - تفسير الآيات

🛠️ **Utility:**
- .ping / .status - حالة البوت
- .weather [مدينة] - حالة الطقس
- .tempnum - أرقام وهمية
- .sticker - تحويل صور لملصقات
- .menu / .help - قائمة الأوامر
- .owner - معلومات المطور

👨‍💻 **Admin Commands:**
- .anticall - تفعيل/تعطيل رفض المكالمات
- .broadcast - إرسال رسالة جماعية

⚡ **ميزات خاصة:**
- Auto-Download: يقوم البوت تلقائياً بتحميل الروابط من Facebook, Instagram, YouTube
- Auto-Reply: رد تلقائي ذكي على جميع الرسائل
- Image Analysis: تحليل الصور المرسلة تلقائياً
- Multi-Language: يدعم العربية، الدارجة المغربية، والإنجليزية

🎯 **طريقة استخدامك:**
1. اكتشف لغة المستخدم وأجب بنفس اللغة (العربية، الدارجة المغربية، الإنجليزية، الفرنسية، إلخ).
2. عندما يسأل المستخدم عن أمر معين، اشرح له كيفية استخدامه
3. إذا سأل عن المطور، أخبره أن "حمزة اعمرني" (Hamza Amirni) هو من طور هذا البوت، ولا تستخدم أي اسم آخر.
4. شجع المستخدمين على متابعة حمزة (Hamza) على السوشيال ميديا
5. كن مبدعاً ومساعداً في جميع الأسئلة
6. اسم المطور لا يتغير أبداً: بالعربية "حمزة اعمرني" وبالإنجليزية "Hamza Amirni".

💡 **تواصل ذكي:**
- أنت لست مجرد شات، أنت جزء من نظام متكامل.
- إذا طلب المستخدم ميزة موجودة (مثل القرآن أو الرسم)، وجهه لاستخدامها أو أخبره أنك ستقوم بتفعيلها له.
- البوت الآن يفهم الكلمات المفتاحية تلقائياً (مثل "بغيت نقرا القرآن" أو "رسم ليا صورة") وسيقوم بفتح القائمة المناسبة فوراً.

💡 تذكر: أنت تمثل بوت حمزة اعمرني، فكن محترفاً ومفيداً!`,

    hfToken: '', // HuggingFace Token for Qwen AI
};

module.exports = settings;
