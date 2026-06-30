const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = '  function openProfanityMsgModal(jid, platform, name) {';
const endMarker   = '  async function unbanProfanityUser(jid) {';

const startIdx = content.indexOf(startMarker);
const endIdx   = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!', { startIdx, endIdx });
  process.exit(1);
}

// Read the replacement HTML from a separate file
const replacementPath = path.join(__dirname, 'chat_modal_replacement.txt');
const newFunctions = fs.readFileSync(replacementPath, 'utf8');

const before = content.substring(0, startIdx);
const after  = content.substring(endIdx);
const newContent = before + newFunctions + '\n\n  ' + after;

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done! File updated. Size:', Buffer.byteLength(newContent, 'utf8'), 'bytes');
