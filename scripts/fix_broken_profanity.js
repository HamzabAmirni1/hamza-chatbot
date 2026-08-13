const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the broken line (line 6100, index 6099)
const brokenIdx = lines.findIndex(l =>
  l.includes("banProfanityUser") && l.includes("// =================== DEV MESSAGES")
);

if (brokenIdx === -1) {
  console.error('Could not find broken line!');
  process.exit(1);
}

console.log('Found broken line at index:', brokenIdx, '(line', brokenIdx+1, ')');
console.log('Content:', lines[brokenIdx].substring(0, 80));

// The broken line needs to be a complete ban button + close the template literal + close parent divs/td/tr
// We need to figure out what should come after the ban button.
// Looking at context: this is inside loadProfanityLogs function, inside a template literal for a <tr>
// The full sequence should be:
//   ban button (full)
//   unban button
//   close td, close tr
//   closing backtick + semicolon
// Then what was accidentally merged: the DEV MESSAGES CHAT INBOX comment

// Replace the broken line and insert the missing code
const fixedLines = [
  // Fix the broken ban button line (add the missing part)
  '                        <button onclick="banProfanityUser(\'${u.jid}\')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(252,129,129,0.4);background:rgba(252,129,129,0.08);color:#fc8181;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="\u062d\u0638\u0631 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645">',
  '                          <i class="fas fa-ban"></i> \u062d\u0638\u0631',
  '                        </button>',
  '                        <button onclick="unbanProfanityUser(\'${u.jid}\')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(246,224,94,0.4);background:rgba(246,224,94,0.08);color:#f6e05e;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="\u0631\u0641\u0639 \u0627\u0644\u062d\u0638\u0631">',
  '                          <i class="fas fa-unlock"></i> \u0631\u0641\u0639 \u062d\u0638\u0631',
  '                        </button>',
  '                      </div>',
  '                    </td>',
  '                  </tr>`;',
  '              }).join("")}',
  '            </tbody>',
  '          </table>',
  '        </div>',
  '      </div>',  // close card
  '  } catch(e) {',
  '    if (listEl) listEl.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px;font-size:12px;">\u062e\u0637\u0623: ${e.message}</div>`;',
  '  }',
  '}',
  '',
  '  // =================== DEV MESSAGES CHAT INBOX ==================='
];

// Replace the broken line with the fixed lines
lines.splice(brokenIdx, 1, ...fixedLines);

const newContent = lines.join('\n');
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('\u2705 Broken line fixed!');

// Verify
const check = newContent.split('\n');
const stillBroken = check.findIndex(l =>
  l.includes("banProfanityUser") && l.includes("// ===")
);
console.log('Still broken:', stillBroken !== -1 ? 'YES at line ' + (stillBroken+1) : 'NO - fixed!');
