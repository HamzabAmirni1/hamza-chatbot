// Scan for all top-level let/const/var declarations that appear AFTER window.onload
// These could be in Temporal Dead Zone when window.onload fires
const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');

const onloadLine = lines.findIndex(l => l.includes('window.onload = async'));
console.log(`window.onload is at line: ${onloadLine + 1}`);

// Find all top-level variable declarations
// We approximate "top-level" by looking at lines that start with 2 spaces + let/const/var
// (inside the script but not inside a function)
let depth = 0;
let inScript = false;
let results = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('<script>')) { inScript = true; depth = 0; continue; }
  if (line.includes('</script>')) { inScript = false; continue; }
  if (!inScript) continue;

  // Track brace depth
  const openBraces = (line.match(/{/g) || []).length;
  const closeBraces = (line.match(/}/g) || []).length;

  // Check if this is a top-level let/const that might be in TDZ
  if (depth === 0) {
    const m = line.match(/^\s{2}(let|const|var)\s+(\w+)/);
    if (m && i > onloadLine) {
      results.push({ line: i + 1, decl: m[0].trim(), type: m[1], name: m[2] });
    }
  }

  depth += openBraces - closeBraces;
  if (depth < 0) depth = 0;
}

console.log(`\nTop-level variable declarations AFTER window.onload (potential TDZ):`);
results.forEach(r => {
  console.log(`  Line ${r.line}: ${r.type} ${r.name}`);
});
console.log(`\nTotal: ${results.length}`);
