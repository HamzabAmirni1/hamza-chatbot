const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const s = content.indexOf('<script>');
const e = content.lastIndexOf('</script>');
fs.writeFileSync('scripts/extracted_script.js', content.substring(s + 8, e));
console.log('Extracted. Length:', content.substring(s + 8, e).length);
