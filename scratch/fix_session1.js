/**
 * Script to clear corrupted session_1 data from Supabase
 * Run: node scratch/fix_session1.js
 */
const { db } = require('../lib/supabase');

async function fixSession1() {
    console.log('🔧 Fixing session_1 corrupted data...');

    try {
        // 1. Try to find whatsapp sessions in DB
        const sessions = await db.getAllWhatsAppAuth();
        console.log('📋 Found sessions:', sessions?.length || 0);
        if (sessions && sessions.length > 0) {
            for (const s of sessions) {
                console.log('Session Object:', JSON.stringify(s, null, 2));
            }
        }

        // 2. Look for the session_1 phone number in bot config
        const config = await db.getCache('bot_config');
        console.log('Bot Config Cache:', JSON.stringify(config, null, 2));
        const wa1 = config?.whatsappNumber1 || config?.waNumber || config?.waPhone;
        console.log('📱 WhatsApp Number from config:', wa1 || '(not found)');

        // If we want to reset all sessions to stop the loop
        if (sessions && sessions.length > 0) {
            for (const s of sessions) {
                if (s.phone_number) {
                    console.log(`🗑️ Resetting session for ${s.phone_number}...`);
                    await db.deleteWhatsAppSession(s.phone_number);
                    await db.updateWAStatus(s.phone_number, 'disconnected');
                }
            }
            console.log('✅ All active WhatsApp sessions cleared from Supabase!');
        } else {
            console.log('⚠️ No sessions found to clear.');
        }
    } catch (e) {
        console.error('❌ Error:', e.message);
    }

    process.exit(0);
}

fixSession1();
