const { loadDuasData, saveDuasData, islamicDuas, getRandomDua } = require('../../lib/islamic');
const { sendWithChannelButton } = require('../lib/utils');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    const sender = chatId;
    const arg = args[0]?.toLowerCase();
    const data = loadDuasData();

    if (arg === "on") {
        if (!data.subscribers.includes(sender)) {
            data.subscribers.push(sender);
            saveDuasData(data);
            await sendWithChannelButton(
                sock,
                sender,
                "✅ *تم تفعيل خدمة الأدعية اليومية!* \nغادي نبقا نصيفط ليك أذكار وأدعية فكل وقت.",
                msg,
            );
        } else {
            await sendWithChannelButton(
                sock,
                sender,
                "✅ *الخدمة مفعّلة عندك بالفعل!*",
                msg,
            );
        }
    } else if (arg === "off") {
        data.subscribers = data.subscribers.filter((id) => id !== sender);
        saveDuasData(data);
        await sendWithChannelButton(
            sock,
            sender,
            "⚠️ *تم إيقاف خدمة الأدعية اليومية.*",
            msg,
        );
    } else if (arg === "list") {
        const cats = [...new Set(islamicDuas.map((d) => d.category))];
        await sendWithChannelButton(
            sock,
            sender,
            `📂 *الأقسام المتوفرة:* \n${cats.join(", ")}`,
            msg,
        );
    } else {
        const dua = getRandomDua(arg);
        const resp = `🤲 *${dua.title}*\n\n📿 ${dua.dua}\n\n📂 *القسم:* ${dua.category}`;
        await sendWithChannelButton(sock, sender, resp, msg);
    }
};
