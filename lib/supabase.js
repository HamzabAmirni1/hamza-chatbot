const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabaseUrl = process.env.SUPABASE_URL || config.supabaseUrl;
const supabaseKey = process.env.SUPABASE_KEY || config.supabaseKey;

let supabase = null;
if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
    } catch (e) {
        console.error('[Supabase] Initialization Error:', e.message);
    }
}

const db = {
    // 🤖 Bot Configs (Telegram/Facebook Tokens)
    async getBotConfigs() {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase.from('bot_configs').select('*').eq('is_active', true);
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[Supabase] getBotConfigs Error:', e.message);
            return [];
        }
    },

    // 💬 WhatsApp Auth (Sessions & Pairing Codes)
    async getWhatsAppAuth(phoneNumber) {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase.from('whatsapp_auth').select('*').eq('phone_number', phoneNumber).single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        } catch (e) {
            return null;
        }
    },

    async getAllWhatsAppAuth() {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase.from('whatsapp_auth').select('*');
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[Supabase] getAllWhatsAppAuth Error:', e.message);
            return [];
        }
    },

    async updateWhatsAppSession(phoneNumber, sessionData) {
        if (!supabase) return;
        try {
            const { error } = await supabase.from('whatsapp_auth').upsert({
                phone_number: phoneNumber,
                session_data: sessionData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'phone_number' });
            if (error) throw error;
        } catch (e) {
            const msg = e.message || '';
            if (!msg.includes('schema cache') && !msg.includes('upstream request timeout')) {
                console.error('[Supabase] updateWhatsAppSession Error:', msg);
            }
        }
    },

    async updatePairingCode(phoneNumber, pairingCode, status = 'connecting') {
        if (!supabase) return;
        try {
            const { error } = await supabase.from('whatsapp_auth').upsert({
                phone_number: phoneNumber,
                pairing_code: pairingCode,
                status: status,
                updated_at: new Date().toISOString()
            }, { onConflict: 'phone_number' });
            if (error) throw error;
        } catch (e) {
            console.error('[Supabase] updatePairingCode Error:', e.message);
        }
    },

    async updateWAStatus(phoneNumber, status) {
        if (!supabase) return;
        try {
            const { error } = await supabase.from('whatsapp_auth').update({ status }).eq('phone_number', phoneNumber);
            if (error) throw error;
        } catch (e) {
            console.error('[Supabase] updateWAStatus Error:', e.message);
        }
    },

    // 📊 Bot Stats
    async updateStats(stats) {
        if (!supabase) return;
        try {
            const { error } = await supabase.from('bot_stats').upsert({
                id: 'ae6b896b-0b1a-42c2-b5e1-06103b6e82a3', // Use a fixed ID for global stats
                ...stats,
                last_update: new Date().toISOString()
            }, { onConflict: 'id' });
            if (error) throw error;
        } catch (e) {
            const msg = e.message || '';
            if (!msg.includes('schema cache') && !msg.includes('upstream request timeout')) {
                console.error('[Supabase] updateStats Error:', msg);
            }
        }
    },

    async getStats() {
        if (!supabase) return null;
        try {
            // Get the main stats record
            let { data, error } = await supabase.from('bot_stats').select('*').eq('id', 'ae6b896b-0b1a-42c2-b5e1-06103b6e82a3').single();
            
            // If it doesn't exist, create it
            if (error && error.code === 'PGRST116') {
                const initialStats = {
                    id: 'ae6b896b-0b1a-42c2-b5e1-06103b6e82a3',
                    messages_handled: 0,
                    total_users: 0,
                    ram_usage: '0MB',
                    visits: 0,
                    top_commands: []
                };
                await supabase.from('bot_stats').insert(initialStats);
                data = initialStats;
            }

            // Dynamically calculate counts for accuracy
            const { count: userCount } = await supabase.from('ai_memory').select('*', { count: 'exact', head: true });
            const { count: botCount } = await supabase.from('whatsapp_auth').select('*', { count: 'exact', head: true });

            return {
                ...data,
                total_users: userCount || (data ? data.total_users : 0),
                active_bots: botCount || 0
            };
        } catch (e) {
            console.error('[Supabase] getStats Error:', e.message);
            return null;
        }
    },

    // 🧠 AI Memory Management
    async getAIMemory(jid) {
        if (!supabase) return { jid, history: [], last_image: null };
        try {
            const { data, error } = await supabase.from('ai_memory').select('*').eq('jid', jid).single();
            if (error && error.code !== 'PGRST116') throw error;
            return data || { jid, history: [], last_image: null };
        } catch (e) { 
            return { jid, history: [], last_image: null }; 
        }
    },

    async updateAIMemory(jid, history, lastImage) {
        if (!supabase) return;
        try {
            const { error } = await supabase.from('ai_memory').upsert({
                jid,
                history,
                last_image: lastImage,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jid' });
            if (error) throw error;
        } catch (e) { 
            const msg = e.message || '';
            if (!msg.includes('schema cache') && !msg.includes('upstream request timeout')) {
                console.error('[Supabase AI Update Error]:', msg); 
            }
        }
    },

    // ⚙️ Config & Bot Management
    async updateBotConfig(id, data) {
        if (!supabase) return false;
        try {
            const { error } = await supabase.from('bot_configs').update(data).eq('id', id);
            if (error) throw error;
            return true;
        } catch (e) { 
            return false; 
        }
    },

    async deleteWhatsAppSession(phoneNumber) {
        if (!supabase) return false;
        try {
            const { error } = await supabase.from('whatsapp_auth').delete().eq('phone_number', phoneNumber);
            if (error) throw error;
            return true;
        } catch (e) { 
            return false; 
        }
    },

    async updateWhatsAppAuth(phoneNumber, sessionData) {
        if (!supabase) return;
        try {
            const { error } = await supabase.from('whatsapp_auth').upsert({
                phone_number: phoneNumber,
                session_data: sessionData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'phone_number' });
            if (error) throw error;
        } catch (e) {
            const msg = e.message || '';
            if (!msg.includes('schema cache') && !msg.includes('upstream request timeout')) {
                console.error('[Supabase] updateWhatsAppAuth Error:', msg);
            }
        }
    },

    async logError(command, errorMessage, platform = 'WA') {
        if (!supabase) return;
        try {
            await supabase.from('error_logs').insert({
                command: command || 'unknown',
                error_message: errorMessage,
                platform
            });
        } catch (e) {
            // Silently fail to avoid cascading errors
        }
    },

    async getRecentErrors(limit = 10) {
        if (!supabase) return [];
        try {
            const { data } = await supabase
                .from('error_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);
            return data || [];
        } catch (e) {
            return [];
        }
    }
};

module.exports = { db };
