const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

const targetJunkStart = `  }font-size:11px;color:var(--text-muted);direction:ltr;">\${m.sender} · \${pLabel}</div>`;
const targetJunkEnd = `  // =================== HELPERS ===================`;

const startIdx = content.indexOf(targetJunkStart);
const endIdx = content.indexOf(targetJunkEnd);

if (startIdx === -1 || endIdx === -1) {
  console.error('Junk markers not found!', { startIdx, endIdx });
  process.exit(1);
}

console.log('Junk starts at:', startIdx);
console.log('Helpers start at:', endIdx);

const before = content.substring(0, startIdx);
const after = content.substring(endIdx);

const newContent = before + '\n\n' + after;
fs.writeFileSync(filePath, newContent, 'utf8');

console.log('✅ Junk code successfully deleted! File size:', Buffer.byteLength(newContent, 'utf8'));
