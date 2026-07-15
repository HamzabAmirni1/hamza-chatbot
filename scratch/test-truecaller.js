const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeFreeLookup(number) {
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const url = `https://free-lookup.net/${cleanNumber}`;
        console.log(`Scraping URL: ${url}`);
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const results = {};
        $('.report-summary__list li').each((i, el) => {
            const label = $(el).find('.report-summary__list-txt').text().replace(/\s+/g, ' ').trim();
            const valDiv = $(el).find('.report-summary__lock-wrap');
            if (valDiv.find('img.report-summary__lock').length > 0) {
                results[label] = '🔒 Locked (عليك تفعيل Truecaller)';
            } else {
                results[label] = valDiv.text().replace(/\s+/g, ' ').trim();
            }
        });
        return results;
    } catch (e) {
        console.error('Free-lookup scrape error:', e.message);
        return null;
    }
}

async function run() {
    const res = await scrapeFreeLookup('212661234567');
    console.log('Result:', res);
}

run();
