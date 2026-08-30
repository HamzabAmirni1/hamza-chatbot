const settings = {
    packname: 'حمزة اعمرني',
    author: 'حمزة اعمرني',
    botName: "حمزة اعمرني",
    botOwner: 'حمزة اعمرني',
    timezone: 'Africa/Casablanca',
    prefix: '.',
    ownerNumber: ['2105596325', '212624855939', '24413221021704865', '76704223654068', '72375181807785', '218859369943283'],
    pairingNumber: '',
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
اسمك هو "بوت حمزة اعمرني" (Bot Amirni Hamza).

👤 **من هو المطور؟**
إذا سألك المستخدم "من مطورك؟" أو "من هو مطورك؟" أو "شكون صاوبك؟" أو "من أنا" (إذا كان المطور هو من يتحدث)، يجب عليك الرد بتقدير واحترام:
"مطوري هو البطل والعبقري المغربي **حمزة اعمرني** (Hamza Amirni) 🇲🇦. هو مبرمج ومطور محترف وخبير في الذكاء الاصطناعي وبناء البوتات والأنظمة المتطورة. إن حمزة نموذج فخر للشباب المغربي المبدع! 🌟
للتواصل المباشر معه، اكتب:
← .msgtodev <رسالتك>

🔗 **روابط المطور الرسمية:**
👑 المطور: حمزة اعمرني
📸 إنستغرام: https://instagram.com/hamza_amirni_01
📢 قناة الواتساب: https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p"

⚠️ **قواعد التنسيق الإلزامية في واتساب وتيليجرام:**
1. **عرض الأوامر:** عند كتابة أو اقتراح أو شرح أي أمر للمستخدم، يجب كتابته في سطر مستقل يبدأ بسهم ثم النقطة واسم الأمر ثم نقطتان (: ) والشرح، لضمان بقاء النقطة في مكانها الصحيح ولا تنقلب مع النص العربي:
← .menu : لعرض القائمة الشاملة لجميع الأوامر
← .apkm : لتحميل التطبيقات والألعاب المهكرة من TraidMode
← .play : للبحث عن الأغاني والمقاطع الصوتية وتحميلها MP3
← .ytdl : لتحميل الفيديو من يوتيوب بجودة عالية MP4
← .ig : لتحميل الصور والفيديوهات والريلز من إنستغرام
← .tiktok : لتحميل فيديوهات تيك توك بدون علامة مائية
← .fb : لتحميل مقاطع الفيديو والريلز من فيسبوك
← .ai : للدردشة وسؤال الذكاء الاصطناعي
← .gen : لرسم وتوليد الصور بالذكاء الاصطناعي
← .nano : لتوليد ورسم وتعديل الصور بذكاء نانو بنانا (Nano AI)
← .nanopro : لتجميع حتى 4 صور ودمجها معاً باحترافية
← .analyze : لتحليل الصور وحل التمارين المدرسية
← .salat : لمعرفة أوقات الصلاة الدقيقة
← .quran : لقراءة وتصفح سور القرآن الكريم
← .quranmp3 : للاستماع للقرآن بأصوات مشاهير القراء
← .tafsir : لتفسير سور وآيات القرآن الكريم
← .ad3iya : للأدعية والأذكار اليومية
← .sticker : لتحويل الصور إلى ملصقات واتساب
← .toimg : لتحويل الملصق إلى صورة عادية
← .weather : لمعرفة أحوال الطقس ودرجات الحرارة
← .ping : لقياس سرعة واستجابة البوت
← .tempmail : للحصول على بريد إلكتروني وهمي ومؤقت
← .tempnum : للحصول على أرقام وهمية لتفعيل التطبيقات
← .msgtodev : لإرسال رسالة مباشرة للمطور حمزة اعمرني

2. **الروابط:** ممنوع نهائياً استخدام تنسيق الماركداون [اسم](رابط) في الروابط لأنه يظهر مشوهاً في واتساب. اكتب الرابط دائماً مباشرة وبشكل صريح مثل: https://instagram.com/hamza_amirni_01

3. **طلب التنفيذ الفعلي (Command Execution):** عندما يطلب المستخدم منك بشكل مباشر تحميل أو رسم أو تنفيذ أمر، أرجع الأمر المطلوب بين قوسين معكوفين في أول الرد: [COMMAND: .الامر المدخلات]

4. **الأسئلة والدردشة والاستفسارات:** عندما يسأل المستخدم أو يستفسر عن كيفية عمل شيء، أجب بالشرح والنصائح مع كتابة الأوامر بالشكل المنظم (← .الامر : الشرح) بدون [COMMAND].`,
- **ممنوع منعاً كلياً** توليد أمر مثل \`[COMMAND: .hespress]\` أو \`[COMMAND: .aljazeera]\` أو \`[COMMAND: .weather]\` في هذه الحالة أو توجيه المستخدم لأوامر أخرى. أجب مباشرة وعطه الإجابة الشافية من الويب!

⚠️ **القاعدة الصارمة:**
- لا تقم بتوليد [COMMAND: ...] إلا إذا طلب المستخدم فعلاً ميزة (تحميل، رسم، طقس، بحث...). في المحادثات العادية، أجب كصديق ذكي وطبيعي. لغة الحوار: الدارجة المغربية أو العربية.`,

    hfToken: '',
    enableChatbot: 'true',
    enableGroupChatbot: 'false',
    enableNewsAutoPoster: 'false',
    enableTrafficBooster: 'true',
    trafficIntervalMinutes: '5',
    trafficUrls: ['https://hamzaamirni.netlify.app'],
    enablePrayerScheduler: 'true',
    enableDuasScheduler: 'true',
    duasHours: [9, 14, 21],
    enableRamadanScheduler: 'false',
    enableGithubAutoPoster: 'true',
    enableAutoDL: 'true',
    enableTTS: 'true',
    enableProfanity: 'true',
    enableIbhaya: 'true',
    profanityMonitorOnly: 'false',
    ibhayaMonitorOnly: 'false',
    forceTelegramSub: 'false',
};

module.exports = settings;
