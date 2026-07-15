const axios = require('axios');

const jid = 'test-jid';
const message = 'مرحبا، كيف حالك؟';

function getSystemPrompt(text) {
    return "أنت مساعد ذكي اسمك بوت حمزة اعمرني.";
}

async function getLuminAIResponse() {
    try {
        const { data } = await axios.post("https://luminai.my.id/", {
            content: message,
            user: jid,
            prompt: getSystemPrompt(message),
            webSearch: false,
        }, { timeout: 10000 });
        return data.result || data.response;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

async function getAIDEVResponse() {
    try {
        const { data } = await axios.get(
            `https://api.vreden.my.id/api/ai/gpt?query=${encodeURIComponent(message)}`,
            { timeout: 10000 }
        );
        return data.result || data.response;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

async function getBlackboxResponse() {
    try {
        const { data } = await axios.get(
            `https://api.vreden.my.id/api/ai/blackbox?query=${encodeURIComponent(message)}`,
            { timeout: 10000 }
        );
        return data.result || data.response;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

async function run() {
    console.log('Testing other providers...');
    console.log('LuminAI:', await getLuminAIResponse());
    console.log('AIDEV:', await getAIDEVResponse());
    console.log('Blackbox:', await getBlackboxResponse());
}

run();
