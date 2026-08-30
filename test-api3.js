const axios = require('axios');
async function test() {
    try {
        let r = await axios.post("https://aemt.me/api/whisper", { audio: "base64" });
        console.log("Aemt whisper:", r.status);
    } catch(e) { console.log("Aemt failed:", e.message); }

    try {
        let r2 = await axios.post("https://api.siputzx.my.id/api/ai/whisper", { audio: "base64" });
        console.log("siputzx whisper:", r2.status);
    } catch(e) { console.log("siputzx failed:", e.message); }
}
test();
