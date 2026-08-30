const axios = require('axios');

async function testPollinationsGet() {
    const prompt = "سلام";
    const system = "You are a helpful assistant.";
    
    try {
        console.log("Testing Pollinations GET with model openai...");
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?system=${encodeURIComponent(system)}&model=openai`, { timeout: 8000 });
        console.log("openai GET response:", res.data);
    } catch (e) {
        console.error("openai GET error:", e.message);
    }

    try {
        console.log("Testing Pollinations GET with model searchgpt...");
        const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?system=${encodeURIComponent(system)}&model=searchgpt`, { timeout: 8000 });
        console.log("searchgpt GET response:", res.data);
    } catch (e) {
        console.error("searchgpt GET error:", e.message);
    }
}

testPollinationsGet();
