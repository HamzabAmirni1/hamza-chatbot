const { ytmp3 } = require('ruhend-scraper');

const testUrl = 'https://www.youtube.com/watch?v=1JLfO2MzleU';

(async () => {
  try {
    console.log('Calling ruhend-scraper ytmp3...');
    const result = await ytmp3(testUrl);
    console.log('Result:', result);
  } catch (e) {
    console.log('Error:', e.message);
  }
})();
