const fs = require('fs');

const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');

// Find the broken line 6100 (index 6099)
let brokenLineIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("banProfanityUser('${u.jid}')") && lines[i].includes('// =================== DEV MESSAGES CHAT INBOX ===================')) {
    brokenLineIdx = i;
    break;
  }
}

if (brokenLineIdx === -1) {
  console.error('Broken line not found!');
  process.exit(1);
}

console.log('Found broken line at index:', brokenLineIdx, '(line', (brokenLineIdx+1), ')');
console.log('Content:', lines[brokenLineIdx].substring(0, 100));

// The broken line should be replaced with:
// 1. The complete ban button
// 2. The unban button
// 3. Closing divs for actions column + tr
// 4. The closing backtick for the map return
// 5. The closing of the map + listEl.innerHTML assignment
// 6. The catch block
// 7. The closing brace of the function

const replacement = [
  `                         <button onclick="banProfanityUser('\${u.jid}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(252,129,129,0.4);background:rgba(252,129,129,0.08);color:#fc8181;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="حظر المستخدم"><i class="fas fa-ban"></i> حظر</button>`,
  `                         <button onclick="unbanProfanityUser('\${u.jid}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(246,224,94,0.4);background:rgba(246,224,94,0.08);color:#f6e05e;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="رفع الحظر"><i class="fas fa-unlock"></i> رفع حظر</button>`,
  `                       </div>`,
  `                     </td>`,
  `                   </tr>\``,
  `               }).join('')}`,
  `             </tbody>`,
  `           </table>`,
  `         </div>`,
  `       </div>`,
  `     </div>\`;`,
  `    } catch(e) {`,
  `      listEl.innerHTML = \`<div style="color:var(--red);text-align:center;padding:20px;font-size:12px;">خطأ: \${e.message}</div>\`;`,
  `    }`,
  `  }`,
  ``,
  `  // =================== DEV MESSAGES CHAT INBOX ===================`
].join('\r\n');

// Replace the broken line and everything after it until DEV MESSAGES CHAT INBOX (which is currently on the same line)
lines[brokenLineIdx] = replacement;

// But now we also need to remove the junk lines that follow (6101, 6102 etc which are part of the old junk)
// Actually after replacement, the DEV MESSAGES CHAT INBOX comment is at the end of the replacement
// So we need to find where "global.activeDevMsgJid = null;" starts (line 6101 in original)
// and remove line 6101 and 6102 (they are now duplicated by the replacement)
// Let's check: line 6101 was "  global.activeDevMsgJid = null;"
// line 6102 was "  global.devMessagesCache = [];"
// These should remain! The replacement already includes the DEV MESSAGES comment before them.
// So actually we DON'T need to remove those lines.

const newContent = lines.join('\n');
fs.writeFileSync('public/index.html', newContent, 'utf8');
console.log('✅ Fixed! File size:', Buffer.byteLength(newContent, 'utf8'));
