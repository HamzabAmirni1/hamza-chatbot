const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Download a small test image
async function test() {
    console.log('Downloading test image...');
    const imgRes = await axios.get('https://picsum.photos/200/200.jpg', { responseType: 'arraybuffer', timeout: 10000 });
    const buffer = Buffer.from(imgRes.data);
    const base64 = buffer.toString('base64');
    const base64Image = `data:image/jpeg;base64,${base64}`;
    console.log(`Image size: ${buffer.length} bytes`);

    const prompt = 'Describe this image in 1-2 sentences.';
    const models = ['openai', 'openai-large', 'mistral'];

    for (const model of models) {
        console.log(`\n--- Testing Pollinations model: ${model} ---`);
        try {
            const start = Date.now();
            const { data } = await axios.post('https://text.pollinations.ai/', {
                model,
                messages: [
                    { role: 'system', content: 'You are an image analyst. Describe images in detail.' },
                    { role: 'user', content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: base64Image } }
                    ]}
                ]
            }, { timeout: 25000 });
            const elapsed = Date.now() - start;
            const text = typeof data === 'string' ? data : data?.choices?.[0]?.message?.content;
            console.log(`✅ ${model} OK (${elapsed}ms):`, String(text).substring(0, 120));
        } catch (e) {
            console.log(`❌ ${model} FAIL:`, e.response?.status, e.message?.substring(0, 60));
        }
    }

    console.log('\nDone!');
}

test().catch(console.error);
