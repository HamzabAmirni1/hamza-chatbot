const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const url = args[0];
    if (!url || !url.startsWith("http")) return await sock.sendMessage(chatId, { text: "⚠️ أرجو كتابة رابط المنتج لمتابعة السعر." });

    try {
        await sock.sendMessage(chatId, { text: "🔍 جاري الفحص وجلب السعر الحالي..." }, { quoted: msg });
        const { data } = await axios.get(url, { headers: { 'User-Agent': "Mozilla/5.0" }, timeout: 15000 });
        const $ = cheerio.load(data);
        
        let price = "";
        // Try common price selectors (Amazon, Jumia, etc)
        price = $('.a-price-whole').text() || $('.prd-p-price').text() || $('[data-price]').text() || $('.price').text() || "";
        
        if (!price) {
           // Regex fallback if selectors fail
           const match = data.match(/(\d+[\.,]\d+\s*(DH|MAD|\$|€|USD))/i) || data.match(/((DH|MAD|\$|€|USD)\s*\d+[\.,]\d+)/i);
           if (match) price = match[0];
        }

        const cleanPrice = price.trim() || "غير متوفر حالياً";
        const msgText = `🏷️ *نتائج فحص السعر:*\n━━━━━━━━━━━━━━\n\n📌 *السعر:* ${cleanPrice}\n🔗 *الرابط:* ${url}\n\n📍 *ملاحظة:* تم جلب السعر عبر تقنية كشط الويب (Web Scraping).`;

        await sock.sendMessage(chatId, { text: msgText }, { quoted: msg });
        if (!helpers?.isTelegram) await sock.sendMessage(chatId, { react: { text: "🏷️", key: msg.key } });

    } catch (e) {
        console.error("Price scrape error:", e.message);
        await sock.sendMessage(chatId, { text: `❌ فشل جلب السعر.\n\nالسبب: قد يكون الموقع محميّاً أو الرابط غير صحيح.` }, { quoted: msg });
    }
};
