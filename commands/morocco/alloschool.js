const axios = require('axios');
const cheerio = require('cheerio');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const { cleanString } = require('../../lib/utils'); // Assuming this exists or I'll just use simple replace

async function searchGoogle(query) {
    try {
        // Using a public search instance or scraping google (unreliable but standard for these bots)
        // Alternative: Use a specific formatting for alloschool url construction if possible?
        // Alloschool search is: https://www.alloschool.com/search?q=QUERY
        // But the user code provided used that url. Let's try that first as it is more specific.

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

        // Alloschool usually lists resources with icons or specific links
        // We look for pdf links
        $('a').each((_, link) => {
            const href = $(link).attr('href');
            let title = $(link).text().trim();

            if (href && (href.toLowerCase().endsWith('.pdf') || href.includes('format=pdf') || href.includes('/element/'))) {
                let fullUrl = href.startsWith('http') ? href : `https://www.alloschool.com${href}`;
                if (!title) title = "ملف";
                files.push({ title, url: fullUrl });
            }
        });

        return files.slice(0, 20); // Limit results
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
            const contentType = headers['content-type'];
            const fileName = url.split('/').pop() || "document.pdf";

            if (contentType.includes('pdf') || url.endsWith('.pdf')) {
                await sock.sendMessage(chatId, {
                    document: Buffer.from(data),
                    mimetype: 'application/pdf',
                    fileName: fileName.endsWith('.pdf') ? fileName : fileName + '.pdf',
                    caption: `📄 *ملف Alloschool*`
                }, { quoted: msg });
                await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });
            } else {
                // Might be a page with more links?
                // For now assume it asks for download.
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

        const sections = [{
            title: '📄 الملفات المتاحة',
            rows: files.map(f => ({
                header: "ملف",
                title: f.title.substring(0, 50),
                description: "اضغط للتحميل",
                id: `${settings.prefix}alloschoolget ${f.url}`
            }))
        }];

        const listMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: `📂 *الدروس والملفات:*` }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                        header: proto.Message.InteractiveMessage.Header.create({ title: "Alloschool", subtitle: "Files", hasMediaAttachment: false }),
                        listMessage: proto.Message.InteractiveMessage.ListMessage.fromObject({
                            buttonText: "عرض الملفات",
                            description: "قائمة الملفات",
                            sections: sections
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
        return await sock.sendMessage(chatId, { text: "❌ لم يتم العثور على دروس." }, { quoted: msg });
    }

    const sections = [{
        title: '📚 الدروس الموجودة',
        rows: results.map(r => ({
            header: "درس",
            title: r.title.substring(0, 60),
            description: "اضغط للدخول",
            id: `${settings.prefix}alloschool ${r.url}`
        }))
    }];

    const listMsg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                    body: proto.Message.InteractiveMessage.Body.create({ text: `🔎 *نتائج البحث عن:* ${text}` }),
                    footer: proto.Message.InteractiveMessage.Footer.create({ text: `乂 ${settings.botName}` }),
                    header: proto.Message.InteractiveMessage.Header.create({ title: "Alloschool", subtitle: "Search", hasMediaAttachment: false }),
                    listMessage: proto.Message.InteractiveMessage.ListMessage.fromObject({
                        buttonText: "اختر الدرس",
                        description: "النتائج",
                        sections: sections
                    })
                })
            }
        }
    }, { quoted: msg });

    await sock.relayMessage(chatId, listMsg.message, { messageId: listMsg.key.id });
};
