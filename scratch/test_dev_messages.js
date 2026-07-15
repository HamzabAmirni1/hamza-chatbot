const { supabase } = require('../lib/supabase');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const client = createClient(config.supabaseUrl, config.supabaseKey);

(async () => {
  try {
    console.log('Deleting test messages...');
    const { data, error } = await client
      .from('dev_messages')
      .delete()
      .like('id', 'test_id_%');
    
    if (error) throw error;
    console.log('Successfully deleted test rows.');
  } catch (err) {
    console.error('Error occurred:', err);
  }
})();
