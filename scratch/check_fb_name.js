const axios = require('axios');
const config = require('../config');

async function check() {
    let token = config.fbPageAccessToken;
    // Test fetching user name via page-scoped ID
    const senderId = '26818032764476635';
    
    // Try with /me/conversations to check if we can access sender info
    try {
        const url = `https://graph.facebook.com/v19.0/${senderId}?fields=id,name&access_token=${token}`;
        const res = await axios.get(url);
        console.log('User data:', res.data);
    } catch (e) {
        console.error('Error with direct user query:', e.response ? e.response.data.error.message : e.message);
    }

    // Try with /{psid}?fields=name via page PSID conversation query
    try {
        const url2 = `https://graph.facebook.com/v19.0/${senderId}?fields=first_name,last_name&access_token=${token}`;
        const res2 = await axios.get(url2);
        console.log('User profile:', res2.data);
    } catch (e) {
        console.error('Error with profile query:', e.response ? e.response.data.error.message : e.message);
    }

    // Correct approach: use /me/messages or sender_action profile endpoint
    // Actually the proper way is via Graph conversations API
    try {
        const url3 = `https://graph.facebook.com/v19.0/me/conversations?user_id=${senderId}&fields=participants&access_token=${token}`;
        const res3 = await axios.get(url3);
        console.log('Conversations data:', JSON.stringify(res3.data, null, 2));
    } catch (e) {
        console.error('Error with conversations query:', e.response ? e.response.data.error.message : e.message);
    }
}

check();
