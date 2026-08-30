const fs = require('fs');

const content = fs.readFileSync('scripts/extracted_script.js', 'utf8');

let braces = 0;
let parens = 0;
let brackets = 0;
let inString = false;
let stringChar = '';
let inComment = false;
let commentType = ''; // 'single' or 'multi'

let lineNum = 1;

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  const nextChar = content[i+1];
  
  if (char === '\n') {
    lineNum++;
  }

  if (lineNum >= 4030 && lineNum <= 4055) {
    console.log(`L${lineNum}: char=${JSON.stringify(char)} state: inStr=${inString} strChar=${stringChar} braces=${braces} parens=${parens}`);
  }

  if (inComment) {
    if (commentType === 'single' && (char === '\n' || char === '\r')) {
      inComment = false;
    } else if (commentType === 'multi' && char === '*' && nextChar === '/') {
      inComment = false;
      i++;
    }
    continue;
  }
  
  if (inString) {
    if (char === '\\') {
      i++; // skip escaped char
    } else if (char === stringChar) {
      inString = false;
    }
    continue;
  }
  
  // Check comments
  if (char === '/' && nextChar === '/') {
    inComment = true;
    commentType = 'single';
    i++;
    continue;
  }
  if (char === '/' && nextChar === '*') {
    inComment = true;
    commentType = 'multi';
    i++;
    continue;
  }
  
  // Check strings
  if (char === '"' || char === "'" || char === '`') {
    inString = true;
    stringChar = char;
    continue;
  }
  
  if (char === '{') braces++;
  if (char === '}') braces--;
  if (char === '(') parens++;
  if (char === ')') parens--;
  if (char === '[') brackets++;
  if (char === ']') brackets--;
}
