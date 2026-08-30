const axios = require('axios');

async function checkApp1() {
  try {
    const res = await axios.get('https://gestionbothamzaamirni01.koyeb.app/health', { timeout: 8000 });
    console.log("App 1 Status:", res.status);
    console.log("App 1 Data:", res.data);
  } catch (err) {
    if (err.response) {
      console.log("App 1 responded with error status:", err.response.status);
    } else {
      console.log("App 1 is unreachable/sleeping:", err.message);
    }
  }
}

checkApp1();
