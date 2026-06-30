const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Find the problematic rows line and replace it with a version without inline event handlers
// The issue: single-quotes inside a single-quoted JS string
const lines = content.split('\n');
let fixCount = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("rows += '<tr") && lines[i].includes("onmouseover") && lines[i].includes("var(--bg)")) {
    // Replace the entire <tr> opening with a simple version without hover events
    lines[i] = "        rows += '<tr style=\"border-bottom:1px solid var(--border);\">'";
    console.log('Fixed line', i+1);
    fixCount++;
  }
}

if (fixCount === 0) {
  console.log('No lines matched - checking manually...');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("rows +=") && lines[i].includes("<tr")) {
      console.log('Line', i+1, ':', lines[i].substring(0, 100));
    }
  }
} else {
  console.log('Fixed', fixCount, 'line(s)');
}

const newContent = lines.join('\n');
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done!');
