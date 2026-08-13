const { db } = require('../lib/supabase');

async function checkDbConfig() {
    try {
        console.log("Fetching bot_config from Supabase...");
        const savedConfig = await db.getCache('bot_config');
        if (savedConfig) {
            console.log("bot_config fields present:");
            for (const [k, v] of Object.entries(savedConfig)) {
                if (v === null || v === undefined) {
                    console.log(`  - ${k}: null/undefined`);
                } else if (typeof v === 'string') {
                    console.log(`  - ${k}: length ${v.length} (${v ? "NOT_EMPTY" : "EMPTY"})`);
                } else {
                    console.log(`  - ${k}: type ${typeof v}`);
                }
            }
        } else {
            console.log("No bot_config found in cache table!");
        }
    } catch (e) {
        console.error("DB Config Error:", e.message);
    }
}

checkDbConfig();
