const axios = require('axios');

async function testFreeAPIs() {
    const prompt = "سلام";

    const endpoints = [
        "https://api.ryzendesu.vip/api/ai/chatgpt?text=" + encodeURIComponent(prompt),
        "https://api.ryzendesu.vip/api/ai/gemini?text=" + encodeURIComponent(prompt),
        "https://api.siputzx.my.id/api/ai/chatgpt?prompt=" + encodeURIComponent(prompt),
        "https://api.siputzx.my.id/api/ai/gemini?prompt=" + encodeURIComponent(prompt),
        "https://api.siputzx.my.id/api/ai/llama3?prompt=" + encodeURIComponent(prompt),
        "https://api.siputzx.my.id/api/ai/claude?prompt=" + encodeURIComponent(prompt),
        "https://api.siputzx.my.id/api/ai/meta-llama-3?prompt=" + encodeURIComponent(prompt),
        "https://api.siputzx.my.id/api/ai/blackbox?prompt=" + encodeURIComponent(prompt)
    ];

    for (const url of endpoints) {
        try {
            console.log(`Testing: ${url.substring(0, 60)}...`);
            const { data } = await axios.get(url, { timeout: 8000 });
            console.log("Success:", JSON.stringify(data).substring(0, 200));
        } catch (e) {
            console.error("Error:", e.message);
        }
    }
}

testFreeAPIs();
