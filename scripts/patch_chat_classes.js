const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1) Fix active chat item highlight to use CSS class
const oldHighlight = `    items.forEach(item => {\r\n      if (item.getAttribute('data-jid') === senderJid) {\r\n        item.style.background = 'rgba(255,255,255,0.06)';\r\n        item.style.borderRightColor = 'var(--accent)';\r\n      } else {\r\n        item.style.background = '';\r\n        item.style.borderRightColor = 'transparent';\r\n      }\r\n    });`;
const newHighlight = `    items.forEach(item => {\r\n      if (item.getAttribute('data-jid') === senderJid) {\r\n        item.classList.add('active');\r\n      } else {\r\n        item.classList.remove('active');\r\n      }\r\n    });`;

if (content.includes(oldHighlight)) {
  content = content.replace(oldHighlight, newHighlight);
  console.log('✅ Fixed: active chat highlight uses CSS class now.');
} else {
  console.log('⚠️  active highlight pattern not found (may already be updated).');
}

// 2) Add unread-dot class to unread indicator
const oldDot = `\${isUnread ? \`<div style="width:8px; height:8px; border-radius:50%; background:var(--accent); margin-right:6px; flex-shrink:0;"></div>\` : ''}`;
const newDot = `\${isUnread ? \`<div class="unread-dot" style="width:8px; height:8px; border-radius:50%; background:var(--accent); margin-right:6px; flex-shrink:0;"></div>\` : ''}`;

if (content.includes(oldDot)) {
  content = content.replace(oldDot, newDot);
  console.log('✅ Fixed: unread dot has pulse animation class.');
} else {
  console.log('⚠️  unread dot pattern not found (may already be updated).');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
