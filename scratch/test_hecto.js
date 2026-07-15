const axios = require('axios');

async function testHecto() {
    // Test Hectormanuel AI
    try {
        console.log("--- Testing Hectormanuel AI ---");
        const { data } = await axios.post(
            "https://ai-api.officialhectormanuel.workers.dev/",
            { 
                model: "gpt-4o", 
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: "سلام" }
                ] 
            },
            { timeout: 15000 }
        );
        console.log("Hectormanuel Response:", data);
    } catch (e) {
        console.error("Hectormanuel Error:", e.message, e.response?.data);
    }

    // Test Stable AI
    try {
        console.log("--- Testing Stable AI ---");
        const aiHost = 'all-in-1-ais.officialhectormanuel.workers.dev';
        const aiIP = '104.21.83.121'; // Cloudflare IP
        const { data } = await axios.get(`https://${aiIP}?query=${encodeURIComponent("سلام")}&model=gpt-4o-mini`, {
            headers: { 'Host': aiHost },
            timeout: 20000,
            httpsAgent: new (require('https')).Agent({ keepAlive: true, rejectUnauthorized: false, servername: aiHost })
        });
        console.log("Stable AI Response:", data);
    } catch (e) {
        console.error("Stable AI Error:", e.message, e.response?.data);
    }
}

testHecto();
