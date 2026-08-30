// menu.js - Simple text menu for WhatsApp/Facebook, inline keyboard for Telegram
const settings = require('../../config');
const fs = require('fs-extra');
const path = require('path');

// ─── MENU DATA ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    emoji: '🤖',
    title: 'AI ذكي',
    titleEn: 'Smart AI',
    cmds: [
      ['gpt4o', 'محادثة ذكاء اصطناعي'],
      ['deepseek', 'DeepSeek AI'],
      ['analyze', 'تحليل صورة بالذكاء'],
      ['expert', 'وضع الخبير / Brainstorm'],
    ],
  },
  {
    emoji: '🎨',
    title: 'AI صور',
    titleEn: 'AI Images',
    cmds: [
      ['gen', 'توليد صورة بـ AI'],
      ['colorize', 'تلوين صورة'],
    ],
  },
  {
    emoji: '📥',
    title: 'تحميل',
    titleEn: 'Download',
    cmds: [
      ['play', 'تحميل أغنية MP3'],
      ['video', 'تحميل فيديو عام'],
      ['ytdl / ytmp4', 'يوتيوب فيديو / صوت'],
      ['yta / ytv', 'يوتيوب صوت / فيديو'],
      ['fb', 'تحميل فيسبوك'],
      ['ig', 'تحميل إنستغرام'],
      ['tiktok', 'تحميل تيكتوك'],
      ['pinterest', 'تحميل بينترست'],
      ['spotify', 'Spotify إلى MP3'],
      ['twitter', 'تحميل تويتر - X'],
      ['apk', 'تحميل تطبيق APK'],
      ['gdrive', 'تحميل Google Drive'],
    ],
  },
  {
    emoji: '🕋',
    title: 'إسلامي',
    titleEn: 'Islamic',
    cmds: [
      ['salat', 'أوقات الصلاة'],
      ['quran', 'قراءة القرآن'],
      ['quranmp3', 'استماع القرآن'],
      ['qdl', 'تحميل سورة MP3'],
      ['qurancard', 'بطاقة قرآنية'],
      ['ayah', 'آية عشوائية'],
      ['tafsir', 'تفسير آية'],
      ['dua / ad3iya', 'أدعية وأذكار'],
      ['ramadan', 'حزمة رمضان'],
      ['khatm', 'تتبع الختمة'],
    ],
  },
  {
    emoji: '🛠️',
    title: 'أدوات',
    titleEn: 'Tools',
    cmds: [
      ['ping', 'سرعة الاستجابة'],
      ['weather', 'الطقس'],
      ['sticker / s', 'صورة إلى ملصق'],
      ['tomp3', 'فيديو إلى MP3'],
      ['img2pdf', 'صور إلى PDF'],
      ['toimg', 'ملصق إلى صورة'],
      ['tts', 'نص إلى صوت (.say / .tts)'],
      ['qr', 'توليد QR Code'],
      ['ocr', 'استخراج نص من صورة'],
      ['style', 'تزيين النصوص'],
      ['igfollowers', 'رشق متابعين IG'],
    ],
  },
  {
    emoji: '🇲🇦',
    title: 'المغرب',
    titleEn: 'Morocco',
    cmds: [
      ['alloschool', 'دروس وفروض المغرب'],
      ['hespress', 'أخبار هسبريس'],
      ['alwadifa', 'طلبات التوظيف'],
      ['aljazeera', 'أخبار الجزيرة'],
      ['price', 'سعر منتج'],
      ['wc', 'نتائج وجدول كأس العالم 2026 مباشر'],
    ],
  },
  {
    emoji: 'ℹ️',
    title: 'معلومات',
    titleEn: 'Info',
    cmds: [
      ['menu / help', 'عرض هذه القائمة'],
      ['socials', 'روابط التواصل'],
      ['owner', 'التواصل مع المطور'],
      ['mega', 'أتمتة كاملة'],
      ['msgtodev', 'رسالة للمطور'],
      ['stats', 'إحصائيات البوت'],
    ],
  },
];


