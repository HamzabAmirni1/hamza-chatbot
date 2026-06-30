const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the two onmouseover/onmouseout quote conflicts in loadProfanityLogs rows string
// The issue is: 'this.style.background=\'var(--bg)\'' inside single-quoted string
const oldRow1 = `'<tr style="border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background=\\'var(--bg)\\'" onmouseout="this.style.background=\\'\\'"> '`;
const newRow1 = `'<tr style="border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background=var(--bg)" onmouseout="this.style.background="> '`;

// Actually let's just find and fix the specific line in the HTML
const brokenPattern = `rows += '<tr style="border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background=\\'var(--bg)\\'" onmouseout="this.style.background=\\'\\'">`;
const fixedPattern  = `rows += '<tr style="border-bottom:1px solid var(--border);transition:background 0.2s;">`;

if (content.includes(brokenPattern)) {
  content = content.replace(brokenPattern, fixedPattern);
  console.log('✅ Fixed onmouseover quote conflict');
} else {
  // Try alternative - the escaped version that node produces
  console.log('Pattern not found directly, searching...');
  const idx = content.indexOf("rows += '<tr style=\"border-bottom:1px solid var(--border)");
  if (idx !== -1) {
    console.log('Found at index:', idx);
    const lineEnd = content.indexOf('\n', idx);
    console.log('Line:', content.substring(idx, lineEnd));
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
