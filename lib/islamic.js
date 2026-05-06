const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');

const DUAS_PATH = path.join(__dirname, "..", "data", "duas-subscribers.json");

function loadDuasData() {
    try {
        if (!fs.existsSync(DUAS_PATH)) {
            if (!fs.existsSync(path.dirname(DUAS_PATH)))
                fs.mkdirSync(path.dirname(DUAS_PATH), { recursive: true });
            fs.writeFileSync(
                DUAS_PATH,
                JSON.stringify({ subscribers: [], enabled: true }, null, 2),
            );
            return { subscribers: [], enabled: true };
        }
        const data = JSON.parse(fs.readFileSync(DUAS_PATH, "utf8") || "{}");
        return {
            subscribers: Array.isArray(data.subscribers) ? data.subscribers : [],
            enabled: data.enabled !== undefined ? data.enabled : true,
        };
    } catch {
        return { subscribers: [], enabled: true };
    }
}

function saveDuasData(data) {
    try {
        fs.writeFileSync(DUAS_PATH, JSON.stringify(data, null, 2));
    } catch { }
}

const islamicDuas = [
    {
        title: "دعاء الصباح",
        dua: "اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ. اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَ هَذَا الْيَوْمِ فَتْحَهُ، وَنَصْرَهُ، وَنُورَهُ، وَبَرَكَتَهُ، وَهُدَاهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِيهِ وَشَرِّ مَا بَعْدَهُ.",
        category: "صباح",
    },
    {
        title: "دعاء المساء",
        dua: "اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ. أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوه عَلَى كُلِّ شَيْءٍ قَدِيرٌ.",
        category: "مساء",
    },
    {
        title: "دعاء الرزق",
        dua: "اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ، وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ. اللَّهُمَّ إِنِّي أَسْأَلُكَ رِزْقًا وَاسِعًا طَيِّبًا مِنْ رِزْقِكَ، وَيَسِّرْ لِي طَلَبَهُ، وَاجْععلْهُ لِي مَصْدَرَ خَيْرٍ وَبَرَكَةٍ.",
        category: "رزق",
    },
    {
        title: "سيد الاستغفار",
        dua: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ.",
        category: "استغفار",
    },
    {
        title: "دعاء الشفاء",
        dua: "اللَّهُمَّ رَبَّ النَّاسِ أَذْهِبِ الْبَاسَ، اشْفِهِ وَأَنْتَ الشَّافِي، لَا شِفَاءَ إِلَّا شِفاؤُكَ، شِفَاءً لَا يُغَادِرُ سَقَمًا.",
        category: "شفاء",
    },
    {
        title: "دعاء جامع",
        dua: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ.",
        category: "جامع",
    },
    {
        title: "دعاء الهداية",
        dua: "اللهم إني أسألك الهدى والتقى والعفاف والغنى، اللهم آتِ نفسي تقواها وزكها أنت خير من زكاها أنت وليها ومولاها.",
        category: "هداية",
    },
    {
        title: "دعاء تيسير الأمور",
        dua: "اللهم لا سهل إلا ما جعلته سهلاً، وأنت تجعل الحزن إذا شئت سهلاً، اللهم يسّر لي أمري واشرح لي صدري.",
        category: "تيسير",
    },
    {
        title: "دعاء يوم الجمعة",
        dua: "اللَّهُمَّ فِي يَوْمِ الْجُمُعَةِ، اجْعَلْنَا مِمَّنْ عَفَوْتَ عَنْهُمْ، وَرَضِيتَ عَنْهُمْ، وَغَفَرْتَ لَهُمْ، وَحَرَّمْتَهُمْ عَلَى النَّارِ، وَكَتَبْتَ لَهُمُ الْجَنَّةَ.",
        category: "جمعة",
    },
    {
        title: "ساعة الاستجابة يوم الجمعة",
        dua: "اللَّهُمَّ مَا قَسَمْتَ فِي هَذَا الْيَوْمِ مِنْ خَيْرٍ وَصِحَّةٍ وَسَعَةِ رِزْقٍ فَاجْعَلْ لَنَا مِنْهُ نَصِيبًا، وَما أَنْزَلْتَ فِيهِ مِنْ شَرٍّ وَبَلَاءٍ وَفِتْنَةٍ فَاصْرِفْهُ عَنَّا وَعَنْ جَمِيعِ الْمُسْلِمِينَ.",
        category: "جمعة",
    },
    {
        title: "نور الجمعة",
        dua: "اللَّهُمَّ نَوِّرْ قُلُوبَنَا بِالْإِيمَانِ، وَزَيِّنْ أَيَّامَنَا بِالسَّعَادَةِ، وَاجْععلْ يَوْمَ الْجُمُعَةِ نُورًا لَنَا وَمَغْفِرَةً.",
        category: "جمعة",
    },
    {
        title: "استجابة الجمعة",
        dua: "يا رب في يوم الجمعة وعدت عبادك بقبول دعواتهم، اللهم ارحم موتانا، واشف مرضانا، واستجب لدعائنا، واغفر لنا ذنوبنا.",
        category: "جمعة",
    },
    {
        title: "دعاء النوم",
        dua: "بِاسمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، فَإِنْ أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ.",
        category: "نوم",
    },
    {
        title: "أذكار النوم",
        dua: "اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ. (ثلاث مرات)",
        category: "نوم",
    },
    {
        title: "قبل النوم",
        dua: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا.",
        category: "نوم",
    },
    {
        title: "دعاء السكينة",
        dua: "اللهم رب السماوات ورب الأرض ورب العرش العظيم، ربنا ورب كل شيء، فالق الحب والنوى، ومنزل التوراة والإنجيل والفرقان، أعوذ بك من شر كل شيء أنت آخذ بناصيته.",
        category: "نوم",
    },
];

