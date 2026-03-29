/**
 * ============================================================
 * UNIFIED COMMAND MAP - جميع الأوامر لجميع المنصات
 * WhatsApp | Telegram | Facebook
 * ============================================================
 * Single source of truth for all bot commands.
 * Any new command added here is automatically available on ALL platforms.
 */

const ALL_COMMANDS = {
    // ─── 🕌 Islamic ───────────────────────────────────────────
    "salat": "islamic/salat", "sala": "islamic/salat", "prayer": "islamic/salat",
    "صلاة": "islamic/salat", "أوقات": "islamic/salat", "الصلاة": "islamic/salat",
    "أوقات-الصلاة": "islamic/salat",

    "dua": "islamic/ad3iya", "ad3iya": "islamic/ad3iya", "دعاء": "islamic/ad3iya",
    "اذكار": "islamic/ad3iya", "ذكر": "islamic/ad3iya",
    "ad3iya30": "islamic/ad3iya30",

    "ramadan": "islamic/ramadan", "رمضان": "islamic/ramadan",
    "دعاء-رمضان": "islamic/ramadan", "نصيحة-رمضان": "islamic/ramadan",

    "khatm": "islamic/khatm", "ختمة": "islamic/khatm",

    "ayah": "islamic/ayah", "آية": "islamic/ayah", "اية": "islamic/ayah",

    "quran": "islamic/quran", "قرآن": "islamic/quran", "سورة": "islamic/quran",
    "quransura": "islamic/quransura", "quransurah": "islamic/quransurah",
    "quranread": "islamic/quranread", "quranmp3": "islamic/quranmp3",
    "qdl": "islamic/qdl", "qurancard": "islamic/qurancard",
    "quranpdf": "islamic/quranpdf",

    "tafsir": "islamic/tafsir", "تفسير": "islamic/tafsir",
    "continue": "islamic/continue",

    // ─── 📥 Download / تحميل ──────────────────────────────────
    "github": "thmil/github", "git": "thmil/github", "مستودع": "thmil/github",
    "ytdl": "thmil/ytdl", "ytmp4": "thmil/ytmp4", "ytmp4v2": "thmil/ytmp4v2",
    "yts": "thmil/yts",
    
    "ytv": "thmil/ytv", "ytdown": "thmil/ytv",
    "yta": "thmil/yta", "ytaudio": "thmil/yta",

    "play": "thmil/play", "song": "thmil/play", "أغنية": "thmil/play",

    "video": "thmil/video", "vid": "thmil/video", "فيديو": "thmil/video",

    "fb": "thmil/fb", "facebook": "thmil/fb", "فيسبوك": "thmil/fb",

    "ig": "thmil/ig", "instagram": "thmil/ig", "إنستغرام": "thmil/ig",

    "tiktok": "thmil/tiktok", "تيكتوك": "thmil/tiktok",

    "pinterest": "thmil/pinterest", "pin": "thmil/pinterest",

    "capcut": "thmil/capcut", "capcutdl": "thmil/capcut",

    "apk": "thmil/apk", "app": "thmil/apk", "تطبيق": "thmil/apk",

    "lyrics": "thmil/lyrics", "كلمات-أغنية": "thmil/lyrics",

    // ─── 🤖 AI ────────────────────────────────────────────────
    "analyze": "ai/analyze", "vision": "ai/analyze",
    "hl": "ai/analyze", "تحليل": "ai/analyze", "حلل": "ai/analyze",

    "gpt4o": "ai/chat", "gpt4om": "ai/chat", "gpt4": "ai/chat",
    "gpt3": "ai/chat", "o1": "ai/chat", "chat": "ai/chat",

    "deepseek": "ai/deepseek",

    "miramuse": "ai/miramuse",

    "ai-image": "ai/ai-image",

    "img2video": "ai/img2video", "i2v": "ai/img2video",
    "فيديو-صورة": "ai/img2video", "videoai": "ai/img2video",

    "grokvideo": "ai/grokvideo", "grok": "ai/grokvideo",
    "video-ai": "ai/grokvideo", "فيديو-ذكاء": "ai/grokvideo",

    "aivideo": "ai/aivideo", "veo": "ai/aivideo",
    "text2video": "ai/aivideo", "فيديو-نص": "ai/aivideo",


    // ─── 🖼 Image ─────────────────────────────────────────────
    "gen": "image/gen", "generate": "image/gen", "photo": "image/gen",
    "image": "image/gen", "img": "image/gen",
    "تخيل": "image/gen", "ارسم": "image/gen", "صورة": "image/gen",

    "imagine": "image/imagine",

    // ─── Stable Diffusion (AUTOMATIC1111 inspired) ───
    "sd": "image/sd", "stablediffusion": "image/sd", "sdgen": "image/sd",
    "txt2img": "image/sd", "sd15": "image/sd", "sdxl": "image/sd",

    "removebg": "image/pixa-removebg", "pixa-removebg": "image/pixa-removebg",

    "deepimg": "image/deepimg", "deepimage": "image/deepimg",

    "upscale": "image/upscale", "hd-photo": "image/upscale",
    "upscaler": "image/upscale", "رفع-جودة": "image/upscale",

    "hdv3": "image/hdv3",

    "aiedit": "image/aiedit", "edit": "image/aiedit", "editimg": "image/aiedit",
    "imgedit": "image/aiedit", "تعديل": "image/aiedit", "عدل": "image/aiedit",
    "colorize": "image/colorize", "لون": "image/colorize", "تلوين": "image/colorize",

    "sketch": "image/sketch", "رسم-رصاص": "image/sketch", "pencil": "image/sketch",
    "sketch2": "image/sketch2", "pencil2": "image/sketch2", "رصاص": "image/sketch2",

    "wallpaper": "image/wallpaper", "wp": "image/wallpaper",
    "خلفية": "image/wallpaper", "4kwp": "image/wallpaper",
    "4kwallpaper": "image/wallpaper",

    "gimg": "image/gimg", "imgbahth": "image/gimg", "بحث-صورة": "image/gimg",

    "googleimg": "image/googleimg", "gimage": "image/googleimg", "صور": "image/googleimg",

    "brat": "image/brat", "برات": "image/brat",


    "draw": "image/draw", "رسم": "image/draw",

    // ─── 🛠 Tools ────────────────────────────────────────────
    "weather": "tools/weather", "wether": "tools/weather",
    "طقس": "tools/weather", "جو": "tools/weather",

    "ping": "tools/ping", "status": "tools/ping", "بينج": "tools/ping",

    "credits": "tools/credits", "quota": "tools/credits", "كريدت": "tools/credits",

    "tempnum": "tools/tempnum", "getsms": "tools/tempnum",

    "blur": "tools/blur", "ضباب": "tools/blur", "طمس": "tools/blur",

    "tomp3": "tools/tomp3", "toaudio": "tools/tomp3",

    "toimg": "tools/toimg", "لصورة": "tools/toimg", "photosticker": "tools/toimg",

    "sticker": "tools/sticker", "s": "tools/sticker",
    "stiker": "tools/sticker", "ملصق": "tools/sticker",

    "style": "tools/style", "font": "tools/style", "decoration": "tools/style",

    "ffnews": "tools/ffnews", "freefire": "tools/ffnews",

    // ─── 🇲🇦 Morocco ──────────────────────────────────────────
    "alloschool": "morocco/alloschool", "alloschoolget": "morocco/alloschool",
    "allo": "morocco/alloschool", "دروس": "morocco/alloschool", "فروض": "morocco/alloschool",

    "hespress": "morocco/hespress", "hespressread": "morocco/hespress",
    "أخبار": "morocco/hespress", "news": "morocco/hespress",

    "alwadifa": "morocco/alwadifa", "وظائف": "morocco/alwadifa",
    "wdifaread": "morocco/alwadifa",

    // ─── ℹ️ Info ──────────────────────────────────────────────
    "menu": "info/menu", "help": "info/menu", "قائمة": "info/menu",
    "owner": "info/owner",
    "socials": "info/socials", "social": "info/socials",
    "tg": "info/socials", "telegram": "info/socials",
    "yt": "info/socials", "youtube": "info/socials",
    "channel": "info/socials", "web": "info/socials",
    "portfolio": "info/socials",
    "hamza": "info/socials", "developer": "info/socials",
    "links": "info/socials", "about": "info/socials", "info": "info/socials",

    // ─── ⚙️ Admin ─────────────────────────────────────────────
    "broadcast": "admin/broadcast", "devmsg": "admin/broadcast",
    "devmsgwa": "admin/broadcast", "devmsgtg": "admin/broadcast",
    "devmsgfb": "admin/broadcast", "devmsgtous": "admin/broadcast",
    "devmsgall": "admin/broadcast",

    "fbpost": "admin/fbpost", "pagepost": "admin/fbpost",
    "postfb": "admin/fbpost", "نشر": "admin/fbpost",

    "seturl": "admin/seturl",
    "traffic": "admin/traffic",
    "anticall": "admin/anticall",

    "instaboost": "admin/instaboost", "igboost": "admin/instaboost",
    "زيادة-متابعين": "admin/instaboost", "رشق": "admin/instaboost",

    "mega": "info/mega", "automation": "info/mega", "ميجا": "info/mega",
    "autopost": "admin/autopost", "expert": "ai/expert", "brainstorm": "ai/expert",
    "news": "info/news", "أخبار": "info/news", "akhbar": "info/news",
    "price": "info/price", "سعر": "info/price",
};

