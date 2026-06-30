const axios = require('axios');

const BASE_URL = 'https://gestionbothamzaamirni02.koyeb.app';
const AUTH_TOKEN = 'hamza-auth-token-2005';

async function getAllLogs() {
  try {
    const res = await axios.get(`${BASE_URL}/api/syslog`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` },
      timeout: 10000
    });
    console.log("Total Logs:", res.data.logs.length);
    // Print all logs in chronological order
    const sortedLogs = [...res.data.logs].reverse();
    sortedLogs.forEach(log => {
      const timeStr = new Date(log.t).toLocaleTimeString();
      console.log(`[${timeStr}] ${log.icon} [${log.level.toUpperCase()}] ${log.msg}`);
    });
  } catch (err) {
    if (err.response) {
      console.error("Error:", err.response.data);
    } else {
      console.error("Network Error:", err.message);
    }
  }
}

getAllLogs();