function getRandomDua(category = null) {
    let filtered = islamicDuas;
    if (category) {
        filtered = islamicDuas.filter((d) => d.category === category);
        if (filtered.length === 0) filtered = islamicDuas;
    } else {
        filtered = islamicDuas.filter(
            (d) => d.category !== "جمعة" && d.category !== "نوم",
        );
    }
    return filtered[Math.floor(Math.random() * filtered.length)];
}

const duasLastSent = {};

function startDuasScheduler(sock, helpers) {
    const { sendWithChannelButton, config } = helpers;

    setInterval(async () => {
        try {
            const data = loadDuasData();
            if (!data.enabled) return;

            const now = moment().tz("Africa/Casablanca");
            const hour = now.hours();
            const minute = now.minutes();
            const dateStr = now.format("YYYY-MM-DD");
            const isFriday = now.day() === 5;

            const targetHours = [7, 9, 11, 12, 17, 19, 22];

            if (minute === 0 && targetHours.includes(hour)) {
                const key = `${dateStr}_${hour}`;
                if (duasLastSent[key]) return;
                duasLastSent[key] = true;

                // Cleanup
                Object.keys(duasLastSent).forEach((k) => {
                    if (!k.startsWith(dateStr)) delete duasLastSent[k];
                });

                // Build the message
                let msg = "";

                if (isFriday && hour === 9) {
                    msg = `╭━━━〘 📖 *نور الجمعة* 📖 〙━━━╮\n┃ ✨ *تذكير بسورة الكهف*\n┃ 🕯️ *قال ﷺ:* «من قرأ سورة الكهف في يوم \n┃ الجمعة أضاء له من النور ما بين الجمعتين»\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n💎 *لا تنسوا سنن الجمعة:*\n   ◦ الغسل والطيب 🚿\n   ◦ سورة الكهف 📖\n   ◦ كثرة الصلاة على النبي ﷺ 📿\n\n🎧 *استمع لسورة الكهف بصوت مشاري العفاسي:*`;
                } else if (isFriday && hour === 11) {
                    msg = `╭━━━〘 🕌 *نداء الجمعة* 🕌 〙━━━╮\n┃ ✨ *الاستعداد لصلاة الجمعة*\n┃  🕌 *موعد صعود المنبر يقترب*\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n💡 *آداب صلاة الجمعة:*\n 1️⃣ الاغتسال والتطيب ولبس أحسن الثياب.\n 2️⃣ *التبكير:* (التبكير يضاعف الأجر).\n 3️⃣ *الإنصات للخطبة:* (من قال لصاحبه أنصت فقد لغا).\n\n⚔️ ${config.botName}`;
                } else {
                    let dua;
                    if (hour === 22) {
                        dua = getRandomDua("نوم");
                    } else if (isFriday) {
                        dua = getRandomDua("جمعة");
                    } else {
                        dua = getRandomDua();
                    }
                    const title = hour === 22 ? "دعاء النوم" : isFriday ? "دعاء يوم الجمعة" : "دعاء اليوم";
                    msg = `🤲 *${title}*\n\n📿 ${dua.dua}`;
                }

                if (!msg) return;

                // ── 1. WhatsApp: opted-in subscribers only ──────────────────
                if (data.subscribers && data.subscribers.length > 0) {
                    for (const id of data.subscribers) {
                        try {
                            await sendWithChannelButton(sock, id, msg);
                            // Special: Friday Quran audio
                            if (isFriday && hour === 9) {
                                await sock.sendMessage(id, {
                                    audio: { url: "https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/18.mp3" },
                                    mimetype: "audio/mpeg",
                                    ptt: false,
                                });
                            }
                        } catch (e) { }
                    }
                }

                // ── 2. Telegram: all users (auto) ──────────────────────────
                try {
                    const tgPath = require('path').join(__dirname, '..', 'data', 'tg_users.json');
                    const fs2 = require('fs-extra');
                    if (fs2.existsSync(tgPath)) {
                        const tgUsers = JSON.parse(fs2.readFileSync(tgPath, 'utf8') || '[]');
                        if (tgUsers.length > 0 && config.telegramToken) {
                            const { sendTelegramPrayerReminder } = require('./telegram');
                            for (const tgId of tgUsers) {
                                try {
                                    await new Promise(r => setTimeout(r, 200));
                                    await sendTelegramPrayerReminder(tgId, msg);
                                } catch (e) { }
                            }
                        }
                    }
                } catch (e) { }

                // ── 3. Facebook: all users (auto) ──────────────────────────
                try {
                    const { getFbUsers, sendFacebookMessage } = require('./facebook');
                    const fbUsers = getFbUsers();
                    if (fbUsers.length > 0) {
                        for (const user of fbUsers) {
                            try {
                                const fbId = typeof user === 'object' ? user.id : user;
                                const pageId = typeof user === 'object' ? user.pageId : null;
                                await new Promise(r => setTimeout(r, 300));
                                await sendFacebookMessage(fbId, msg.replace(/\*/g, '').replace(/_/g, ''), pageId);
                            } catch (e) { }
                        }
                    }
                } catch (e) { }
            }
        } catch (e) { }
    }, 60000);
}


const quranSessions = {};

module.exports = {
    loadDuasData,
    saveDuasData,
    islamicDuas,
    getRandomDua,
    quranSessions,
    startDuasScheduler
};
