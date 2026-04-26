const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

async function testNoteGPT(imageUrl) {
    try {
        console.log("Testing NoteGPT...");
        const payload = {
            message: "What is in this image?",
            language: "en",
            model: "gemini-3-flash-preview",
            tone: "default",
            length: "moderate",
            conversation_id: crypto.randomUUID(),
            image_urls: [imageUrl],
            stream_url: "/api/v2/homework/stream"
        };

        const response = await axios.post(
            'https://notegpt.io/api/v2/homework/stream',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://notegpt.io',
                    'Referer': 'https://notegpt.io/ai-answer-generator',
                    'User-Agent': 'Mozilla/5.0'
                }
            }
        );
        
        let fullText = '';
        const lines = response.data.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const jsonStr = line.slice(6);
                    if (!jsonStr) continue;
                    const data = JSON.parse(jsonStr);
                    if (data.text) fullText += data.text;
                } catch (e) {}
            }
        }
        console.log("NoteGPT Response:", fullText);
        return fullText;
    } catch (e) {
        console.error("NoteGPT Error:", e.message);
        return null;
    }
}

async function testGeminiProxy(imageUrlBase64) {
    try {
        console.log("Testing Gemini Proxy...");
        const url = "https://us-central1-infinite-chain-295909.cloudfunctions.net/gemini-proxy-staging-v1";
        const body = {
            contents: [{
                parts: [
                    { inline_data: { mime_type: "image/jpeg", data: imageUrlBase64 } },
                    { text: "Describe this image" }
                ]
            }],
            model: "gemini-2.0-flash-lite"
        };
        const { data } = await axios.post(url, body, {
            headers: {
                "content-type": "application/json",
                "user-agent": "Mozilla/5.0"
            }
        });
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("Gemini Proxy Response:", text);
        return text;
    } catch (e) {
        console.error("Gemini Proxy Error:", e.message);
        return null;
    }
}

// Use a public test image
const testImageUrl = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500";

(async () => {
    // NoteGPT needs a URL
    await testNoteGPT(testImageUrl);
    
    // Gemini Proxy needs Base64 (usually)
    try {
        const { data } = await axios.get(testImageUrl, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(data).toString('base64');
        await testGeminiProxy(base64);
    } catch (e) {
        console.error("Failed to get image for base64 test");
    }
})();
