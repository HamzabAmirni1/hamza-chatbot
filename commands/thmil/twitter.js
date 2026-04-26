const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const config = require('../../config');

module.exports = async (sock, sender, msg, args) => {
    if (!args[0]) {
        return await sock.sendMessage(sender, {
            text: `❌ *المرجو إرفاق رابط تغريدة تويتر (X)*\n\n📌 *مثال:*\n.twitter https://x.com/...`
        }, { quoted: msg });
    }

    const url = args[0];

    try {
        await sock.sendMessage(sender, { text: "⏳ *جاري تحميل الفيديو من تويتر...*" }, { quoted: msg });

        const form = new FormData();
        form.append('q', url);
        form.append('lang', 'en');
        form.append('cftoken', '');

        const { data } = await axios.post('https://savetwitter.net/api/ajaxSearch', form, {
            headers: { ...form.getHeaders() }
        });

        if (!data.data) throw new Error('لم يتم العثور على الفيديو أو الرابط غير صالح');

        const $ = cheerio.load(data.data);
        const result = [];

        $('.dl-action a').each((_, el) => {
            const link = $(el).attr('href');
            const label = $(el).text().trim();
            if (link && label.includes('Download MP4')) {
                result.push({
                    quality: label.replace('Download MP4', '').trim().replace('(', '').replace(')', ''),
                    url: link
                });
            }
        });

        if (result.length === 0) throw new Error('لم يتم العثور على روابط تحميل الفيديو');

        const best = result[0]; // اختار أول جودة متوفرة (الأفضل عادة)

        await sock.sendMessage(sender, {
            video: { url: best.url },
            caption: `🎥 *Twitter / X Downloader*\n\nالجودة: ${best.quality}\n⚔️ ${config.botName}`
        }, { quoted: msg });

    } catch (err) {
        console.error("Twitter DL Error:", err.message);
        await sock.sendMessage(sender, { text: `❌ *فشل التحميل:*\nتأكد من أن التغريدة تحتوي على فيديو والرابط صحيح.` }, { quoted: msg });
    }
};
