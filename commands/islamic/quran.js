const { sendWithChannelButton } = require('../lib/utils');
const { getSurahNumber } = require('../../lib/quranUtils');
// We don't need setSession here as per the new logic, but if needed we can add it.
// const { setSession } = require('../../lib/quranSession'); 
const settings = require('../settings');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

async function quranCommand(sock, chatId, msg, args, helpers, userLang) {
    const isTelegram = helpers && helpers.isTelegram;
    const isFacebook = helpers && helpers.isFacebook;

    // If user provides arguments (e.g. .quran fatiha), show format selection card
    if (args.length > 0) {
        const query = args.join(' ').trim();
        const surahId = getSurahNumber(query);

        if (surahId) {
            // Show format selection card (Audio/Text/PDF)
            const { showSurahFormatCard } = require('./quranmp3');
            return showSurahFormatCard(sock, chatId, msg, surahId, helpers);
        }
    }

    // Surahs List
    const surahs = [
        "1. الفاتحة", "2. البقرة", "3. آل عمران", "4. النساء", "5. المائدة", "6. الأنعام", "7. الأعراف", "8. الأنفال",
        "9. التوبة", "10. يونس", "11. هود", "12. يوسف", "13. الرعد", "14. إبراهيم", "15. الحجر", "16. النحل",
        "17. الإسراء", "18. الكهف", "19. مريم", "20. طه", "21. الأنبياء", "22. الحج", "23. المؤمنون", "24. النور",
        "25. الفرقان", "26. الشعراء", "27. النمل", "28. القصص", "29. العنكبوت", "30. الروم", "31. لقمان", "32. السجدة",
        "33. الأحزاب", "34. سبأ", "35. فاطر", "36. يس", "37. الصافات", "38. ص", "39. الزمر", "40. غافر",
        "41. فصلت", "42. الشورى", "43. الزخرف", "44. الدخان", "45. الجاثية", "46. الأحقاف", "47. محمد", "48. الفتح",
        "49. الحجرات", "50. ق", "51. الذاريات", "52. الطور", "53. النجم", "54. القمر", "55. الرحمن", "56. الواقعة",
        "57. الحديد", "58. المجادلة", "59. الحشر", "60. الممتحنة", "61. الصف", "62. الجمعة", "63. المنافقون", "64. التغابن",
        "65. الطلاق", "66. التحريم", "67. الملك", "68. القلم", "69. الحاقة", "70. المعارج", "71. نوح", "72. الجن",
        "73. المزمل", "74. المدثر", "75. القيامة", "76. الإنسان", "77. المرسلات", "78. النبأ", "79. النازعات", "80. عبس",
        "81. التكوير", "82. الانفطار", "83. المطففين", "84. الانشقاق", "85. البروج", "86. الطارق", "87. الأعلى", "88. الغاشية",
        "89. الفجر", "90. البلد", "91. الشمس", "92. الليل", "93. الضحى", "94. الشرح", "95. التين", "96. العلق",
        "97. القدر", "98. البينة", "99. الزلزلة", "100. العاديات", "101. القارعة", "102. التكاثر", "103. العصر", "104. الهمزة",
        "105. الفيل", "106. قريش", "107. الماعون", "108. الكوثر", "109. الكافرون", "110. النصر", "111. المسد", "112. الإخلاص",
        "113. الفلق", "114. الناس"
    ];

    if (isTelegram || isFacebook) {
        let text = `🕌 *أهلاً بك في قسم القرآن الكريم*\n\nيرجى اختيار السورة وكتابة رقمها (مثلاً: .quran 18)\n\n`;

        if (isTelegram) {
            let buttons = [];
            const commonSurahs = [1, 18, 36, 55, 56, 67];
            commonSurahs.forEach(id => {
                const name = surahs[id - 1];
                buttons.push([{ text: name, callback_data: `${settings.prefix}quran ${id}` }]);
            });
            buttons.push([{ text: "📜 عرض القائمة الكاملة", callback_data: `${settings.prefix}quransura` }]);

            return await sock.sendMessage(chatId, {
                text: text + "👇 القائمة السريعة:",
                reply_markup: { inline_keyboard: buttons }
            });
        } else {
            // Facebook - Text List
            text += surahs.slice(0, 30).join('\n') + "\n...";
            return await sock.sendMessage(chatId, { text });
        }
    }

    try {
        // Prepare rows without empty headers/descriptions
        const createRows = (start, end) => {
            return surahs.slice(start, end).map((s, i) => ({
                title: s, // Only title is mandatory and safe
                id: `${settings.prefix}quransura ${start + i + 1}`
            }));
        };

        const sections = [
            {
                title: "من 1 إلى 30",
                highlight_label: "الأول",
                rows: createRows(0, 30)
            },
            {
                title: "من 31 إلى 60",
                highlight_label: "الثاني",
                rows: createRows(30, 60)
            },
            {
                title: "من 61 إلى 90",
                highlight_label: "الثالث",
                rows: createRows(60, 90)
            },
            {
                title: "من 91 إلى 114",
                highlight_label: "الرابع",
                rows: createRows(90, 114)
            }
        ];

        const listMessage = {
            title: "اضغط هنا لاختيار السورة",
            sections
        };

        const msgContent = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `🕌 *أهلاً بك في قسم القرآن الكريم*\n\nيرجى الضغط على الزر أسفله لاختيار السورة 👇`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: `乂 ${settings.botName}`
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: "القرآن الكريم",
                            subtitle: "القائمة الكاملة",
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                            buttons: [
                                {
                                    "name": "single_select",
                                    "buttonParamsJson": JSON.stringify(listMessage)
                                }
                            ]
                        })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, msgContent.message, { messageId: msgContent.key.id });

    } catch (e) {
        console.error("Error sending quran list:", e);
        await sock.sendMessage(chatId, { text: "❌ حدث خطأ في عرض القائمة." });
    }
}

module.exports = quranCommand;
