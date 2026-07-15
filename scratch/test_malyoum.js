const { getPollinationsResponse } = require('../lib/ai');

async function testMalyoum() {
    const jid = "test_user_malyoum";
    try {
        console.log("Testing getPollinationsResponse for 'ماليوم'...");
        const res = await getPollinationsResponse(jid, "ماليوم");
        console.log("Response:", res);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testMalyoum();
