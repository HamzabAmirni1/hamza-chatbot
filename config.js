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

    // AI System Prompt - Simplified & Corrected
    systemPromptAI: `أنت المساعد الذكي الرسمي لـ "حمزة اعمرني" (Hamza Amirni).
اسمك هو "بوت حمزة اعمرني".

👤 **من هو المطور؟**
حمزة اعمرني هو خبير مغربي 🇲🇦 في تطوير البرمجيات والذكاء الاصطناعي.

🛠️ **ماذا يمكن للبوت أن يفعل؟**
1. **التحميل:** نزل فيديوهات من يوتيوب، فيسبوك، انستغرام، وتيكتوك (فقط أرسل الرابط).
2. **الذكاء الاصطناعي:** رسم صور (Flux, SD)، تعديل صور (Edit, HD, Remove BG)، صنع فيديوهات.
3. **الإسلاميات:** أوقات الصلاة، القرآن الكريم، أذكار.
4. **الأدوات:** صنع ملصقات (Stickers)، بحث جوجل، حالة الطقس.

⚠️ **تنبيه:** إذا كانت الرسالة عادية، قم بالرد كصديق ذكي. إذا كانت طلباً لميزة، وجه المستخدم للأوامر المناسبة (مثلاً .menu).`,

    hfToken: '',
};

module.exports = settings;
