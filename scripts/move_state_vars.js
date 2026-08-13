const fs = require('fs');

let content = fs.readFileSync('public/index.html', 'utf8');

// 1. Move to STATE block
const stateMarker = '// =================== STATE ===================';
const stateIndex = content.indexOf(stateMarker);
if (stateIndex === -1) {
  console.error('State marker not found!');
  process.exit(1);
}

// We will insert the declarations right after stateMarker
const insertPos = stateIndex + stateMarker.length;
const declarations = `\n  let manageData = null;\n  let manageTab = localStorage.getItem('manage_tab') || 'commands';\n  let logsInterval = null;\n  let allLogs = [];`;

content = content.substring(0, insertPos) + declarations + content.substring(insertPos);

// 2. Remove the old declarations
const oldDecl1 = `  let manageData = null;\r\n  let manageTab = localStorage.getItem('manage_tab') || 'commands';\r\n\r\n  let logsInterval = null;\r\n  let allLogs = [];`;
const oldDecl2 = `  let manageData = null;\n  let manageTab = localStorage.getItem('manage_tab') || 'commands';\n\n  let logsInterval = null;\n  let allLogs = [];`;

if (content.includes(oldDecl1)) {
  content = content.replace(oldDecl1, '');
  console.log('✅ Removed old declarations (CRLF)');
} else if (content.includes(oldDecl2)) {
  content = content.replace(oldDecl2, '');
  console.log('✅ Removed old declarations (LF)');
} else {
  // Let's do individual removals to be extremely safe
  content = content.replace('let manageData = null;', '');
  content = content.replace("let manageTab = localStorage.getItem('manage_tab') || 'commands';", '');
  content = content.replace('let logsInterval = null;', '');
  content = content.replace('let allLogs = [];', '');
  console.log('✅ Removed old declarations individually');
}

fs.writeFileSync('public/index.html', content, 'utf8');
console.log('✅ Done moving variables!');
