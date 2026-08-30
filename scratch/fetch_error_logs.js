const { supabase } = require('../lib/supabase');

(async () => {
  try {
    if (!supabase) {
      console.error('Supabase is not initialized');
      return;
    }
    console.log('Fetching latest error logs...');
    const { data, error } = await supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) throw error;

    console.log(`Success! Fetched ${data.length} error logs:`);
    data.forEach(log => {
      console.log(`[${log.created_at}] [${log.platform}] Command: ${log.command} -> ${log.error_message}`);
    });
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
})();
