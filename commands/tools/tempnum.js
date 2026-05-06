const axios = require('axios');
const cheerio = require('cheerio');
const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const cmd = helpers && helpers.command ? helpers.command : "tempnum";

    if (cmd === 'tempnum') {
        await sock.sendMessage(chatId, { react: { text: "📱", key: msg.key } });
        const waitMsg = await sock.sendMessage(chatId, { text: "⏳ *جاري جلب الأرقام المتاحة...*" }, { quoted: msg });

        try {
            const response = await axios.get("https://7sim.net/", { timeout: 15000 });
            const $ = cheerio.load(response.data);
            const numbers = [];

            $(".col-md-4.col-sm-6.col-xs-12").each((i, el) => {
                const country = $(el).find(".country-name").text().trim();
                const number = $(el).find(".number").text().trim();
                const link = $(el).find("a").attr("href");
                if (number && link) {
                    numbers.push({ country, number, link: `https://7sim.net${link}` });
                }
            });

            if (numbers.length === 0) {
                return await sock.sendMessage(chatId, { text: "❌ ما لقيت حتى رقم متاح دابا فـ 7sim.net" }, { quoted: msg });
            }

            let text = `📱 *أرقام وهمية متاحة (7sim.net):*\n\n`;
            let buttons = [];

            numbers.slice(0, 10).forEach((n, i) => {
                text += `${i + 1}. 🌍 *${n.country}:* ${n.number}\n`;
                buttons.push({
                    "name": "quick_reply",
                    "buttonParamsJson": JSON.stringify({
                        display_text: `📩 Get SMS: ${n.number}`,
                        id: `.getsms ${n.link}`
                    })
                });
            });

            text += `\n💡 اختار الرقم اللي بغيتي واضغط على الزر باش تشوف الميساجات اللي وصلوه.`;

            const isTelegram = helpers && helpers.isTelegram;
            const isFacebook = helpers && helpers.isFacebook;

            if (isTelegram || isFacebook) {
                let buttons = [];
                numbers.slice(0, 10).forEach((n, i) => {
                    if (isTelegram) buttons.push([{ text: `📩 SMS: ${n.number} (${n.country})`, callback_data: `${config.prefix}getsms ${n.link}` }]);
                });

                if (isFacebook) text += "\n\n💡 اكتب .getsms مع رابط الرقم باش تشوف الميساجات.";

                await sock.sendMessage(chatId, { delete: waitMsg.key });
                return await sock.sendMessage(chatId, {
                    text: text,
                    ...(isTelegram ? { reply_markup: { inline_keyboard: buttons } } : {})
                });
            }

            const botMsg = generateWAMessageFromContent(chatId, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                            body: proto.Message.InteractiveMessage.Body.create({ text }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: `🤖 ${config.botName}` }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                buttons
                            })
                        })
                    }
                }
            }, { quoted: msg });

            await sock.sendMessage(chatId, { delete: waitMsg.key });
            await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(chatId, { text: "❌ وقع مشكل فجلب الأرقام. جرب من بعد." }, { quoted: msg });
        }
    } else if (cmd === 'getsms') {
        const smsUrl = args[0];
        if (!smsUrl || !smsUrl.includes("7sim.net")) {
            return await sock.sendMessage(chatId, {
                text: "⚠️ *استخدام خاطئ!*\n\n📝 *الطريقة:* .getsms [رابط الرقم]\n\n*مثال:* .getsms https://7sim.net/free-phone-number-GYEjv40qY",
            }, { quoted: msg });
        }

        await sock.sendMessage(chatId, { react: { text: "📩", key: msg.key } });
        const waitSms = await sock.sendMessage(chatId, { text: "⏳ *جاري جلب الرسائل...*" }, { quoted: msg });

        try {
            const response = await axios.get(smsUrl, { timeout: 15000 });
            const $ = cheerio.load(response.data);
            const messages = [];

            $("tbody[data-pagination-content] tr").each((_, row) => {
                const senderCell = $(row).find("td").eq(0);
                const messageCell = $(row).find("td.td-message-content");
                const timeCell = $(row).find("td.t-m-r");

                const s = senderCell.text().trim();
                const m = messageCell.text().trim();
                const t = timeCell.attr("data-time") || timeCell.text().trim();

                if (s && m) {
                    messages.push({ sender: s, message: m, time: t });
                }
            });

            if (messages.length === 0) {
                return await sock.sendMessage(chatId, { text: "❌ ما لقيت حتى شي رسالة لهاد الرقم دابا." }, { quoted: msg });
            }

            let text = `📩 *آخر الرسائل المستلمة للرقم:*\n\n`;
            messages.slice(0, 10).forEach((m, i) => {
                text += `👤 *من:* ${m.sender}\n💬 *الرسالة:* ${m.message}\n🕒 *الوقت:* ${m.time}\n────────────────\n`;
            });

            await sock.sendMessage(chatId, { delete: waitSms.key });
            await sock.sendMessage(chatId, { text }, { quoted: msg });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(chatId, { text: "❌ وقع مشكل فجلب الرسائل. جرب من بعد." }, { quoted: msg });
        }
    }
};
