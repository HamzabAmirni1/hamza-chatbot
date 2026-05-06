const axios = require('axios');
async function test() {
    try {
        const dummyAudio = Buffer.from('RIFF$...'); 
        let r = await axios.post("https://api.ryzendesu.vip/api/ai/whisper", {
            audio: dummyAudio.toString("base64"),
        });
        console.log("Ryzendesu whisper:", r.data);
    } catch(e) {
        console.log("Ryzendesu whisper failed:", e.response?.data || e.message);
    }
}
test();
