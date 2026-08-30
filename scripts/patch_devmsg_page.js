const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = '<!-- =================== DEV MESSAGES PAGE =================== -->';
const endMarker = '<!-- =================== MANAGE PAGE =================== -->';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!');
  process.exit(1);
}

// The new section (we keep the MANAGE marker in place)
const newSection = `<!-- =================== DEV MESSAGES PAGE =================== -->
  <div class="page" id="page-devmessages">
    <div class="page-header">
      <h1><i class="fas fa-inbox" style="color:var(--blue)"></i> \u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646 \u0627\u0644\u0648\u0627\u0631\u062f\u0629</h1>
      <p>\u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u062a\u064a \u0623\u0631\u0633\u0644\u0647\u0627 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646 \u0628\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0627\u0644\u0623\u0645\u0631 <code>.msgtodev</code> \u0648\u064a\u0645\u0643\u0646\u0643 \u0627\u0644\u0631\u062f \u0639\u0644\u064a\u0647\u0627 \u0645\u0628\u0627\u0634\u0631\u0629</p>
    </div>
    <div class="card" style="overflow:hidden; padding:0;">
      <!-- Top bar: title + actions -->
      <div class="card-header" style="justify-content:space-between; padding:12px 16px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="card-icon blue"><i class="fas fa-envelope-open-text"></i></div>
          <div class="card-title">\u0635\u0646\u062f\u0648\u0642 \u0627\u0644\u0648\u0627\u0631\u062f <span id="devmsg-count" style="font-size:12px;color:var(--text-muted);font-weight:400;"></span></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <!-- Filter buttons -->
          <div style="display:flex;background:var(--bg);padding:3px;border-radius:8px;border:1px solid var(--border);gap:3px;">
            <button id="devmsg-filter-all" onclick="setDevMsgFilter('all')" style="padding:5px 13px;font-size:11px;font-family:Cairo,sans-serif;font-weight:700;border:none;border-radius:6px;cursor:pointer;background:linear-gradient(135deg, var(--accent), var(--blue));color:white;transition:all 0.2s;">\u0627\u0644\u0643\u0644</button>
            <button id="devmsg-filter-unanswered" onclick="setDevMsgFilter('unanswered')" style="padding:5px 13px;font-size:11px;font-family:Cairo,sans-serif;font-weight:700;border:none;border-radius:6px;cursor:pointer;background:transparent;color:var(--text-muted);transition:all 0.2s;">\u063a\u064a\u0631 \u0645\u064f\u062c\u0627\u0628</button>
          </div>
          <button class="btn btn-secondary" onclick="loadDevMessages()" style="padding:6px 12px;font-size:11px;"><i class="fas fa-sync-alt"></i> \u062a\u062d\u062f\u064a\u062b</button>
          <button class="btn btn-secondary" onclick="clearAllDevMessages()" style="padding:6px 12px;font-size:11px;background:rgba(252,129,129,0.08);color:var(--red);border-color:rgba(252,129,129,0.25);"><i class="fas fa-trash-alt"></i> \u062d\u0630\u0641 \u0627\u0644\u0643\u0644</button>
        </div>
      </div>

      <!-- WhatsApp/Telegram-style split layout -->
      <div style="display:flex; height:620px; min-height:400px; overflow:hidden; border-top:1px solid var(--border);">

        <!-- LEFT SIDEBAR: Chats list -->
        <div style="width:295px; min-width:250px; border-left:1px solid var(--border); display:flex; flex-direction:column; flex-shrink:0; background:var(--card);">
          <!-- Search bar -->
          <div style="padding:10px 12px; border-bottom:1px solid var(--border); background:var(--card);">
            <div style="position:relative;">
              <i class="fas fa-search" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:var(--text-muted); font-size:11px; pointer-events:none;"></i>
              <input id="devmsg-search" type="text" placeholder="\u0627\u0628\u062d\u062b \u0639\u0646 \u0645\u062d\u0627\u062f\u062b\u0629..." oninput="filterChatsList()" style="width:100%; padding:7px 30px 7px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-family:Cairo,sans-serif; font-size:12px; box-sizing:border-box; direction:rtl;" />
            </div>
          </div>
          <!-- Conversation list -->
          <div id="chats-list-container" style="flex:1; overflow-y:auto; direction:rtl; background:var(--card);">
            <div style="text-align:center; padding:40px; color:var(--text-muted);">
              <i class="fas fa-inbox" style="font-size:32px; margin-bottom:12px; display:block; opacity:0.3;"></i>
              \u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u062d\u0627\u062f\u062b\u0627\u062a \u062d\u0627\u0644\u064a\u0627\u064b.
            </div>
          </div>
        </div>

        <!-- RIGHT PANEL: Active conversation -->
        <div id="conversation-container" style="flex:1; display:flex; flex-direction:column; min-width:0; background:var(--bg);">
          <!-- Default placeholder shown before any chat is selected -->
          <div style="flex:1; display:flex; align-items:center; justify-content:center; flex-direction:column; color:var(--text-muted); padding:40px; text-align:center; gap:12px;">
            <i class="fab fa-whatsapp" style="font-size:72px; color:var(--accent); opacity:0.10;"></i>
            <h3 style="margin:0; font-weight:700; font-size:16px; color:var(--text-muted);">\u0627\u062e\u062a\u0631 \u0645\u062d\u0627\u062f\u062b\u0629</h3>
            <p style="font-size:12px; margin:0; opacity:0.5;">\u0627\u0636\u063a\u0637 \u0639\u0644\u0649 \u0623\u064a \u0645\u062d\u0627\u062f\u062b\u0629 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u064a\u0633\u0627\u0631\u0649 \u0644\u0641\u062a\u062d\u0647\u0627 \u0648\u0627\u0644\u0631\u062f \u0639\u0644\u064a\u0647\u0627</p>
          </div>
        </div>

      </div>
    </div>
  </div>

  `;

const before = content.substring(0, startIdx);
const after = content.substring(endIdx);

const newContent = before + newSection + after;
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done! File updated successfully.');
