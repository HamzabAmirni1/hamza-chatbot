const axios = require('axios');

async function getTypeGPTResponse() {
    try {
        const { data } = await axios.post('https://chat.typegpt.net/api/openai/v1/chat/completions', {
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello, reply with YES or OK' }
            ],
            max_tokens: 1024,
            stream: false
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Referer': 'https://chat.typegpt.net/',
                'Origin': 'https://chat.typegpt.net',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        return data?.choices?.[0]?.message?.content || data;
    } catch (e) {
        return 'Error: ' + e.message + (e.response ? ' ' + JSON.stringify(e.response.data) : '');
    }
}

async function run() {
    console.log('TypeGPT:', await getTypeGPTResponse());
}
run();
