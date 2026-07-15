const axios = require('axios');

const jid = 'test-jid';
const message = 'مرحبا، كيف حالك؟';

function getSystemPrompt(text) {
    return "أنت مساعد ذكي اسمك بوت حمزة اعمرني.";
}

function sanitizeAiResponse(text) {
    return text ? text.trim() : null;
}

// 1. Pollinations POST
async function getPollinationsResponsePOST() {
    try {
        const { data } = await axios.post("https://text.pollinations.ai/", {
            messages: [
                { role: "system", content: getSystemPrompt(message) },
                { role: "user", content: message }
            ],
            model: "openai",
            code: "hamza-amirni-bot",
            jsonMode: false,
            seed: Math.floor(Math.random() * 9999)
        }, { 
            timeout: 12000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        return data;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

// 2. Pollinations GET
async function getPollinationsResponseGET() {
    try {
        const systemPrompt = getSystemPrompt(message);
        const encodedMsg = encodeURIComponent(message);
        const encodedSys = encodeURIComponent(systemPrompt);
        const url = `https://text.pollinations.ai/${encodedMsg}?system=${encodedSys}&model=openai&seed=${Math.floor(Math.random()*9999)}`;
        const { data } = await axios.get(url, { timeout: 12000 });
        return data;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

// 3. Pollinations Qwen
async function getPollinationsQwen() {
    try {
        const encodedMsg = encodeURIComponent(message);
        const sysPrompt = encodeURIComponent(getSystemPrompt(message));
        const { data } = await axios.get(
            `https://text.pollinations.ai/${encodedMsg}?system=${sysPrompt}&model=qwen-coder&seed=${Math.floor(Math.random() * 99999)}`,
            { timeout: 12000 }
        );
        return data;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

// 4. StableAI (with direct domain first)
async function getStableAIDomain() {
    try {
        const url = `https://all-in-1-ais.officialhectormanuel.workers.dev?query=${encodeURIComponent(getSystemPrompt(message) + '\nUser: ' + message)}&model=gpt-4o-mini`;
        const { data } = await axios.get(url, { timeout: 15000 });
        return data?.choices?.[0]?.message?.content || data?.reply || data;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

// 5. StableAI (with IP)
async function getStableAIIP() {
    try {
        const aiHost = 'all-in-1-ais.officialhectormanuel.workers.dev';
        const aiIP = '104.21.83.121';
        const { data } = await axios.get(`https://${aiIP}?query=${encodeURIComponent(getSystemPrompt(message) + '\nUser: ' + message)}&model=gpt-4o-mini`, {
            headers: { 'Host': aiHost },
            timeout: 15000,
            httpsAgent: new (require('https')).Agent({ keepAlive: true, rejectUnauthorized: false, servername: aiHost })
        });
        return data?.choices?.[0]?.message?.content || data?.reply || data;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

// 6. AutoGPT Hectormanuel
async function getHectormanuelAI() {
    try {
        const { data } = await axios.post(
            "https://ai-api.officialhectormanuel.workers.dev/",
            {
                model: "gpt-4o",
                messages: [
                    { role: "system", content: getSystemPrompt(message) },
                    { role: "user", content: message }
                ]
            },
            { timeout: 12000 }
        );
        return data.choices?.[0]?.message?.content || data.response || data;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

// 7. Nerimity
async function getNerimityAI() {
    try {
        const { data } = await axios.post('https://nerimity.com/api/ai/chat', {
            message: getSystemPrompt(message) + '\n\nUser: ' + message,
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 12000
        });
        return data?.response || data;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

// 8. DuckDuckGo AI
async function getDuckDuckGoAI() {
    try {
        const statusRes = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
            headers: {
                'x-vqd-accept': '1',
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 8000
        });
        const vqdToken = statusRes.headers['x-vqd-4'];
        if (!vqdToken) return 'Error: No VQD token';

        const { data } = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: message }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-vqd-4': vqdToken,
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/event-stream'
            },
            timeout: 10000
        });
        return data;
    } catch (e) {
        return 'Error: ' + e.message;
    }
}

async function run() {
    console.log('Testing Providers...');
    console.log('1. Pollinations POST:', await getPollinationsResponsePOST());
    console.log('2. Pollinations GET:', await getPollinationsResponseGET());
    console.log('3. Pollinations Qwen:', await getPollinationsQwen());
    console.log('4. StableAI (Domain):', await getStableAIDomain());
    console.log('5. StableAI (IP):', await getStableAIIP());
    console.log('6. Hectormanuel AI:', await getHectormanuelAI());
    console.log('7. Nerimity AI:', await getNerimityAI());
    console.log('8. DuckDuckGo AI:', await getDuckDuckGoAI());
}

run();
