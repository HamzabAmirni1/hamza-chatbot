const { getPollinationsResponse, getContext } = require('../lib/ai');

async function testPollinations() {
    const fbJid = 'fb:24413221021704865';
    try {
        console.log(`Loading context for ${fbJid}...`);
        const ctx = await getContext(fbJid);
        console.log("Context messages count:", ctx.messages.length);
        console.log("Context messages:", JSON.stringify(ctx.messages, null, 2));

        console.log("Testing getPollinationsResponse with this history...");
        const res = await getPollinationsResponse(fbJid, "سلام");
        console.log("Response:", res);
    } catch (e) {
        console.error("Error testing Pollinations:", e.message);
    }
}

testPollinations();