/**
 * NLC (Natural Language Commands) - triggers without dot prefix
 * Used when user types naturally without a command prefix.
 */
const NLC_KEYWORDS = {
    "مستودع|github|git": "thmil/github",
    "قرآن|quran|سورة|sura|القرآن": "islamic/quran",
    "آية|اية|ayah": "islamic/ayah",
    "تفسير|tafsir": "islamic/tafsir",
    "دعاء|dua|اذكار|ad3iya": "islamic/ad3iya",
    "رمضان|ramadan": "islamic/ramadan",
    "صلاة|salat|prayer|أوقات": "islamic/salat",
    "طقس|weather|wether|الطقس": "tools/weather",
    "بينج|ping|status": "tools/ping",
    "فيديو-صورة|img2video": "ai/img2video",
    "يوتيوب|تحميل|ytdl|youtube": "thmil/ytdl",
    "فيسبوك|facebook|fb": "thmil/fb",
    "انستقرام|instagram|ig": "thmil/ig",
    "تيكتوك|tiktok": "thmil/tiktok",
    "tomp3|mp3-تحويل": "tools/tomp3",
    "sd|stablediffusion|txt2img": "image/sd",
    "gen|generate|genimage|photo|image|img|تخيل|ارسم|صورة": "image/gen",
    "aivideo|veo|text2video": "ai/aivideo",
    "تطبيق|apk|app": "thmil/apk",
    "قائمة|menu|help": "info/menu",
    "عدل|تعديل|3dl|edit|aiedit": "image/aiedit",
};

module.exports = { ALL_COMMANDS, NLC_KEYWORDS };
