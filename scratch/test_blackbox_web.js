const axios = require('axios');

async function testBlackbox() {
    try {
        const response = await axios.post('https://www.blackbox.ai/api/chat', {
            messages: [
                { content: "hello, reply with YES or OK", role: "user" }
            ],
            previewToken: null,
            userId: null,
            codeModelMode: true,
            agentMode: {
                mode: true,
                id: "ModelSwitcher",
                name: "Model Switcher"
            },
            trendingAgentMode: {},
            isMicMode: false,
            maxTokens: 1024,
            isChromeExt: false,
            githubToken: null
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        });
        console.log('Status:', response.status);
        console.log('Response:', typeof response.data === 'string' ? response.data.substring(0, 500) : response.data);
    } catch (e) {
        console.log('Error:', e.message, e.response ? e.response.data : '');
    }
}

testBlackbox();
