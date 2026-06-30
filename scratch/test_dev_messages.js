const { db } = require('../lib/supabase');

(async () => {
  try {
    console.log('Testing db.getDevMessages()...');
    const messages = await db.getDevMessages();
    console.log('Success! Count:', messages.length);
    if (messages.length > 0) {
      console.log('First message:', messages[0]);
    }
  } catch (err) {
    console.error('Error occurred:', err);
  }
})();
