const axios = require('axios');

const testUrl = 'https://www.youtube.com/watch?v=1JLfO2MzleU';

async function testApi(name, url, method = 'get', data = null, headers = {}) {
  try {
    console.log(`[TESTING] ${name}...`);
    const options = {
      method,
      url,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      }
    };
    if (data) options.data = data;
    const res = await axios(options);
    console.log(`[SUCCESS] ${name}:`, JSON.stringify(res.data).substring(0, 300));
    return true;
  } catch (err) {
    console.log(`[FAILED] ${name}: ${err.message}`, err.response ? `Status: ${err.response.status}` : '');
    return false;
  }
}

(async () => {
  // Test Lolhuman (using free/popular trial keys or no key)
  await testApi('Lolhuman free key', `https://api.lolhuman.xyz/api/ytmp4?apikey=free&url=${encodeURIComponent(testUrl)}`);
  await testApi('Lolhuman global key', `https://api.lolhuman.xyz/api/ytmp4?apikey=global&url=${encodeURIComponent(testUrl)}`);
  
  // Test Yanzbotz
  await testApi('Yanzbotz ytmp4', `https://api.yanzbotz.my.id/api/downloader/ytmp4?url=${encodeURIComponent(testUrl)}`);
  
  // Test some other known endpoints
  await testApi('Sandipbaruwal ytmp4', `https://api.sandipbaruwal.com.np/api/ytmp4?url=${encodeURIComponent(testUrl)}`);
  await testApi('Caliph API', `https://api.caliph.biz.id/api/ytmp4?url=${encodeURIComponent(testUrl)}`);
})();
