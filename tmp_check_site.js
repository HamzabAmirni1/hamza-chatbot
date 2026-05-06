const axios = require('axios');

async function checkSite() {
    try {
        const { data } = await axios.get('https://hamzaamirni.netlify.app');
        console.log("--- Internal Links ---");
        const links = data.match(/href="\/[^"]+"/g);
        if (links) console.log([...new Set(links)]);

        console.log("\n--- Ad Scripts/Links ---");
        const ads = data.match(/https?:\/\/[^\s"'<>]+(?=onclick|propu|monetag|adsterra|tag|zone)/gi);
        if (ads) console.log(ads);

        // Monetag often uses specific domains or direct links in script tags
        const scripts = data.match(/<script[^>]+src="([^"]+)"/g);
        if (scripts) console.log(scripts);
    } catch (e) {
        console.error(e.message);
    }
}

checkSite();
