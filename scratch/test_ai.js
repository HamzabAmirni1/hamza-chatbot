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
const config = require('../config');

async function testAll() {
    console.log("Config keys:", {
        geminiApiKey: config.geminiApiKey ? "PRESENT" : "MISSING",
        openRouterKey: config.openRouterKey ? "PRESENT" : "MISSING",
    });

    const testMsg = "سلام لاباس عليك";
    const jid = "test_user";

    const providers = {
        getDuckDuckGoAI,
        getTypeGPTResponse,
        getNerimityAI,
        getLuminAIResponse,
        getAIDEVResponse,
        getPollinationsResponse,
        getBlackboxResponse,
        getStableAIResponse,
        getAutoGPTResponse,
        getGeminiResponse
    };

    for (const [name, fn] of Object.entries(providers)) {
        try {
            console.log(`Testing ${name}...`);
            const res = await fn(jid, testMsg);
            console.log(`Result from ${name}:`, res ? `${res.substring(0, 100)}...` : "NULL");
        } catch (e) {
            console.error(`Error in ${name}:`, e.message);
        }
    }
}

testAll();
