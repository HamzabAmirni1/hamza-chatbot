const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://xmmthiitoezusoejydta.supabase.co';
const SUPABASE_KEY = 'sb_publishable_obLwMpkUXz2zDnGKKK9bWA_HV9SE9k_';

async function test() {
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data, error } = await supabase.from('bot_stats').select('*').single();
        console.log("Supabase Data:", data);
        console.log("Supabase Error:", error);
    } catch (e) {
        console.error("Test Exception:", e.message);
    }
}
test();
