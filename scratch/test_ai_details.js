const { 
    getLuminAIResponse, 
    getAIDEVResponse, 
    getPollinationsResponse, 
    getBlackboxResponse, 
    getStableAIResponse, 
    getAutoGPTResponse,
    getDuckDuckGoAI,
    getTypeGPTResponse,
    getNerimityAI,
    getGeminiResponse
} = require('../lib/ai');
const axios = require('axios');
const { getContext } = require('../lib/ai');

async function testWithErrorLogging() {
    const testMsg = "سلام";
    const jid = "test_user";

    // Test DuckDuckGo details
    try {
        console.log("--- Testing DDG Details ---");
        const statusRes = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
            headers: {
                'x-vqd-accept': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        console.log("DDG status headers:", statusRes.headers);
        const vqd = statusRes.headers['x-vqd-4'];
        console.log("VQD Token:", vqd);

        const chatRes = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'user', content: testMsg }
            ]
        }, {
            headers: {
                'x-vqd-4': vqd,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/event-stream'
            }
        });
        console.log("DDG Chat response sample:", chatRes.data.substring(0, 300));
    } catch (e) {
        console.error("DDG detailed error:", e.message, e.response?.data);
    }

    // Test TypeGPT details
    try {
        console.log("--- Testing TypeGPT Details ---");
        const { data } = await axios.post('https://chat.typegpt.net/api/openai/v1/chat/completions', {
            model: 'gpt-4o',
            messages: [
                { role: 'user', content: testMsg }
            ],
            max_tokens: 1024,
            stream: false
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://chat.typegpt.net/',
                'Origin': 'https://chat.typegpt.net',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        console.log("TypeGPT response:", data);
    } catch (e) {
        console.error("TypeGPT detailed error:", e.message, e.response?.data);
    }

    // Test Nerimity details
    try {
        console.log("--- Testing Nerimity Details ---");
        const { data } = await axios.post('https://nerimity.com/api/ai/chat', {
            message: testMsg,
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log("Nerimity response:", data);
    } catch (e) {
        console.error("Nerimity detailed error:", e.message, e.response?.data);
    }

    // Test LuminAI details
    try {
        console.log("--- Testing LuminAI Details ---");
        const { data } = await axios.post("https://luminai.my.id/", {
            content: testMsg,
            user: jid,
            webSearch: false
        });
        console.log("LuminAI response:", data);
    } catch (e) {
        console.error("LuminAI detailed error:", e.message, e.response?.data);
    }

    // Test AIDEV details
    try {
        console.log("--- Testing AIDEV Details ---");
        const { data } = await axios.get(`https://api.vreden.my.id/api/ai/gpt?query=${encodeURIComponent(testMsg)}`);
        console.log("AIDEV response:", data);
    } catch (e) {
        console.error("AIDEV detailed error:", e.message, e.response?.data);
    }
}

testWithErrorLogging();
