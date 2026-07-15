const axios = require('axios');

async function testPollinationsModels() {
    const messages = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "سلام" }
    ];

    const models = ["openai", "qwen", "llama", "mistral", "sur", "gemini", "searchgpt"];

    for (const model of models) {
        try {
            console.log(`Testing model: ${model}`);
            const { data } = await axios.post("https://text.pollinations.ai/", {
                messages,
                model: model,
                jsonMode: false
            }, { timeout: 10000 });
            console.log(`Success for ${model}:`, typeof data === 'string' ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100));
        } catch (e) {
            console.error(`Error for ${model}:`, e.message, e.response?.data);
        }
    }
}

testPollinationsModels();
