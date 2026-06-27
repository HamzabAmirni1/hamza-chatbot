const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
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
      ['imagine', 'Imagine AI'],
      ['sd', 'Stable Diffusion'],
      ['deepimg', 'Deep Image AI'],
      ['removebg', 'إزالة الخلفية'],
      ['hd / upscale', 'رفع جودة الصورة'],
      ['hdv3', 'رفع جودة V3'],
      ['colorize', 'تلوين صورة'],
      ['sketch', 'رسم رصاص'],
      ['wallpaper', 'خلفيات 4K'],
      ['brat', 'Brat مع نص'],
      ['draw', 'رسم بالذكاء'],
      ['aiedit', 'تعديل صورة بـ AI'],
    ],
  },
  {
    emoji: '🎬',
    title: 'AI فيديو',
    titleEn: 'AI Video',
    cmds: [
      ['img2video', 'صورة إلى فيديو AI'],
      ['aivideo / veo', 'نص إلى فيديو AI'],
      ['grokvideo', 'Grok Video AI'],
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
      ['spotify', 'Spotify → MP3'],
      ['twitter', 'تحميل تويتر / X'],
      ['capcut', 'تحميل كاب كت'],
      ['apk', 'تحميل تطبيق APK'],
      ['gdrive', 'تحميل Google Drive'],
      ['lyrics', 'كلمات أغنية'],
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
      ['tempmail', 'إيميل مؤقت'],
      ['tempnum', 'رقم مؤقت للـ SMS'],
      ['sticker / s', 'صورة → ملصق'],
      ['tomp3', 'فيديو → MP3'],
      ['img2pdf', 'صور → PDF'],
      ['toimg', 'ملصق → صورة'],
      ['tts', 'نص → صوت'],
      ['qr', 'توليد QR Code'],
      ['ocr', 'استخراج نص من صورة'],
      ['ss', 'لقطة شاشة موقع'],
      ['style', 'تزيين النصوص'],
      ['blur', 'طمس صورة'],
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
`╔═══════════════════════════╗
║   🤖 ${settings.botName.toUpperCase()}   ║
║   ⚡ DEV: ${settings.botOwner}   ║
╚═══════════════════════════╝

👋 مرحباً! هذه قائمة الأوامر الكاملة
📌 استخدم النقطة قبل الأمر مثال: *.gen صورة جميلة*
──────────────────────────────
`;
  const body = CATEGORIES.map(cat => {
    const cmdsStr = cat.cmds.map(([cmd, desc]) => `  • *.${cmd}* — ${desc}`).join('\n');
    return `${cat.emoji} *${cat.title}* | ${cat.titleEn}\n${cmdsStr}`;
  }).join('\n──────────────────────────────\n');

  const footer = `\n──────────────────────────────\n📸 ${settings.instagram}\n💬 ${settings.officialChannel}\n⚔️ ${settings.botName} 2026`;
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
  // WHATSAPP — Carousel with all categories
  // ═══════════════════════════════════════════
  const imagePath = path.join(__dirname, '../../media/hamza.jpg');
  let imageMessage;
  try {
    const imgSrc = fs.existsSync(imagePath)
      ? { image: fs.readFileSync(imagePath) }
      : { image: { url: 'https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg' } };
    const content = await generateWAMessageContent(imgSrc, { upload: sock.waUploadToServer });
    imageMessage = content.imageMessage;
  } catch (e) {
    console.error('Menu image error', e);
  }

  // Build one carousel card per category
  const cards = CATEGORIES.map((cat) => {
    const bodyText = cat.cmds.map(([cmd, desc]) => `• .${cmd}\n  ↳ ${desc}`).join('\n');
    return {
      body: proto.Message.InteractiveMessage.Body.fromObject({
        text: bodyText,
      }),
      header: proto.Message.InteractiveMessage.Header.fromObject({
        title: `${cat.emoji} ${cat.title} | ${cat.titleEn}`,
        hasMediaAttachment: false,
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
        buttons: [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: '📸 Instagram',
              url: settings.instagram,
            }),
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: '💬 WhatsApp Channel',
              url: settings.officialChannel,
            }),
          },
        ],
      }),
    };
  });

  // Add a header card with image
  const headerCard = {
    body: proto.Message.InteractiveMessage.Body.fromObject({
      text: `👋 أهلاً! استخدم *.أمر* لتنفيذ أي وظيفة\n📌 مثال: *.gen صورة جميلة*\n\n👈 تفضل على اليسار لرؤية كاع الأوامر!`,
    }),
    header: proto.Message.InteractiveMessage.Header.fromObject({
      title: `🤖 ${settings.botName}`,
      hasMediaAttachment: !!imageMessage,
      imageMessage: imageMessage,
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
      buttons: [
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: '📸 Instagram',
            url: settings.instagram,
          }),
        },
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: '💬 WhatsApp Channel',
            url: settings.officialChannel,
          }),
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: '👤 تواصل مع المطور',
            id: '.owner',
          }),
        },
      ],
    }),
  };

  const allCards = [headerCard, ...cards];

  const waMessage = generateWAMessageFromContent(
    chatId,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: proto.Message.InteractiveMessage.fromObject({
            body: proto.Message.InteractiveMessage.Body.create({
              text: `${settings.botName} — كاع الأوامر`,
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: `⚡ ${settings.botName} 2026 | ${settings.botOwner}`,
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              hasMediaAttachment: false,
            }),
            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
              cards: allCards,
            }),
          }),
        },
      },
    },
    { quoted: msg }
  );

  await sock.relayMessage(chatId, waMessage.message, { messageId: waMessage.key.id });
  await sock.sendMessage(chatId, { react: { text: '⚡', key: msg.key } });
};
