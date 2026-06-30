const fs = require('fs');

const code = fs.readFileSync('scripts/extracted_script.js', 'utf8');

let pos = 0;
let len = code.length;

let line = 1;
let col = 1;

function nextChar() {
  const c = code[pos];
  pos++;
  if (c === '\n') {
    line++;
    col = 1;
  } else {
    col++;
  }
  return c;
}

function peek(offset = 0) {
  return code[pos + offset];
}

let bracesStack = [];
let parensStack = [];
let bracketsStack = [];
let stateStack = ['JS'];
let templateBraceDepth = [];
let lastToken = '';

while (pos < len) {
  let c = peek();
  let state = stateStack[stateStack.length - 1];

  const currentLine = line;
  const currentCol = col;

  if (currentLine >= 2770 && currentLine <= 2785) {
    console.log(`L${currentLine}:${currentCol} char=${JSON.stringify(c)} lastToken=${lastToken} bracesStackSize=${bracesStack.length} topBraceLine=${bracesStack.length > 0 ? bracesStack[bracesStack.length-1].line : 'none'}`);
  }

  // Whitespace
  if (/\s/.test(c)) {
    nextChar();
    continue;
  }

  // Single-line comment
  if (c === '/' && peek(1) === '/') {
    nextChar(); nextChar();
    while (pos < len && peek() !== '\n' && peek() !== '\r') {
      nextChar();
    }
    continue;
  }

  // Multi-line comment
  if (c === '/' && peek(1) === '*') {
    nextChar(); nextChar();
    while (pos < len && !(peek() === '*' && peek(1) === '/')) {
      nextChar();
    }
    if (pos < len) { nextChar(); nextChar(); }
    continue;
  }

  if (state === 'TEMPLATE') {
    let sc = nextChar();
    if (sc === '\\') {
      nextChar();
    } else if (sc === '`') {
      stateStack.pop();
    } else if (sc === '$' && peek() === '{') {
      nextChar();
      stateStack.push('TEMPLATE_EXPR');
      templateBraceDepth.push(bracesStack.length);
      bracesStack.push({ line, col, type: '${' });
    }
    continue;
  }

  // Strings
  if (c === '"' || c === "'") {
    const quote = nextChar();
    let closed = false;
    while (pos < len) {
      let sc = nextChar();
      if (sc === '\\') {
        nextChar();
      } else if (sc === quote) {
        closed = true;
        break;
      }
    }
    lastToken = 'string';
    continue;
  }

  // Template literals
  if (c === '`') {
    nextChar();
    stateStack.push('TEMPLATE');
    lastToken = 'template';
    continue;
  }

  // Regex literals
  const regexStarters = ['=', '(', ',', ':', '?', '&', '|', '!', '{', '}', '[', ']', ';', 'return', 'throw', 'typeof', 'case', 'delete', 'void', 'in', 'instanceof', 'new'];
  if (c === '/' && (lastToken === '' || regexStarters.includes(lastToken))) {
    nextChar();
    let closed = false;
    while (pos < len) {
      let rc = nextChar();
      if (rc === '\\') {
        nextChar();
      } else if (rc === '/') {
        closed = true;
        break;
      } else if (rc === '[') {
        while (pos < len && peek() !== ']') {
          let cc = nextChar();
          if (cc === '\\') nextChar();
        }
        if (pos < len) nextChar();
      }
    }
    while (pos < len && /[a-z]/i.test(peek())) {
      nextChar();
    }
    lastToken = 'regex';
    continue;
  }

  // Punctuators
  if (c === '{') {
    nextChar();
    bracesStack.push({ line, col, type: '{' });
    lastToken = '{';
    continue;
  }
  if (c === '}') {
    nextChar();
    if (bracesStack.length > 0) {
      bracesStack.pop();
      if (state === 'TEMPLATE_EXPR' && bracesStack.length === templateBraceDepth[templateBraceDepth.length - 1]) {
        stateStack.pop();
        templateBraceDepth.pop();
      }
    }
    lastToken = '}';
    continue;
  }
  if (c === '(') {
    nextChar();
    parensStack.push({ line, col });
    lastToken = '(';
    continue;
  }
  if (c === ')') {
    nextChar();
    if (parensStack.length > 0) {
      parensStack.pop();
    }
    lastToken = ')';
    continue;
  }
  if (c === '[') {
    nextChar();
    bracketsStack.push({ line, col });
    lastToken = '[';
    continue;
  }
  if (c === ']') {
    nextChar();
    if (bracketsStack.length > 0) {
      bracketsStack.pop();
    }
    lastToken = ']';
    continue;
  }

  // Word/Number/Operator
  let match = code.substring(pos).match(/^([a-zA-Z_$][a-zA-Z0-9_$]*|[0-9]+(\.[0-9]+)?|[+\-*%&|^~<>!=]+)/);
  if (match) {
    const token = match[0];
    pos += token.length;
    col += token.length;
    lastToken = token;
    continue;
  }

  nextChar();
  lastToken = c;
}

console.log('Parser finished. Max line reached:', line);
