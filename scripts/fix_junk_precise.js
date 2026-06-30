const fs = require('fs');

const content = fs.readFileSync('public/index.html', 'utf8');

// The junk block starts at:
const junkSearchStr = `}font-size:11px;color:var(--text-muted);direction:ltr;">\${m.sender} · \${pLabel}</div>`;
const junkStart = content.indexOf(junkSearchStr);

// But we need to go one char back - the `}` is the closing `}` of `clearAllDevMessages`
// Actually the junk starts at the very start of `  }font-size:...`
// Let's go back to find the actual start (the `\r\n  }font-size`)
const lineStart = content.lastIndexOf('\r\n', junkStart) + 2; // find start of line

// The junk block ends just before "  // =================== HELPERS ==================="
const junkEnd = content.indexOf('  // =================== HELPERS ===================');

console.log('Junk block line start:', lineStart);
console.log('Junk block end:', junkEnd);
console.log('Chars to delete:', junkEnd - lineStart);
console.log('First 100 chars of junk:', content.substring(lineStart, lineStart + 100));
console.log('Last 100 chars of junk:', content.substring(junkEnd - 100, junkEnd));

// Now replace the junk block with empty string
const before = content.substring(0, lineStart);
const after = content.substring(junkEnd);
const newContent = before + after;

fs.writeFileSync('public/index.html', newContent, 'utf8');
console.log('✅ Junk block removed! New file size:', Buffer.byteLength(newContent, 'utf8'));
