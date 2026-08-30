const { db } = require('../lib/supabase');

async function checkSchema() {
    try {
        const errors = await db.getRecentErrors(1);
        console.log("=== Error Row Schema ===");
        if (errors.length > 0) {
            console.log(JSON.stringify(errors[0], null, 2));
        } else {
            console.log("No errors found to check schema");
        }
    } catch (e) {
        console.error(e.message);
    }
}

checkSchema();
