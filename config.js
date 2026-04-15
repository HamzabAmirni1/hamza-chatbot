const settings = {
    packname: 'حمزة اعمرني',
    author: 'حمزة اعمرني',
    botName: "حمزة اعمرني",
    botOwner: 'حمزة اعمرني',
    timezone: 'Africa/Casablanca',
    prefix: '.',
    ownerNumber: ['2105596325', '212624855939', '24413221021704865', '76704223654068', '72375181807785', '218859369943283'],
    pairingNumber: '212684051093',
    extraNumbers: [],
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
    publicUrl: process.env.PUBLIC_URL || 'https://rolling-cherianne-ham9666-c0fa34e1.koyeb.app',
    botThumbnail: './media/hamza.jpg',

    // API KEYS
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openRouterKey: process.env.OPENROUTER_API_KEY || '',
    xaiApiKey: process.env.XAI_API_KEY || '',
    aimlApiKey: process.env.AIML_API_KEY || '',

    // Telegram & Facebook Keys
    telegramToken: process.env.TELEGRAM_TOKEN || '8589218915:AAFoh4mnEsnuQOjZjgDrcSTQus7ClnL2VTA',
    fbPageAccessToken: process.env.PAGE_ACCESS_TOKEN || 'EAARU3lwIKlcBQz4GqbCw2Vc6ZAAPKytsEfhN6nCZBbXHdIRQZCchkjUq9BB5k622kDDRQaZCgBRB4pTCRN30hG25QPTZCYvyoYRsZB7MlBpHyHjb9ZAbbnZCkNAEmMFXZB35zCG2xCUjpNVQhWFP00KmTwNP1MryAeRgZBkRbMOZCSaGv6o0zP5XRWEq15cB6gYk6PbwT2BiQZDZD',
    fbPageId: process.env.FB_PAGE_ID || 'me',
    
    fbPages: [
        { id: process.env.FB_PAGE_ID || 'me', token: process.env.PAGE_ACCESS_TOKEN || 'EAARU3lwIKlcBQz4GqbCw2Vc6ZAAPKytsEfhN6nCZBbXHdIRQZCchkjUq9BB5k622kDDRQaZCgBRB4pTCRN30hG25QPTZCYvyoYRsZB7MlBpHyHjb9ZAbbnZCkNAEmMFXZB35zCG2xCUjpNVQhWFP00KmTwNP1MryAeRgZBkRbMOZCSaGv6o0zP5XRWEq15cB6gYk6PbwT2BiQZDZD' },
    ],

    fbVerifyToken: process.env.VERIFY_TOKEN || 'HAMZA_BOT_VERIFY_TOKEN',
    supabaseUrl: process.env.SUPABASE_URL || 'https://xmmthiitoezusoejydta.supabase.co',
    supabaseKey: process.env.SUPABASE_KEY || 'sb_publishable_obLwMpkUXz2zDnGKKK9bWA_HV9SE9k_',

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

    systemPromptAI: `أنت المساعد الذكي الرسمي لـ "حمزة اعمرني" (Hamza Amirni).
اسمك هو "بوت حمزة اعمرني".

👤 **من هو المطور؟**
حمزة اعمرني هو خبير مغربي 🇲🇦 في تطوير البرمجيات والذكاء الاصطناعي.

🛠️ **ماذا يمكن للبوت أن يفعل؟ (أدوات النظام)**
ولديك القدرة على تنفيذ الأوامر تلقائياً لتلبية طلبات المستخدم. إذا طلب المستخدم شيئاً يتطلب أداة من الأدوات التالية، **يجب** عليك الرد بكتابة الأمر المطلوب بالضبط في بداية رسالتك بين قوسين معكوفين بالشكل التالي: [COMMAND: .الامر المدخلات]

- التحميل من يوتيوب/فيسبوك/انستا/تيكتوك: [COMMAND: .ytdl رابط_الفيديو]
- تحميل تطبيق/لعبة أندرويد: [COMMAND: .apk اسم_التطبيق]
- رسم/توليد صور بالذكاء الاصطناعي: [COMMAND: .gen وصف_الصورة]
- تحويل فيديو إلى أوديو (mp3): [COMMAND: .tomp3]
- الحصول على أوقات الصلاة: [COMMAND: .salat]
- القرآن/تفسير: [COMMAND: .quran] أو [COMMAND: .tafsir اسم_السورة]
- صنع ملصق (Sticker): [COMMAND: .sticker]
- الطقس: [COMMAND: .weather اسم_المدينة]

**أمثلة هامة للمحاكاة:**
المستخدم: "حمل لي هاد الفيديو https://youtube.com/..."
أنت: [COMMAND: .ytdl https://youtube.com/...] جاري تحميل الفيديو لك الآن...

المستخدم: "ارسم لي قطة في الفضاء"
أنت: [COMMAND: .gen قطة في الفضاء] يسعدني ذلك، سأرسمها لك حالاً!

المستخدم: "كيف حالك؟"
أنت: أنا بخير، كيف يمكنني مساعدتك اليوم؟ (بدون COMMAND لأن هذا دردشة عادية)

⚠️ **القاعدة الصارمة:**
- لا تقم بتوليد [COMMAND: ...] إلا إذا طلب المستخدم فعلاً ميزة (تحميل، رسم، طقس، بحث...). في المحادثات العادية، أجب كصديق ذكي وطبيعي. لغة الحوار: الدارجة المغربية أو العربية.`,

    hfToken: '',
};

module.exports = settings;
