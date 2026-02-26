const axios = require('axios');
const cheerio = require('cheerio');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');

async function searchGoogle(query) {
    try {
        const { data } = await axios.get(`https://www.alloschool.com/search?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const $ = cheerio.load(data);
        const results = [];

        $('ul.list-unstyled li').each((_, el) => {
            const a = $(el).find('a');
            const title = a.text().trim();
            const url = a.attr('href');

            if (title && url) {
                results.push({ title, url });
            }
        });

        return results.slice(0, 10);
    } catch (e) {
        console.error(e);
        return [];
    }
}

async function getFilesFromPage(url) {
    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const $ = cheerio.load(data);
        const files = [];

        $('a').each((_, link) => {
            const href = $(link).attr('href');
            let title = $(link).text().trim();

            if (href && (href.toLowerCase().endsWith('.pdf') || href.includes('format=pdf') || href.includes('/element/'))) {
                let fullUrl = href.startsWith('http') ? href : `https://www.alloschool.com${href}`;
                if (!title) title = "ملف";
                files.push({ title, url: fullUrl });
            }
        });

        return files.slice(0, 20);
    } catch (error) {
        return [];
    }
}

module.exports = async (sock, chatId, msg, args, helpers) => {
    const { command } = helpers;
    const text = args.join(" ");

    // HANDLER FOR DOWNLOADING (alloschoolget)
    if (command === 'alloschoolget' || (text.startsWith('http') && text.includes('.pdf'))) {
        const url = args[0];
        if (!url) return;

        await sock.sendMessage(chatId, { react: { text: "⬇️", key: msg.key } });
        try {
            const { data, headers } = await axios.get(url, { responseType: 'arraybuffer' });
            const contentType = headers['content-type'] || '';
            const fileName = url.split('/').pop() || "document.pdf";

            if (contentType.includes('pdf') || url.endsWith('.pdf')) {
                await sock.sendMessage(chatId, {
                    document: Buffer.from(data),
                    mimetype: 'application/pdf',
                    fileName: fileName.endsWith('.pdf') ? fileName : fileName + '.pdf',
                    caption: `📄 *تم جلب ملف Alloschool بنجاح*`,
                    contextInfo: {
                        externalAdReply: {
                            title: "Alloschool Downloader",
                            body: settings.botName,
                            thumbnailUrl: "https://i.pinimg.com/564x/0f/65/2d/0f652d8e37e8c33a9257e5593121650c.jpg",
                            mediaType: 1,
                            sourceUrl: url
                        }
                    }
                }, { quoted: msg });
                await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
            } else {
                await sock.sendMessage(chatId, { text: "⚠️ الرابط ليس ملف PDF مباشر." }, { quoted: msg });
            }
        } catch (e) {
            console.error(e);
            await sock.sendMessage(chatId, { text: "❌ فشل التحميل." }, { quoted: msg });
        }
        return;
    }

    // HANDLER FOR SEARCH (alloschool)
    if (!text) {
        return await sock.sendMessage(chatId, {
            text: "📚 *بحث Alloschool*\n\nيرجى كتابة اسم الدرس أو المستوى.\n📝 مثال:\n.alloschool 1bac physique\n.alloschool svt 2bac"
        }, { quoted: msg });
    }

    // If text is a URL (Page URL), list files
    if (text.startsWith("http")) {
        await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
        const files = await getFilesFromPage(text);

        if (!files.length) {
            return await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على ملفات في هذا الرابط." }, { quoted: msg });
        }

        const isTelegram = helpers && helpers.isTelegram;

        if (isTelegram) {
            let textText = `📂 *قائمة الملفات المتاحة:* \n\n`;
            let buttons = [];
            files.slice(0, 10).forEach((f, i) => {
                textText += `${i + 1}. ${f.title}\n`;
                buttons.push([{ text: `📄 ${f.title.substring(0, 25)}...`, callback_data: `${settings.prefix}alloschoolget ${f.url}` }]);
            });
            return await sock.sendMessage(chatId, {
                text: textText,
                reply_markup: { inline_keyboard: buttons }
            });
        }

        const sections = [{
            title: '📄 الملفات المتاحة للتحميل',
            rows: files.map(f => ({
                header: "الدروس والتمارين",
                title: f.title.substring(0, 50),
                description: "انقر للتحميل كـ PDF",
                id: `${settings.prefix}alloschoolget ${f.url}`
            }))
        }];

        const listMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: `📂 *قائمة الملفات المتاحة:*` }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                        header: proto.Message.InteractiveMessage.Header.create({ title: "Alloschool", subtitle: "Files List", hasMediaAttachment: false }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                            buttons: [{
                                "name": "single_select",
                                "buttonParamsJson": JSON.stringify({
                                    title: "عرض الملفات",
                                    sections: sections
                                })
                            }]
                        })
                    })
                }
            }
        }, { quoted: msg });

        return await sock.relayMessage(chatId, listMsg.message, { messageId: listMsg.key.id });
    }

    // Normal Search
    await sock.sendMessage(chatId, { react: { text: "🔎", key: msg.key } });
    const results = await searchGoogle(text);

    if (!results.length) {
        return await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على نتائج لبحثك." }, { quoted: msg });
    }

    const isTelegram = helpers && helpers.isTelegram;

    if (isTelegram) {
        let textText = `🔎 *نتائج البحث عن:* ${text}\n\n`;
        let buttons = [];
        results.slice(0, 10).forEach((r, i) => {
            textText += `${i + 1}. ${r.title}\n`;
            buttons.push([{ text: `📚 ${r.title.substring(0, 25)}...`, callback_data: `${settings.prefix}alloschool ${r.url}` }]);
        });
        return await sock.sendMessage(chatId, {
            text: textText,
            reply_markup: { inline_keyboard: buttons }
        });
    }

    const sections = [{
        title: '📚 نتائج البحث المقترحة',
        rows: results.map(r => ({
            header: "درس / مستوى",
            title: r.title.substring(0, 60),
            description: "انقر لعرض الملفات",
            id: `${settings.prefix}alloschool ${r.url}`
        }))
    }];

    const listMsg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({ text: `🔎 *نتائج البحث عن:* ${text}` }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                    header: proto.Message.InteractiveMessage.Header.create({ title: "Alloschool Search", hasMediaAttachment: false }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                        buttons: [{
                            "name": "single_select",
                            "buttonParamsJson": JSON.stringify({
                                title: "اختر النتيجة المناسبة",
                                sections: sections
                            })
                        }]
                    })
                })
            }
        }
    }, { quoted: msg });

    await sock.relayMessage(chatId, listMsg.message, { messageId: listMsg.key.id });
};
