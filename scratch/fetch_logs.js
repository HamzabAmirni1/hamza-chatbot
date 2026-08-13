const axios = require('axios');

const BASE_URL = 'https://gestionbothamzaamirni02.koyeb.app';
const AUTH_TOKEN = 'hamza-auth-token-2005'; // Default token

async function getLogs() {
  try {
    console.log("Fetching logs from:", BASE_URL);
    const res = await axios.get(`${BASE_URL}/api/syslog`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      timeout: 10000
    });
    console.log("Success! Logs retrieved:", res.data.logs.length);
    // Print the last 40 log messages
    const lastLogs = res.data.logs.slice(-40);
    lastLogs.forEach(log => {
      const timeStr = new Date(log.t).toLocaleTimeString();
      console.log(`[${timeStr}] ${log.icon} [${log.level.toUpperCase()}] ${log.msg}`);
    });
  } catch (err) {
    if (err.response) {
      console.error(`Error ${err.response.status}:`, err.response.data);
    } else {
      console.error("Network Error:", err.message);
    }
  }
}

getLogs();
