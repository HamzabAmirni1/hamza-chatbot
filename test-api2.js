const axios = require('axios');
async function test() {
    try {
        const { data } = await axios.get("https://api.ryzendesu.vip/");
        console.log("Ryzendesu is UP!");
    } catch(e) {
        console.log("Error:", e.message);
    }
}
test();
