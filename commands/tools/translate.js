const axios = require('axios');
const config = require('../../config');

module.exports = async (sock, sender, msg, args) => {
    let lang = 'ar';
    let text = '';

    // Check if the user is replying to a message
    let quotedText = "";
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        const quotedType = Object.keys(quotedMsg)[0];
        quotedText = quotedType === "conversation" ? quotedMsg.conversation : 
                     quotedType === "extendedTextMessage" ? quotedMsg.extendedTextMessage.text : "";
    }

    if (args.length >= 2) {
        lang = args[0];
        text = args.slice(1).join(' ');
    } else if (quotedText && args.length === 1) {
        lang = args[0];
        text = quotedText;
    } else if (quotedText) {
        lang = 'ar';
        text = quotedText;
    } else if (args.length > 0 && !quotedText) {
        lang = 'ar';
        text = args.join(' ');
    } else {
        return await sock.sendMessage(sender, {
            text: `❌ *المرجو إرفاق النص أو الرد على رسالة*\n\n📌 *مثال:*\n.translate en مرحباً كيف حالك`
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(sender, { text: "⏳ *جاري الترجمة...*" }, { quoted: msg });

        const url = new URL('https://translate.googleapis.com/translate_a/single');
        url.searchParams.append('client', 'gtx');
        url.searchParams.append('sl', 'auto');
        url.searchParams.append('tl', lang);
        url.searchParams.append('dt', 't');
        url.searchParams.append('q', text);

        const res = await axios.get(url.href);
        const json = res.data;

        if (json && json[0]) {
            const translation = json[0].map(item => item[0].trim()).join('\n');
            await sock.sendMessage(sender, {
                text: `*تفضل هذه ترجمتك:*\n\n${translation}`
            }, { quoted: msg });
        } else {
            throw new Error("لم أتمكن من الحصول على ترجمة.");
        }
    } catch (err) {
        console.error("Translate Error:", err.message);
        await sock.sendMessage(sender, { text: `❌ *حدث خطأ أثناء الترجمة.*\nتأكد من رمز اللغة (مثال: ar, en, fr, es).` }, { quoted: msg });
    }
};
