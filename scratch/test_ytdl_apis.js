const axios = require('axios');

const testUrl = 'https://www.youtube.com/watch?v=1JLfO2MzleU';
const qualities = ['144', '240', '360', '480', '720', '1080'];

(async () => {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://y2down.cc/',
    'Origin': 'https://y2down.cc'
  };

  for (const q of qualities) {
    try {
      console.log(`Testing quality ${q}...`);
      const res = await axios.get('https://p.savenow.to/ajax/download.php', {
        params: { copyright: '0', format: q, url: testUrl, api: 'dfcb6d76f2f6a9894gjkege8a4ab232222' },
        headers,
        timeout: 10000
      });
      console.log(`Quality ${q} initial response success:`, res.data?.success, 'progress_url:', res.data?.progress_url);
    } catch (e) {
      console.log(`Quality ${q} failed:`, e.message, e.response ? `Status: ${e.response.status}` : '');
    }
  }
})();
