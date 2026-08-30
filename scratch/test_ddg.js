const axios = require('axios');

async function testDDG() {
    try {
        const res = await axios.get('https://duckduckgo.com/duckchat/v1/status', {
            headers: {
                'x-vqd-accept': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        console.log('Status:', res.status);
        console.log('Headers:', res.headers);
    } catch (e) {
        console.log('Error:', e.message, e.response ? e.response.headers : '');
    }
}

testDDG();
