try {
  const ruhend = require('ruhend-scraper');
  console.log('Ruhend scraper exports:', Object.keys(ruhend));
} catch (e) {
  console.log('Error importing ruhend-scraper:', e.message);
}
