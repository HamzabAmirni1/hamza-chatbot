const axios = require('axios');
const fs = require('fs');

async function testHuggingFace() {
    try {
        const dummyAudio = Buffer.from('RIFF$...'); // a fake short header
        let r = await axios.post("https://api-inference.huggingface.co/models/openai/whisper-tiny", dummyAudio, {
            headers: {
                "Content-Type": "audio/wav"
            }
        });
        console.log("HF Whisper:", r.data);
    } catch(e) {
        console.log("HF failed:", e.response?.data || e.message);
    }
}
testHuggingFace();
