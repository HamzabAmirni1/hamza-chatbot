const fs = require('fs');

const content = fs.readFileSync('public/index.html', 'utf8');
const searchStr = `}font-size:11px;color:var(--text-muted);direction:ltr;">\${m.sender} · \${pLabel}</div>`;
const startIdx = content.indexOf(searchStr);

if (startIdx === -1) {
  console.log('Not found!');
} else {
  // Find start of the next function after junk
  // The junk block is the remainder of loadDevMessages + extra functions (showDevReply, hideDevReply, sendDevReply, deleteDevMsg, clearAllDevMessages)
  // All these functions exist also BEFORE the junk block
  // We need to find where the junk block ends
  // The junk block ends just before "  // =================== HELPERS ==================="
  const nextMarker = '  // =================== HELPERS ===================';
  const markers = [];
  let searchFrom = startIdx;
  let idx;
  while ((idx = content.indexOf(nextMarker, searchFrom)) !== -1) {
    markers.push(idx);
    searchFrom = idx + 1;
  }
  console.log('All positions of HELPERS marker:', markers);
  
  // Also find "  function showAlert" to identify the start of HELPERS
  const showAlertIdx = [];
  searchFrom = startIdx;
  while ((idx = content.indexOf('  function showAlert(el, type, msg) {', searchFrom)) !== -1) {
    showAlertIdx.push(idx);
    searchFrom = idx + 1;
  }
  console.log('All positions of showAlert:', showAlertIdx);
}
