const axios = require('axios');
const fs = require('fs');

async function test() {
    console.log("Testing Vreden Whisper...");
    try {
        const dummyAudio = Buffer.from('RIFF$...'); // a fake short header
        let r = await axios.post("https://api.vreden.my.id/api/ai/whisper", {
            audio: dummyAudio.toString("base64"),
            language: "auto"
        });
        console.log("Whisper ok:", !!r.data);
    } catch(e) { console.log("Whisper failed:", e.message); }

    console.log("Testing Pollinations AI vision...");
    try {
        const r = await axios.post("https://text.pollinations.ai/", {
            model: "openai",
            messages: [
                { role: "user", content: [
                    { type: "text", text: "what is in this?" },
                    { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" } }
                ]}
            ]
        });
        console.log("Pollinations vision ok:", typeof r.data === 'string' ? r.data.substring(0, 50) : r.data);
    } catch(e) { console.log("Pollinations vision failed:", e.message); }
}

test();
