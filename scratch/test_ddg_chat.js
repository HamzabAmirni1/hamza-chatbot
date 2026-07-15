const axios = require('axios');

async function testDDG() {
    try {
        const res = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
            headers: {
                'x-vqd-accept': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const vqd = res.headers['x-vqd-hash-1'];
        console.log('x-vqd-hash-1:', vqd);
        if (!vqd) return;

        const chatRes = await axios.post('https://duckduckgo.com/duckchat/v1/chat', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'hello' }]
        }, {
            headers: {
                'x-vqd-4': vqd,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/event-stream'
            },
            timeout: 10000
        });
        console.log('Chat Status:', chatRes.status);
        console.log('Chat Data:', chatRes.data.substring(0, 500));
    } catch (e) {
        console.log('Error:', e.message, e.response ? e.response.data : '');
    }
}

testDDG();
