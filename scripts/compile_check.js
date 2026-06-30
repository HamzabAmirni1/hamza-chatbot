const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('scripts/extracted_script.js', 'utf8');

try {
  new vm.Script(code, { filename: 'extracted_script.js' });
  console.log('✅ Compiled successfully!');
} catch (e) {
  console.error('❌ Compilation failed!');
  console.error(e.stack);
}
