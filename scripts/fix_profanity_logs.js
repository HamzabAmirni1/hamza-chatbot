const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Find the start of loadProfanityLogs
const startMarker = '  async function loadProfanityLogs() {';
const endMarker   = '  // =================== DEV MESSAGES CHAT INBOX ===================';

const startIdx = content.indexOf(startMarker);
const endIdx   = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!', { startIdx, endIdx });
  process.exit(1);
}

console.log('loadProfanityLogs starts at:', startIdx);
console.log('DEV MESSAGES CHAT INBOX at:', endIdx);

// Replace the entire loadProfanityLogs function with a clean version
const cleanFunction = `  async function loadProfanityLogs() {
    const listEl  = document.getElementById('profanity-list');
    const countEl = document.getElementById('profanity-count');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class=\\"fas fa-spinner fa-spin\\" style=\\"font-size:24px;\\"></i></div>';
    try {
      const res  = await fetch('/api/profanity-logs');
      const data = await res.json();
      const logs = data.logs || [];
      if (countEl) countEl.textContent = '(' + logs.length + ' \u0645\u062e\u0627\u0644\u0641\u0629)';
      if (logs.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px;"><i class=\\"fas fa-check-circle\\" style=\\"font-size:32px;margin-bottom:12px;display:block;color:var(--accent);opacity:0.6;\\"></i>\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u062e\u0627\u0644\u0641\u0627\u062a</div>';
        return;
      }
      // Group by JID
      const grouped = {};
      for (const log of logs) {
        if (!grouped[log.jid]) grouped[log.jid] = { ...log, count: 0 };
        grouped[log.jid].count++;
        if (new Date(log.timestamp) >= new Date(grouped[log.jid].timestamp)) {
          grouped[log.jid].warnings_left = log.warnings_left;
          grouped[log.jid].timestamp     = log.timestamp;
        }
      }
      const users         = Object.values(grouped);
      const platformIcon  = { WA: '\uD83D\uDFE2', TG: '\u2708\uFE0F', FB: '\uD83D\uDD35' };
      const platformLabel = { WA: '\u0648\u0627\u062a\u0633\u0627\u0628', TG: '\u062a\u064a\u0644\u064a\u063a\u0631\u0627\u0645', FB: '\u0641\u064a\u0633\u0628\u0648\u0643' };

      let rows = '';
      users.forEach(function(u) {
        const wLeft  = u.warnings_left;
        const wColor = wLeft <= 0 ? '#fc8181' : wLeft === 1 ? '#f6a623' : '#68d391';
        const wLabel = wLeft <= 0 ? '\uD83D\uDEAB \u0645\u062d\u0638\u0648\u0631' : (wLeft + ' / 3');
        const ts     = new Date(u.timestamp).toLocaleString('ar-MA');
        const pkey   = u.platform;
        const safeName = (u.name || '\u0645\u0633\u062a\u062e\u062f\u0645').replace(/'/g, "\\\\'");
        rows += '<tr style="border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'"> '
          + '<td style="padding:10px 12px;white-space:nowrap;">' + (platformIcon[pkey] || '\u2753') + ' ' + (platformLabel[pkey] || pkey) + '</td>'
          + '<td style="padding:10px 12px;font-size:12px;max-width:150px;">'
          +   '<div style="font-weight:600;">' + (u.name || '\u2014') + '</div>'
          +   '<div style="color:var(--text-muted);font-size:10px;font-family:monospace;word-break:break-all;">' + u.jid + '</div>'
          + '</td>'
          + '<td style="padding:10px 12px;"><code style="background:rgba(252,129,129,0.12);color:#fc8181;padding:2px 7px;border-radius:4px;">' + (u.bad_word || '') + '</code></td>'
          + '<td style="padding:10px 12px;text-align:center;font-weight:700;color:var(--purple);">' + u.count + '</td>'
          + '<td style="padding:10px 12px;text-align:center;font-weight:700;color:' + wColor + ';">' + wLabel + '</td>'
          + '<td style="padding:10px 12px;color:var(--text-muted);font-size:11px;white-space:nowrap;">' + ts + '</td>'
          + '<td style="padding:10px 12px;">'
          +   '<div style="display:flex;gap:5px;flex-wrap:wrap;">'
          +     '<button onclick="openProfanityMsgModal(\'' + u.jid + '\',\'' + pkey + '\',\'' + safeName + '\')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(99,179,237,0.4);background:rgba(99,179,237,0.08);color:#63b3ed;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="\u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0623\u0648 \u0635\u0648\u0631\u0629"><i class=\\"fas fa-paper-plane\\"></i> \u0631\u0633\u0627\u0644\u0629</button>'
          +     '<button onclick="resetProfanityWarnings(\'' + u.jid + '\')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(104,211,145,0.4);background:rgba(104,211,145,0.08);color:#68d391;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="\u0625\u0639\u0627\u062f\u0629 \u0636\u0628\u0637 \u0627\u0644\u062a\u062d\u0630\u064a\u0631\u0627\u062a"><i class=\\"fas fa-redo\\"></i> \u0625\u0639\u0627\u062f\u0629 \u0636\u0628\u0637</button>'
          +     '<button onclick="banProfanityUser(\'' + u.jid + '\')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(252,129,129,0.4);background:rgba(252,129,129,0.08);color:#fc8181;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="\u062d\u0638\u0631 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645"><i class=\\"fas fa-ban\\"></i> \u062d\u0638\u0631</button>'
          +     '<button onclick="unbanProfanityUser(\'' + u.jid + '\')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(246,224,94,0.4);background:rgba(246,224,94,0.08);color:#f6e05e;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="\u0631\u0641\u0639 \u0627\u0644\u062d\u0638\u0631"><i class=\\"fas fa-unlock\\"></i> \u0631\u0641\u0639 \u062d\u0638\u0631</button>'
          +   '</div>'
          + '</td>'
          + '</tr>';
      });

      listEl.innerHTML = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<thead><tr style="border-bottom:1px solid var(--border);">'
        + '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">\u0627\u0644\u0645\u0646\u0635\u0629</th>'
        + '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645</th>'
        + '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">\u0627\u0644\u0643\u0644\u0645\u0629</th>'
        + '<th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">\u0639\u062f\u062f \u0627\u0644\u0645\u062e\u0627\u0644\u0641\u0627\u062a</th>'
        + '<th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">\u062a\u062d\u0630\u064a\u0631\u0627\u062a \u0645\u062a\u0628\u0642\u064a\u0629</th>'
        + '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">\u0622\u062e\u0631 \u0645\u062e\u0627\u0644\u0641\u0629</th>'
        + '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">\u0625\u062c\u0631\u0627\u0621\u0627\u062a</th>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table></div>';
    } catch (e) {
      listEl.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px;font-size:12px;">\u062e\u0637\u0623: ' + e.message + '</div>';
    }
  }

`;

const before = content.substring(0, startIdx);
const after  = content.substring(endIdx);
const newContent = before + cleanFunction + after;

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done! loadProfanityLogs replaced cleanly.');
console.log('File size:', Buffer.byteLength(newContent, 'utf8'), 'bytes');
