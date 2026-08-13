const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

module.exports = async (sock, sender, msg, args) => {
    if (!args[0]) {
        return await sock.sendMessage(sender, {
            text: `❌ *المرجو إرفاق رابط أغنية سبوتيفاي*\n\n📌 *طريقة الاستخدام:*\n.spotify https://open.spotify.com/track/...`
        }, { quoted: msg });
    }

    const query = args[0];
    const outputPath = path.join(__dirname, '..', '..', 'tmp', `spotify_${Date.now()}.mp3`);

    try {
        await sock.sendMessage(sender, { text: "⏳ *جاري البحث وتحميل الأغنية من سبوتيفاي...*" }, { quoted: msg });

        const res = await axios.get(`https://spotdown.org/api/song-details?url=${encodeURIComponent(query)}`, {
            headers: { "Accept": "application/json, text/plain, */*" }
        });

        if (!res.data.songs || res.data.songs.length === 0) throw new Error("لم يتم العثور على الأغنية");

        const song = res.data.songs[0];

        const dlRes = await axios({
            url: "https://spotdown.org/api/download",
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json, text/plain, */*" },
            data: { url: song.url },
            responseType: 'stream',
            timeout: 60000
        });

        fs.ensureDirSync(path.join(__dirname, '..', '..', 'tmp'));
        const writer = fs.createWriteStream(outputPath);
        dlRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        await sock.sendMessage(sender, {
            audio: { url: outputPath },
            mimetype: "audio/mpeg",
            ptt: false,
            fileName: `${song.title}.mp3`,
            caption: `🎶 *Spotify Downloader*\n\n• *الاسم:* ${song.title}\n• *الفنان:* ${song.artist}`
        }, { quoted: msg });

        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (err) {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        await sock.sendMessage(sender, { text: `❌ *فشل التحميل:*\n${err.message || 'تعذر تحميل الأغنية من سبوتيفاي'}` }, { quoted: msg });
    }
};
