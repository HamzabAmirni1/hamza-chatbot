const axios = require('axios');
const fs = require('fs');
async function test() {
    try {
        let r = await axios.post("https://luminai.my.id/", {
            content: "hello",
        });
        console.log("Lumin:", r.data);
    } catch(e) {}
}
test();
