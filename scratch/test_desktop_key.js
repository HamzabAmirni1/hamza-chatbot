const axios = require('axios');

async function testKey() {
    const key = "AIzaSyB3Q74etnADQ_qSX3OJtzTnteGh-fd4df8";
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
        const { data } = await axios.post(url, {
            contents: [
                { role: "user", parts: [{ text: "Hello, reply with OK" }] }
            ]
        }, { timeout: 8000 });
        console.log('SUCCESS:', data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (e) {
        console.log('FAILED:', e.message, e.response ? e.response.data : '');
    }
}

testKey();
