const { db } = require('../lib/supabase');

async function run() {
    try {
        const savedConfig = await db.getCache('bot_config');
        console.log('Saved Config in Supabase bot_config cache:');
        if (savedConfig) {
            console.log('Keys present:', Object.keys(savedConfig));
            console.log('botName:', savedConfig.botName);
            console.log('geminiApiKey:', savedConfig.geminiApiKey ? 'PRESENT' : 'EMPTY');
            console.log('openRouterKey:', savedConfig.openRouterKey ? 'PRESENT' : 'EMPTY');
            console.log('hfToken:', savedConfig.hfToken ? 'PRESENT' : 'EMPTY');
            console.log('telegramToken:', savedConfig.telegramToken);
            console.log('fbPageId:', savedConfig.fbPageId);
            console.log('fbPageAccessToken:', savedConfig.fbPageAccessToken ? 'PRESENT' : 'EMPTY');
        } else {
            console.log('No bot_config found in cache.');
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

run();
