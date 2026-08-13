const axios = require('axios');

const keysBase64 = [
    "QUl6YVN5Qy04V01Fd0V1NGcxWXB0M3BaaWw5NWswUEJrVUtWcjBz",
    "QUl6YVN5RGdDMVpwQnY3eXhMT3dLejBXYUhJM2NTaTlsUUJ2QXNZ",
    "QUl6YVN5RFJud01ZMU5GalZJSFhJU05sZnFBU040THIyckozVE9v",
    "QUl6YVN5REw5YTRDSm9icEQ4a0ttM1d3LXlBV0lvajZhbWgzMzA0",
    "QUl6YVN5Q29aZGRwSXk5TFU1Vm9uTUc1djYwRl8zaE5KeUpja3JR",
];

async function testKeys() {
    for (let i = 0; i < keysBase64.length; i++) {
        const key = Buffer.from(keysBase64[i], 'base64').toString('utf-8');
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
            const { data } = await axios.post(url, {
                contents: [
                    { role: "user", parts: [{ text: "Hello, reply with OK" }] }
                ]
            }, { timeout: 8000 });
            console.log(`Key ${i} (${key.substring(0, 10)}...): SUCCESS ->`, data?.candidates?.[0]?.content?.parts?.[0]?.text);
        } catch (e) {
            console.log(`Key ${i} (${key.substring(0, 10)}...): FAILED ->`, e.message, e.response?.data);
        }
    }
}

testKeys();
