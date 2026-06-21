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

    // 📊 Bot Stats
    _statsCache: null,
    _lastStatsFetch: 0,

    async getStats() {
        if (!supabase) return null;
        try {
            // Return cached stats if fetched within the last 2 minutes
            const now = Date.now();
            if (this._statsCache && (now - this._lastStatsFetch < 120000)) {
                return this._statsCache;
            }

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

            // Only run expensive counts if Cache is old (5 mins)
            let userCount = data ? data.total_users : 0;
            let botCount = 0;

            if (!this._statsCache || (now - this._lastStatsFetch > 300000)) {
                const { count: uC } = await supabase.from('ai_memory').select('*', { count: 'estimated', head: true });
                const { count: bC } = await supabase.from('whatsapp_auth').select('*', { count: 'estimated', head: true });
                userCount = uC || userCount;
                botCount = bC || 0;
            }

            const finalStats = {
                ...data,
                total_users: userCount,
                active_bots: botCount
            };

            this._statsCache = finalStats;
            this._lastStatsFetch = now;
            return finalStats;
        } catch (e) {
            console.error('[Supabase] getStats Error:', e.message);
            return this._statsCache; // Return last known good stats
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

    // 🧠 AI Memory Management - Queue System
    _aiMemoryQueue: new Map(),
    _isProcessingQueue: false,

    async updateAIMemory(jid, history, lastImage) {
        if (!supabase) return;

        // Keep only the last 10 messages
        const trimmedHistory = Array.isArray(history) ? history.slice(-10) : history;
        
        // Add to Memory Queue instead of immediate DB call
        this._aiMemoryQueue.set(jid, {
            jid,
            history: trimmedHistory,
            last_image: lastImage,
            updated_at: new Date().toISOString()
        });

        // Trigger queue processor if not already running
        if (!this._isProcessingQueue) {
            this._processAIMemoryQueue();
        }
    },

    async _processAIMemoryQueue() {
        if (this._isProcessingQueue) return;
        this._isProcessingQueue = true;

        setTimeout(async () => {
            if (this._aiMemoryQueue.size === 0) {
                this._isProcessingQueue = false;
                return;
            }

            // Extract all queued updates
            const updates = Array.from(this._aiMemoryQueue.values());
            this._aiMemoryQueue.clear();

            try {
                const { error } = await supabase.from('ai_memory').upsert(updates, { onConflict: 'jid' });
                if (error) throw error;
            } catch (e) {
                const msg = e.message || '';
                if (!msg.includes('schema cache') && !msg.includes('upstream request timeout')) {
                    console.error('[Supabase AI Queue Update Error]:', msg);
                }
            }
            
            this._isProcessingQueue = false;
            
            // Re-trigger if new items arrived during processing
            if (this._aiMemoryQueue.size > 0) {
                this._processAIMemoryQueue();
            }
        }, 5000); // 5 seconds batch window
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

    async insertBotConfig(data) {
        if (!supabase) return null;
        try {
            const { data: insertedData, error } = await supabase.from('bot_configs').insert({
                ...data,
                is_active: true,
                created_at: new Date().toISOString()
            }).select().single();
            if (error) throw error;
            return insertedData;
        } catch (e) {
            console.error('[Supabase] insertBotConfig Error:', e.message);
            return null;
        }
    },

    async deleteBotConfig(id) {
        if (!supabase) return false;
        try {
            const { error } = await supabase.from('bot_configs').delete().eq('id', id);
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('[Supabase] deleteBotConfig Error:', e.message);
            return false;
        }
    },

    // 👥 Platform Users — stored in ai_memory with tg:/fb: prefix
    async upsertPlatformUser(jid) {
        if (!supabase) return;
        try {
            await supabase.from('ai_memory').upsert(
                { jid, history: [], last_image: null, updated_at: new Date().toISOString() },
                { onConflict: 'jid', ignoreDuplicates: true }
            );
        } catch (e) { /* non-critical, silent fail */ }
    },

    async getUsers(platform) {
        if (!supabase) return [];
        try {
            let query = supabase.from('ai_memory').select('jid, updated_at');
            if (platform === 'whatsapp') {
                query = query.ilike('jid', '%@s.whatsapp.net');
            } else if (platform === 'telegram') {
                query = query.ilike('jid', 'tg:%');
            } else if (platform === 'facebook') {
                query = query.ilike('jid', 'fb:%');
            }
            const { data, error } = await query.limit(500);
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Supabase] getUsers Error:', e.message);
            return [];
        }
    },

    async getAllUsers() {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase.from('ai_memory').select('jid, updated_at');
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Supabase] getAllUsers Error:', e.message);
            return [];
        }
    },

    async getRecentActivity(limit = 50) {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase
                .from('ai_memory')
                .select('jid, history, updated_at')
                .order('updated_at', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Supabase] getRecentActivity Error:', e.message);
            return [];
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
    },

    async deleteAllUsers() {
        if (!supabase) return false;
        try {
            // Fetch all jid values in batches and delete in chunks to avoid statement timeout
            let from = 0;
            const batchSize = 100;
            let deleted = 0;
            while (true) {
                const { data, error: fetchErr } = await supabase
                    .from('ai_memory')
                    .select('jid')
                    .range(from, from + batchSize - 1);
                if (fetchErr) throw fetchErr;
                if (!data || data.length === 0) break;
                const jids = data.map(r => r.jid).filter(Boolean);
                if (jids.length > 0) {
                    const { error: delErr } = await supabase
                        .from('ai_memory')
                        .delete()
                        .in('jid', jids);
                    if (delErr) throw delErr;
                    deleted += jids.length;
                }
                if (data.length < batchSize) break;
                from += batchSize;
            }
            console.log(`[Supabase] deleteAllUsers: removed ${deleted} records`);
            return true;
        } catch (e) {
            console.error('[Supabase] deleteAllUsers Error:', e.message);
            return false;
        }
    },
    async deleteUser(jid) {
        if (!supabase) return false;
        try {
            const { error } = await supabase.from('ai_memory').delete().eq('jid', jid);
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('[Supabase] deleteUser Error:', e.message);
            return false;
        }
    },

    async saveUserNames(platform, namesObj) {
        if (!supabase) return;
        try {
            await supabase.from('ai_memory').upsert({
                jid: `names:${platform}`,
                history: [namesObj]
            }, { onConflict: 'jid' });
        } catch (e) {
            console.error(`[Supabase] saveUserNames ${platform} Error:`, e.message);
        }
    },

    async loadUserNames(platform) {
        if (!supabase) return {};
        try {
            const { data, error } = await supabase.from('ai_memory').select('history').eq('jid', `names:${platform}`).single();
            if (error) throw error;
            return (data && data.history && data.history[0]) ? data.history[0] : {};
        } catch (e) {
            return {};
        }
    },

    async clearAllActivity() {
        if (!supabase) return false;
        try {
            const { error } = await supabase.from('ai_memory').update({ history: [] }).neq('jid', '');
            if (error) throw error;
            return true;
        } catch (e) {
            console.error('[Supabase] clearAllActivity Error:', e.message);
            return false;
        }
    },

    async getCache(key) {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase.from('ai_memory').select('history').eq('jid', `cache:${key}`).single();
            if (error && error.code !== 'PGRST116') throw error;
            return data ? data.history : null;
        } catch (e) {
            console.error(`[Supabase] getCache error for ${key}:`, e.message);
            return null;
        }
    },

    async setCache(key, value) {
        if (!supabase) return false;
        try {
            const { error } = await supabase.from('ai_memory').upsert({ jid: `cache:${key}`, history: value }, { onConflict: 'jid' });
            if (error) throw error;
            return true;
        } catch (e) {
            console.error(`[Supabase] setCache error for ${key}:`, e.message);
            return false;
        }
    }
};

module.exports = { db };
