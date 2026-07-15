const axios = require('axios');

async function testGeminiProxy() {
    try {
        const url = "https://us-central1-infinite-chain-295909.cloudfunctions.net/gemini-proxy-staging-v1";
        const body = {
            contents: [{
                parts: [
                    { text: "What is the capital of Morocco? Answer in one word." }
                ]
            }],
            model: "gemini-2.0-flash-lite"
        };
        const { data } = await axios.post(url, body, {
            headers: {
                "content-type": "application/json",
                "user-agent": "Mozilla/5.0"
            },
            timeout: 15000
        });
        console.log('Response:', data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (e) {
        console.log('Error:', e.message, e.response ? e.response.data : '');
    }
}

testGeminiProxy();