// ─── HELPERS ────────────────────────────────────────────────────────────────────
function buildPlainText() {
  const header =
`🤖 ${settings.botName.toUpperCase()} 🤖
⚡ المطور: ${settings.botOwner}

👋 مرحباً! هذه قائمة الأوامر الكاملة.
📌 استخدم النقطة قبل الأمر مثال: .gen صورة جميلة
━━━━━━━━━━━━━━━━━━━━━
`;
  const body = CATEGORIES.map(cat => {
    const cmdsStr = cat.cmds.map(([cmd, desc]) => `• .${cmd} - ${desc}`).join('\n');
    return `${cat.emoji} ${cat.title} - ${cat.titleEn}\n${cmdsStr}`;
  }).join('\n\n━━━━━━━━━━━━━━━━━━━━━\n\n');

  const footer = `\n━━━━━━━━━━━━━━━━━━━━━\n📸 الانستقرام: ${settings.instagram}\n💬 القناة الرسمية: ${settings.officialChannel}\n⚔️ ${settings.botName} 2026`;
  return header + body + footer;
}

// ─── MAIN EXPORT ────────────────────────────────────────────────────────────────
module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
  const isTelegram = helpers && helpers.isTelegram;
  const isFacebook = helpers && helpers.isFacebook;

  // ═══════════════════════════════════════════
  // TELEGRAM — Inline keyboard with categories
  // ═══════════════════════════════════════════
  if (isTelegram) {
    const menuIntroText =
`🤖 *${settings.botName}*
👨‍💻 المطور: *${settings.botOwner}*
━━━━━━━━━━━━━━━━━━━━

📋 اختر تصنيفاً لرؤية الأوامر:`;

    return await sock.sendMessage(chatId, {
      text: menuIntroText,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🤖 AI ذكي', callback_data: 'menu_cat_ai' },
            { text: '🎨 AI صور', callback_data: 'menu_cat_images' },
          ],
          [
            { text: '🎬 AI فيديو', callback_data: 'menu_cat_video' },
            { text: '📥 تحميل', callback_data: 'menu_cat_download' },
          ],
          [
            { text: '🕋 إسلامي', callback_data: 'menu_cat_islamic' },
            { text: '🛠️ أدوات', callback_data: 'menu_cat_tools' },
          ],
          [
            { text: '🇲🇦 المغرب', callback_data: 'menu_cat_morocco' },
            { text: 'ℹ️ معلومات', callback_data: 'menu_cat_info' },
          ],
          [
            { text: '📋 كل الأوامر دفعة واحدة', callback_data: 'menu_all' },
          ],
          [
            { text: '📸 Instagram', url: settings.instagram },
            { text: '💬 WhatsApp Channel', url: settings.officialChannel },
          ],
        ],
      },
    });
  }

  // ═══════════════════════════════════════════
  // FACEBOOK — Formatted text with all commands
  // ═══════════════════════════════════════════
  if (isFacebook) {
    const fullText = buildPlainText();
    const photo = fs.existsSync(path.join(__dirname, '../../media/hamza.jpg'))
      ? fs.readFileSync(path.join(__dirname, '../../media/hamza.jpg'))
      : 'https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg';
    return await sock.sendMessage(chatId, { image: photo, caption: fullText });
  }

  // ═══════════════════════════════════════════
  // WHATSAPP — Simple image + full text menu
  // ═══════════════════════════════════════════
  const imagePath = path.join(__dirname, '../../media/hamza.jpg');
  const photo = fs.existsSync(imagePath)
    ? fs.readFileSync(imagePath)
    : 'https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg';

  const fullText = buildPlainText();

  await sock.sendMessage(chatId, { image: photo, caption: fullText }, { quoted: msg });
  await sock.sendMessage(chatId, { react: { text: '⚡', key: msg.key } });
};

