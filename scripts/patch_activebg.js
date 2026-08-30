const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Replace activeBg logic + chat-list-item div with clean CSS-class version
const oldCode = `        const isActive = global.activeDevMsgJid === c.sender;\r\n        const activeBg = isActive ? 'background: rgba(255,255,255,0.06); border-color: var(--accent) !important;' : 'border-color: transparent;';\r\n\r\n        return \`\r\n          <div class="chat-list-item" data-jid="\${c.sender}" onclick="openConversation('\${c.sender}')" style="display:flex; align-items:center; gap:12px; padding:12px; border-right:4px solid transparent; cursor:pointer; transition:all 0.2s; border-bottom:1px solid var(--border); \${activeBg}" onmouseover="if(!this.style.background.includes('0.06'))this.style.background='var(--bg)'" onmouseout="if(!this.style.background.includes('0.06'))this.style.background=''">`;

const newCode = `        const isActive = global.activeDevMsgJid === c.sender;\r\n\r\n        return \`\r\n          <div class="chat-list-item\${isActive ? ' active' : ''}" data-jid="\${c.sender}" onclick="openConversation('\${c.sender}')" style="display:flex; align-items:center; gap:12px; padding:12px; border-right:4px solid transparent; cursor:pointer; border-bottom:1px solid var(--border);">`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  console.log('✅ Fixed: chat-list-item now uses CSS active class cleanly.');
} else {
  console.log('⚠️  Pattern not found. Checking...');
  // Try to find what's there
  const idx = content.indexOf('const activeBg');
  if (idx !== -1) {
    console.log('Found activeBg at index:', idx);
    console.log('Context:', content.substring(idx, idx + 300));
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
