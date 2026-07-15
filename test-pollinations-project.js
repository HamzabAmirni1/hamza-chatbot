const axios = require('axios');

async function test() {
    try {
        const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const response = await axios.post("https://text.pollinations.ai/", {
            model: "openai",
            messages: [
                { role: "user", content: [
                    { type: "text", text: "Describe the color of this 1x1 image." },
                    { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
                ]}
            ]
        }, { timeout: 15000 });
        console.log("RESPONSE:", response.data);
    } catch (e) {
        console.error("ERROR:", e.response?.data || e.message);
    }
}

test();
