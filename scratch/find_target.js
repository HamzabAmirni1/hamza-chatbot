const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'lib', 'ai.js');
const content = fs.readFileSync(filePath, 'utf8');

const startIdx = content.indexOf('// Race them!');
if (startIdx !== -1) {
    const snippet = content.substring(startIdx, startIdx + 200);
    console.log("Snippet:", JSON.stringify(snippet));
} else {
    console.log("Start not found");
}
