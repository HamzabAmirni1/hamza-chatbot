
  // =================== AUTHENTICATION INTERCEPTOR ===================
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      if (!args[1]) args[1] = {};
      if (!args[1].headers) args[1].headers = {};
      if (args[1].headers instanceof Headers) {
        args[1].headers.set('Authorization', 'Bearer ' + token);
      } else if (Array.isArray(args[1].headers)) {
        args[1].headers.push(['Authorization', 'Bearer ' + token]);
      } else {
        args[1].headers['Authorization'] = 'Bearer ' + token;
      }
    }
    
    const response = await originalFetch(...args);
    if (response.status === 401 && !args[0].includes('/api/login')) {
      localStorage.removeItem('auth_token');
      document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
      showLoginOverlay();
    }
    return response;
  };

  async function apiFetch(url, opts) {
    const res = await fetch(url, opts);
    return res.json();
  }

  function formatMessageContent(content) {
    if (!content) return '';
    let media = null;
    if (content.startsWith('{') && content.endsWith('}')) {
      try {
        media = JSON.parse(content);
      } catch(e) {}
    }
    
    if (media && media.mediaUrl) {
      let mediaHtml = '';
      if (media.mediaType && media.mediaType.startsWith('image/')) {
        mediaHtml += '<img src="' + media.mediaUrl + '" style="max-width:200px;border-radius:10px;display:block;margin-bottom:5px;" />';
      } else if (media.mediaType && (media.mediaType.startsWith('audio/') || media.mediaType.includes('ogg') || media.ptt)) {
        mediaHtml += '<audio controls src="' + media.mediaUrl + '" style="max-width:240px;display:block;margin-bottom:5px;height:40px;outline:none;"></audio>';
      } else {
        mediaHtml += '<a href="' + media.mediaUrl + '" target="_blank" style="display:flex;align-items:center;gap:6px;color:#38bdf8;text-decoration:underline;margin-bottom:5px;"><i class="fas fa-file"></i> ' + escapeHtml(media.mediaName || 'ملف مرفق') + '</a>';
      }
      if (media.text) {
        mediaHtml += '<div style="direction:rtl;text-align:right;">' + escapeHtml(media.text) + '</div>';
      }
      return mediaHtml;
    }

    // Fallback: check if the string contains a URL ending in .ogg, .mp3, etc.
    if (content.includes('http')) {
      const match = content.match(/https?:\/\/[^\s"'<>]+/);
      if (match && (content.includes('.ogg') || content.includes('.mp3') || content.includes('.wav') || content.includes('.m4a'))) {
        return '<audio controls src="' + match[0] + '" style="max-width:240px;display:block;margin-bottom:5px;height:40px;outline:none;"></audio>';
      }
    }
    
    return escapeHtml(content);
  }

  function showConfirm(msg) {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-confirm-modal');
      const msgEl = document.getElementById('custom-confirm-message');
      const okBtn = document.getElementById('custom-confirm-ok');
      const cancelBtn = document.getElementById('custom-confirm-cancel');
      
      msgEl.innerHTML = msg;
      modal.classList.add('show');
      modal.classList.remove('hide');
      
      function cleanUp() {
        modal.classList.remove('show');
        modal.classList.add('hide');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
      }
      
      function onOk() {
        cleanUp();
        resolve(true);
      }
      
      function onCancel() {
        cleanUp();
        resolve(false);
      }
      
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }


  function showLoginOverlay() {
    document.getElementById('login-overlay').classList.remove('hide');
  }

  function hideLoginOverlay() {
    document.getElementById('login-overlay').classList.add('hide');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const alertEl = document.getElementById('login-alert');
    const btn = document.getElementById('login-btn');
    
    alertEl.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> جاري التحقق...';
    
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('auth_token', data.token);
        document.cookie = "auth_token=" + data.token + "; path=/; max-age=31536000; SameSite=Strict";
        hideLoginOverlay();
        await loadDashboard();
        await loadSettings();
        showToast('تم تسجيل الدخول بنجاح', 'success');
      } else {
        alertEl.style.display = 'block';
        alertEl.className = 'alert alert-error show';
        alertEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة'}`;
      }
    } catch(err) {
      alertEl.style.display = 'block';
      alertEl.className = 'alert alert-error show';
      alertEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> خطأ في الاتصال بالخادم`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> تسجيل الدخول';
    }
  }

  async function handleLogout() {
    if (await showConfirm('هل أنت متأكد من تسجيل الخروج؟')) {
      localStorage.removeItem('auth_token');
      document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
      showLoginOverlay();
      showToast('تم تسجيل الخروج بنجاح', 'info');
    }
  }

  // =================== STATE ===================
  let manageData = null;
  let manageTab = localStorage.getItem('manage_tab') || 'commands';
  let logsInterval = null;
  let allLogs = [];
  const API = ''; // Same origin
  let settingsData = {};
  let countdownInterval;
  let currentPairingNumber = '';
  let isRestoringScroll = true;

  // =================== INIT ===================
  window.onload = async () => {
    updateClock();
    setInterval(updateClock, 1000);

    // ✅ Safety net: force-hide loader after 8 seconds no matter what
    const safetyTimer = setTimeout(() => {
      const ov = document.getElementById('loading-overlay');
      if (ov && !ov.classList.contains('hide')) {
        ov.classList.add('hide');
        console.warn('[Init] Safety timeout: forced loader hide after 8s');
      }
    }, 8000);

    const token = localStorage.getItem('auth_token');
    if (!token) {
      clearTimeout(safetyTimer);
      showLoginOverlay();
      setTimeout(() => {
        const ov = document.getElementById('loading-overlay');
        if (ov) ov.classList.add('hide');
      }, 400);
      return;
    }

    try {
      await loadDashboard();
      await loadSettings();

      const activePage = localStorage.getItem('active_page') || 'dashboard';
      await showPage(activePage, true);

      const scrollTop = localStorage.getItem('scroll_top');
      if (scrollTop) window.scrollTo(0, parseInt(scrollTop));

      setTimeout(() => { isRestoringScroll = false; }, 200);

      window.addEventListener('scroll', () => {
        if (!isRestoringScroll) localStorage.setItem('scroll_top', window.scrollY);
      });

    } catch (err) {
      console.error('[Init] فشل التحميل:', err);
      fetch('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: err ? err.message : 'Unknown',
          stack: err ? err.stack : '',
          url: window.location.href
        })
      }).catch(() => {});
      if (err && (String(err).includes('401') || String(err).includes('Unauthorized'))) {
        localStorage.removeItem('auth_token');
        showLoginOverlay();
      } else {
        showToast('⚠️ فشل تحميل بعض البيانات — أعد تحميل الصفحة', 'error');
      }
    } finally {
      clearTimeout(safetyTimer);
      const ov = document.getElementById('loading-overlay');
      if (ov) ov.classList.add('hide');
    }
  };

  // =================== 🔔 REAL-TIME NOTIFICATIONS (SSE) ===================
  let _msgBadgeCount = 0;

  function clearMsgBadge() {
    _msgBadgeCount = 0;
    const b = document.getElementById('msg-badge');
    if (b) b.style.display = 'none';
  }

  function incrementMsgBadge() {
    _msgBadgeCount++;
    const b = document.getElementById('msg-badge');
    if (b) {
      b.textContent = _msgBadgeCount;
      b.style.display = 'inline-block';
    }
  }

  function playNotifSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch(_) {}
  }

  function showInboxToast(data) {
    playNotifSound();
    incrementMsgBadge();
    const platformIcon = data.platform === 'telegram' ? '✈️' : data.platform === 'facebook' ? '📘' : '📱';
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:99999;
      background:linear-gradient(135deg,#1a1f3e,#2d3268);
      border:1px solid rgba(102,126,234,0.4);border-radius:16px;
      padding:16px 20px;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.5);
      animation:slideInToast 0.4s cubic-bezier(.36,1.6,.5,1) both;
      cursor:pointer;
    `;
    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="font-size:28px;line-height:1;">🔔</div>
        <div style="flex:1;">
          <div style="font-weight:700;color:#e2e8f0;margin-bottom:4px;font-size:14px;">${platformIcon} رسالة جديدة من ${data.senderName || data.sender}</div>
          <div style="color:#a0aec0;font-size:12px;line-height:1.5;">${data.preview || '...'}</div>
          <div style="margin-top:10px;">
            <button onclick="showPage('devmessages'); clearMsgBadge();" style="background:rgba(102,126,234,0.3);border:1px solid rgba(102,126,234,0.5);color:#a5b4fc;padding:5px 12px;border-radius:8px;font-size:12px;cursor:pointer;">📥 فتح الرسائل</button>
          </div>
        </div>
        <div onclick="this.closest('div[style]').remove()" style="color:#718096;font-size:18px;cursor:pointer;padding:2px 4px;">×</div>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.style.animation = 'slideOutToast 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 8000);
  }

  function connectSSE() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const es = new EventSource('/api/notifications/stream');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'new_devmsg') showInboxToast(data);
      } catch(_) {}
    };
    es.onerror = () => { es.close(); setTimeout(connectSSE, 10000); }; // reconnect after 10s
  }

  // Auto-connect SSE once logged in (called from onload after auth check)
  window.addEventListener('DOMContentLoaded', () => setTimeout(connectSSE, 2000));

  function updateClock() {
    const now = new Date();
    document.getElementById('current-time').textContent =
      now.toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // =================== NAVIGATION ===================
  async function showPage(page, isInitialLoad = false) {
    isRestoringScroll = true;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    
    const navEl = document.getElementById('nav-' + page);
    if (navEl) navEl.classList.add('active');

    if (page !== 'manage' || manageTab !== 'monitor') {
      stopLogsPolling();
    }
    if (page !== 'scripts') {
      if (typeof stopScriptLogsPolling === 'function') stopScriptLogsPolling();
    }
    if (page !== 'insta-hunter') {
      if (typeof stopInstaLogsPolling === 'function') stopInstaLogsPolling();
    }
    if (page !== 'activity') {
      stopActivityPolling();
    }
    if (page !== 'devmessages') {
      stopDevMessagesPolling();
    }

    // Save to localStorage
    localStorage.setItem('active_page', page);

    // Call page-specific data loaders and wait for them to finish rendering
    try {
      if (page === 'sessions') await loadSessions();
      else if (page === 'settings') await loadSettings();
      else if (page === 'users') await loadUsers();
      else if (page === 'cmdstats') { await loadCmdStats(); await loadCmdErrors(); }
      else if (page === 'activity') { await loadActivity(); startActivityPolling(); }
      else if (page === 'broadcast') await loadUsers();
      else if (page === 'manage') await loadManagePage();
      else if (page === 'analytics') await loadAnalytics();
      else if (page === 'scripts') await loadScriptsPage();
      else if (page === 'insta-hunter') await loadInstaPage();
      else if (page === 'contacts') await loadContacts();
      else if (page === 'devmessages') await loadDevMessages();
      else if (page === 'profanity') await loadProfanityLogs();
      else if (page === 'banned') await loadBannedUsers();
      else if (page === 'leaderboard') await loadLeaderboard();
      else if (page === 'violations-scanner') await performComprehensiveScan();
    } catch (err) {
      console.error('[showPage Loader Error]:', err);
      fetch('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: err ? err.message : 'Unknown loader error',
          stack: err ? err.stack : '',
          url: window.location.href + ' [Page: ' + page + ']'
        })
      }).catch(() => {});
      showToast('⚠️ خطأ في تحميل بيانات هذه الصفحة', 'error');
    }

    if (!isInitialLoad) {
      window.scrollTo(0, 0);
      localStorage.setItem('scroll_top', 0);
      setTimeout(() => {
        isRestoringScroll = false;
      }, 100);
    }
  }

  async function refreshCurrentPageData() {
    const btn = document.getElementById('btn-refresh-data');
    const oldIconHtml = '<i class="fas fa-sync-alt"></i>';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> جاري التحديث...';
    }
    
    try {
      // Reload global dashboard info
      await loadDashboard();
      
      // Reload current page data
      const activePage = localStorage.getItem('active_page') || 'dashboard';
      if (activePage === 'sessions') await loadSessions();
      else if (activePage === 'settings') await loadSettings();
      else if (activePage === 'users') await loadUsers();
      else if (activePage === 'cmdstats') await loadCmdStats();
      else if (activePage === 'activity') { await loadActivity(); startActivityPolling(); }
      else if (activePage === 'broadcast') await loadUsers();
      else if (activePage === 'manage') await loadManagePage();
      else if (activePage === 'analytics') await loadAnalytics();
      else if (activePage === 'scripts') await loadScriptsPage();
      else if (activePage === 'insta-hunter') await loadInstaPage();
      else if (activePage === 'contacts') await loadContacts();
      else if (activePage === 'devmessages') await loadDevMessages();
      else if (activePage === 'profanity') await loadProfanityLogs();
      else if (activePage === 'ibhaya') { await loadIbhayaWords(); await loadIbhayaLogs(); }
      else if (activePage === 'banned') await loadBannedUsers();
      else if (activePage === 'leaderboard') await loadLeaderboard();
      
      showToast('✅ تم تحديث البيانات بنجاح', 'success');
    } catch (error) {
      console.error('Error refreshing data:', error);
      showToast('❌ حدث خطأ أثناء تحديث البيانات', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldIconHtml + ' تحديث البيانات';
      }
    }
  }

  // =================== DASHBOARD ===================
  async function loadDashboard() {
    try {
      const ctrl = new AbortController();
      const fetchTimeout = setTimeout(() => ctrl.abort(), 7000);
      let res;
      try {
        res = await fetch('/api/status', { signal: ctrl.signal });
      } catch (fetchErr) {
        clearTimeout(fetchTimeout);
        console.warn('[loadDashboard] /api/status timeout or failed:', fetchErr.message);
        return; // Gracefully exit — loader will hide in finally block
      }
      clearTimeout(fetchTimeout);
      const data = await res.json();
      
      // Compute per-platform connection
      const waConnected   = data.sessions?.filter(s => s.connected).length || 0;
      const tgConnected   = data.telegramBots?.filter(b => b.connected).length || 0;
      const fbConnected   = data.facebookPages?.filter(p => p.connected).length || 0;
      const totalConnected = waConnected + tgConnected + fbConnected;
      // Status badge — green if ANY platform is connected
      const anyConnected = totalConnected > 0;
      document.getElementById('global-status-dot').style.background = anyConnected ? 'var(--accent)' : 'var(--red)';
      document.getElementById('global-status-dot').style.boxShadow = anyConnected ? '0 0 8px var(--accent)' : '0 0 8px var(--red)';
      document.getElementById('global-status-text').textContent = anyConnected ? 'متصل بنجاح ✓' : 'غير متصل';

      // Update platform status badges in the sidebar
      const gridEl = document.getElementById('platform-status-grid');
      if (gridEl) {
        gridEl.innerHTML = `
          <div class="platform-status-badge whatsapp ${waConnected > 0 ? '' : 'inactive'}" title="واتساب">
            <i class="fab fa-whatsapp"></i> <span>${waConnected}</span>
          </div>
          <div class="platform-status-badge telegram ${tgConnected > 0 ? '' : 'inactive'}" title="تلغرام">
            <i class="fab fa-telegram"></i> <span>${tgConnected}</span>
          </div>
          <div class="platform-status-badge facebook ${fbConnected > 0 ? '' : 'inactive'}" title="فيسبوك">
            <i class="fab fa-facebook-messenger"></i> <span>${fbConnected}</span>
          </div>
        `;
      }

      // KPI card — total connections across all platforms
      document.getElementById('stat-sessions').textContent = totalConnected;
      // Update card label to show per-platform dots
      const labelEl = document.getElementById('stat-sessions-label');
      if (labelEl) {
        const dotStyle = (color) => `display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin:0 2px;vertical-align:middle;`;
        labelEl.innerHTML =
          `<span style="${dotStyle(waConnected>0?'#25d366':'rgba(255,255,255,0.2)')}"></span> WA&nbsp;
           <span style="${dotStyle(tgConnected>0?'#38bdf8':'rgba(255,255,255,0.2)')}"></span> TG&nbsp;
           <span style="${dotStyle(fbConnected>0?'#0084ff':'rgba(255,255,255,0.2)')}"></span> FB`;
      }

      // Other stats
      document.getElementById('stat-commands').textContent = data.commandCount || '566';
      document.getElementById('stat-apk-limit').textContent = data.apkLimit || 5;

      // Fetch users count
      try {
        const usersRes = await fetch('/api/users');
        const usersData = await usersRes.json();
        if (document.getElementById('stat-users')) {
          document.getElementById('stat-users').textContent = usersData.total || 0;
        }
      } catch (err) {
        console.error('Failed to load user count:', err);
      }

      // Bot info
      const info = data.settings || {};
      const dot = (connected, color) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${connected>0?color:'rgba(255,255,255,0.2)'};margin-left:4px;vertical-align:middle;"></span>`;
      
      document.getElementById('bot-info-list').innerHTML = `
        ${infoRow('<i class="fas fa-robot" style="color:var(--blue);margin-left:6px;width:16px;text-align:center;"></i>', 'اسم البوت', info.botName || '—')}
        ${infoRow('<i class="fas fa-crown" style="color:var(--yellow);margin-left:6px;width:16px;text-align:center;"></i>', 'المطور', info.botOwner || '—')}
        ${infoRow('<i class="fas fa-terminal" style="color:var(--purple);margin-left:6px;width:16px;text-align:center;"></i>', 'البادئة', info.prefix || '.')}
        ${infoRow('<i class="fas fa-cog" style="color:var(--text-muted);margin-left:6px;width:16px;text-align:center;"></i>', 'وضع الأوامر', info.commandMode || '—')}
        ${infoRow('<i class="fas fa-phone" style="color:var(--accent);margin-left:6px;width:16px;text-align:center;"></i>', 'الرقم الرئيسي', info.pairingNumber || '—')}
        ${infoRow('<i class="fab fa-whatsapp" style="color:#25d366;margin-left:6px;width:16px;text-align:center;"></i>' + dot(waConnected,'#25d366'), 'واتساب', waConnected > 0 ? `${waConnected} جلسة نشطة` : '<span style="color:var(--red)">غير متصل</span>')}
        ${infoRow('<i class="fab fa-telegram" style="color:#38bdf8;margin-left:6px;width:16px;text-align:center;"></i>' + dot(tgConnected,'#38bdf8'), 'تليجرام', tgConnected > 0 ? `${tgConnected} بوت نشط` : '<span style="color:var(--red)">غير متصل</span>')}
        ${infoRow('<i class="fab fa-facebook-messenger" style="color:#0084ff;margin-left:6px;width:16px;text-align:center;"></i>' + dot(fbConnected,'#0084ff'), 'فيسبوك', fbConnected > 0 ? `${fbConnected} صفحة مربوطة` : '<span style="color:var(--red)">غير متصل</span>')}
        ${infoRow('<i class="fas fa-globe" style="color:var(--blue);margin-left:6px;width:16px;text-align:center;"></i>', 'المنطقة الزمنية', info.timezone || '—')}
        ${infoRow('<i class="fas fa-code-branch" style="color:var(--text-muted);margin-left:6px;width:16px;text-align:center;"></i>', 'الإصدار', info.version || '—')}
      `;
    } catch (e) {
      document.getElementById('global-status-text').textContent = 'خطأ في الاتصال';
      document.getElementById('global-status-dot').style.background = 'var(--red)';
    }
  }

  function infoRow(icon, label, value) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="color:var(--text-muted);font-size:13px;">${icon} ${label}</span>
      <span style="font-size:13px;font-weight:600;">${value}</span>
    </div>`;
  }

  // =================== SESSIONS ===================
  function switchPairTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-btn-${tab}`).classList.add('active');
    
    document.getElementById('pair-panel-wa').style.display = tab === 'wa' ? 'block' : 'none';
    document.getElementById('pair-panel-tg').style.display = tab === 'tg' ? 'block' : 'none';
    document.getElementById('pair-panel-fb').style.display = tab === 'fb' ? 'block' : 'none';
    
    document.getElementById('pair-instructions-wa').style.display = tab === 'wa' ? 'block' : 'none';
    document.getElementById('pair-instructions-tg').style.display = tab === 'tg' ? 'block' : 'none';
    document.getElementById('pair-instructions-fb').style.display = tab === 'fb' ? 'block' : 'none';
  }

  async function connectTelegramBot() {
    const name = document.getElementById('tg-bot-name').value.trim();
    const token = document.getElementById('tg-bot-token').value.trim();
    const alert = document.getElementById('alert-pairing-tg');
    if (!token) {
      showAlert(alert, 'error', 'الرجاء إدخال مفتاح الوصول (Bot Token)');
      return;
    }
    showAlert(alert, 'info', 'جاري ربط البوت...');
    try {
      const res = await fetch('/api/connect-tg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name })
      });
      const data = await res.json();
      if (data.success) {
        showAlert(alert, 'success', 'تم ربط وتشغيل بوت تليجرام بنجاح!');
        document.getElementById('tg-bot-token').value = '';
        document.getElementById('tg-bot-name').value = '';
        setTimeout(() => showPage('sessions'), 1500);
      } else {
        showAlert(alert, 'error', data.error || 'فشل الربط');
      }
    } catch(e) { showAlert(alert, 'error', 'خطأ في الاتصال'); }
  }

  function toggleFbBypassContainer(val) {
    const container = document.getElementById('fb-bypass-container');
    if (container) {
      container.style.display = (val === 'all' || val === 'facebook') ? 'flex' : 'none';
    }
  }

  async function connectFacebookPage() {
    const name = document.getElementById('fb-page-name').value.trim();
    const pageId = document.getElementById('fb-page-id').value.trim();
    const token = document.getElementById('fb-page-token').value.trim();
    const alert = document.getElementById('alert-pairing-fb');
    if (!pageId || !token) {
      showAlert(alert, 'error', 'الرجاء إدخال معرّف الصفحة ورمز الوصول');
      return;
    }
    showAlert(alert, 'info', 'جاري ربط الصفحة...');
    try {
      const res = await fetch('/api/connect-fb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, pageId })
      });
      const data = await res.json();
      if (data.success) {
        showAlert(alert, 'success', 'تم ربط صفحة الفيسبوك بنجاح!');
        document.getElementById('fb-page-token').value = '';
        document.getElementById('fb-page-id').value = '';
        document.getElementById('fb-page-name').value = '';
        setTimeout(() => showPage('sessions'), 1500);
      } else {
        showAlert(alert, 'error', data.error || 'فشل الربط');
      }
    } catch(e) { showAlert(alert, 'error', 'خطأ في الاتصال'); }
  }

  async function deleteBotConfig(id) {
    if (!await showConfirm('هل أنت متأكد من حذف هذا البوت/الصفحة؟')) return;
    try {
      const res = await fetch(`/api/delete-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        showToast('تم حذف البوت بنجاح', 'success');
        loadSessions();
      } else showToast(data.error || 'فشل الحذف', 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
  }

  async function deleteWASession(phone) {
    if (!await showConfirm('هل أنت متأكد من حذف هذه الجلسة؟ سيتم قطع الاتصال بالكامل.')) return;
    try {
      const res = await fetch('/api/delete-wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.success) {
        showToast('تم حذف الجلسة', 'success');
        loadSessions();
      } else showToast('فشل حذف الجلسة', 'error');
    } catch(e) { showToast('خطأ في الاتصال', 'error'); }
  }

  async function reconnectWASession(phone) {
    showToast('⏳ جاري إعادة الاتصال وطلب كود الإقران...', 'info');
    try {
      const res = await fetch('/api/reconnect-wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.success && data.code) {
        // Show pairing code in a nice popup modal
        const modal = document.createElement('div');
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:99999;`;
        let secs = 120;
        modal.innerHTML = `
          <div style="background:var(--sidebar-bg);border:1px solid var(--border);border-radius:20px;padding:32px 40px;text-align:center;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.5);">
            <div style="font-size:40px;margin-bottom:12px;">📱</div>
            <h3 style="margin:0 0 8px;font-family:Cairo,sans-serif;color:var(--text);">كود الإقران</h3>
            <p style="color:var(--text-muted);font-size:13px;margin:0 0 20px;font-family:Cairo,sans-serif;">افتح واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز ← أدخل الكود يدوياً</p>
            <div id="rc-code" style="font-size:32px;font-weight:900;letter-spacing:6px;color:var(--green);font-family:monospace;background:rgba(37,211,102,.1);padding:14px 24px;border-radius:12px;margin-bottom:12px;">${data.code}</div>
            <div id="rc-timer" style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">⏱️ ينتهي خلال ${secs} ثانية</div>
            <button onclick="this.closest('[style*=fixed]').remove()" style="background:var(--card-bg);border:1px solid var(--border);color:var(--text);padding:10px 28px;border-radius:10px;cursor:pointer;font-family:Cairo,sans-serif;font-size:14px;">إغلاق</button>
          </div>`;
        document.body.appendChild(modal);
        const interval = setInterval(() => {
          secs--;
          const t = modal.querySelector('#rc-timer');
          if (t) t.textContent = `⏱️ ينتهي خلال ${secs} ثانية`;
          if (secs <= 0) { clearInterval(interval); modal.remove(); loadSessions(); }
        }, 1000);
      } else {
        showToast(data.error || 'فشل في الحصول على كود الإقران. حاول مرة أخرى.', 'error');
      }
    } catch(e) {
      showToast('خطأ في الاتصال بالسيرفر', 'error');
    }
    loadSessions();
  }

  async function togglePauseBot(platform, id) {
    try {
      const res = await fetch('/api/bots/toggle-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, id })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.isPaused ? '⏸️ تم إيقاف البوت مؤقتاً' : '▶️ تم تشغيل البوت بنجاح', 'success');
        loadSessions();
      } else {
        showToast(data.error || 'فشل تغيير حالة البوت', 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال بالسيرفر', 'error');
    }
  }

  async function loadSessions() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      const sessions = data.sessions || [];
      const tgBots = data.telegramBots || [];
      const fbPages = data.facebookPages || [];
      
      let html = '';
      
      // 1. WhatsApp Sessions
      html += `<h3 style="margin-top: 0; margin-bottom: 12px; font-size: 15px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;"><i class="fab fa-whatsapp" style="color:#25d366;"></i> جلسات واتساب (${sessions.length})</h3>`;
      if (sessions.length === 0) {
        html += `<div style="text-align:center;padding:20px;color:var(--text-muted);background:var(--card-bg);border:1px solid var(--border);border-radius:12px;margin-bottom:20px;">لا توجد جلسات واتساب متصلة</div>`;
      } else {
        html += `<div style="display:grid;gap:12px;margin-bottom:24px;">` + sessions.map(s => `
          <div class="session-card" style="${s.paused ? 'opacity: 0.75;' : ''}">
            <div class="session-avatar" style="background:linear-gradient(135deg,#25d366,#128c7e);"><i class="fab fa-whatsapp"></i></div>
            <div class="session-info">
              <div class="session-number">+${s.number || s.path || 'غير معروف'}</div>
              <div class="session-status ${s.connected ? 'connected' : 'disconnected'}">
                ${s.paused ? '<span style="color:var(--red);">موقوف مؤقتاً ⏸️</span>' : (s.connected ? 'متصل ✅' : 'غير متصل ❌')}
                ${s.jid ? ' — ' + s.jid : ''}
              </div>
            </div>
            <div class="session-actions">
              <span class="chip ${s.paused ? 'chip-red' : (s.connected ? 'chip-green' : 'chip-red')}">${s.paused ? 'موقوف' : (s.connected ? 'نشط' : 'منفصل')}</span>
              <button class="btn" style="padding:7px 12px;font-size:12px;background:linear-gradient(135deg,${s.paused ? '#10b981,#059669' : '#f59e0b,#d97706'});color:white;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onclick="togglePauseBot('whatsapp', '${s.number || s.path}')" title="${s.paused ? 'تشغيل' : 'إيقاف مؤقت'}">
                <i class="fas ${s.paused ? 'fa-play' : 'fa-pause'}"></i>
              </button>
              ${!s.connected ? `<button class="btn" style="padding:7px 12px;font-size:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onclick="reconnectWASession('${s.number || s.path}')" title="إعادة الاتصال"><i class="fas fa-sync-alt"></i></button>` : ''}
              <button class="btn btn-danger" style="padding:7px 12px;font-size:12px;display:flex;align-items:center;justify-content:center;" onclick="deleteWASession('${s.number || s.path}')" title="حذف الجلسة"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        `).join('') + `</div>`;
      }

      // 2. Telegram Bots
      html += `<h3 style="margin-bottom: 12px; font-size: 15px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;"><i class="fab fa-telegram-plane" style="color:#38bdf8;"></i> بوتات تليجرام (${tgBots.length})</h3>`;
      if (tgBots.length === 0) {
        html += `<div style="text-align:center;padding:20px;color:var(--text-muted);background:var(--card-bg);border:1px solid var(--border);border-radius:12px;margin-bottom:20px;">لا توجد بوتات تليجرام متصلة</div>`;
      } else {
        html += `<div style="display:grid;gap:12px;margin-bottom:24px;">` + tgBots.map(b => {
          const shortToken = b.token ? b.token.substring(0, 10) + '…' : '—';
          return `
          <div class="session-card" style="${b.paused ? 'opacity: 0.75;' : ''}">
            <div class="session-avatar" style="background:linear-gradient(135deg,#38bdf8,#0284c7);"><i class="fab fa-telegram-plane"></i></div>
            <div class="session-info">
              <div class="session-number">${b.name || 'Telegram Bot'}</div>
              <div class="session-status ${b.connected ? 'connected' : 'disconnected'}">
                ${b.paused ? '<span style="color:var(--red);">موقوف مؤقتاً ⏸️</span>' : (b.connected ? 'متصل ✅' : 'غير متصل ❌')} · ${shortToken}
              </div>
            </div>
            <div class="session-actions">
              <span class="chip ${b.paused ? 'chip-red' : (b.connected ? 'chip-green' : 'chip-red')}">${b.paused ? 'موقوف' : (b.connected ? 'نشط' : 'غير نشط')}</span>
              <button class="btn" style="padding:7px 12px;font-size:12px;background:linear-gradient(135deg,${b.paused ? '#10b981,#059669' : '#f59e0b,#d97706'});color:white;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onclick="togglePauseBot('telegram', '${b.id}')" title="${b.paused ? 'تشغيل' : 'إيقاف مؤقت'}">
                <i class="fas ${b.paused ? 'fa-play' : 'fa-pause'}"></i>
              </button>
              ${b.id.startsWith('local') ? '' : `<button class="btn btn-danger" style="padding:7px 12px;font-size:12px;display:flex;align-items:center;justify-content:center;" onclick="deleteBotConfig('${b.id}')" title="حذف البوت"><i class="fas fa-trash"></i></button>`}
            </div>
          </div>
        `}).join('') + `</div>`;
      }
      
      // 3. Facebook Pages
      html += `<h3 style="margin-bottom: 12px; font-size: 15px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;"><i class="fab fa-facebook-messenger" style="color:#0084ff;"></i> صفحات فيسبوك (${fbPages.length})</h3>`;
      if (fbPages.length === 0) {
        html += `<div style="text-align:center;padding:20px;color:var(--text-muted);background:var(--card-bg);border:1px solid var(--border);border-radius:12px;margin-bottom:20px;">لا توجد صفحات فيسبوك مرتبطة</div>`;
      } else {
        html += `<div style="display:grid;gap:12px;margin-bottom:24px;">` + fbPages.map(p => `
          <div class="session-card" style="${p.paused ? 'opacity: 0.75;' : ''}">
            <div class="session-avatar" style="background:linear-gradient(135deg,#0084ff,#0044ff);"><i class="fab fa-facebook-messenger"></i></div>
            <div class="session-info">
              <div class="session-number">${p.name || 'Facebook Page'}</div>
              <div class="session-status connected">
                ${p.paused ? '<span style="color:var(--red);">موقوف مؤقتاً ⏸️</span>' : 'مرتبطة ✅'} · ID: ${p.pageId}
              </div>
            </div>
            <div class="session-actions">
              <span class="chip ${p.paused ? 'chip-red' : 'chip-green'}">${p.paused ? 'موقوف' : 'نشط'}</span>
              <button class="btn" style="padding:7px 12px;font-size:12px;background:linear-gradient(135deg,${p.paused ? '#10b981,#059669' : '#f59e0b,#d97706'});color:white;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onclick="togglePauseBot('facebook', '${p.id}')" title="${p.paused ? 'تشغيل' : 'إيقاف مؤقت'}">
                <i class="fas ${p.paused ? 'fa-play' : 'fa-pause'}"></i>
              </button>
              ${p.id.startsWith('local') ? '' : `<button class="btn btn-danger" style="padding:7px 12px;font-size:12px;display:flex;align-items:center;justify-content:center;" onclick="deleteBotConfig('${p.id}')" title="حذف الصفحة"><i class="fas fa-trash"></i></button>`}
            </div>
          </div>
        `).join('') + `</div>`;
      }
      
      document.getElementById('sessions-list').innerHTML = html;
    } catch (e) {
      document.getElementById('sessions-list').innerHTML = `
        <div class="alert alert-error show"><i class="fas fa-exclamation-circle"></i> تعذر تحميل الجلسات</div>`;
    }
  }

  let qrActiveId = null;
  let qrPollInterval = null;

  function switchWAMode(mode) {
    const pairBtn = document.getElementById('wa-mode-pair');
    const qrBtn = document.getElementById('wa-mode-qr');
    const pairContainer = document.getElementById('wa-input-pair-container');
    const qrContainer = document.getElementById('wa-input-qr-container');
    const stepsPair = document.getElementById('wa-steps-pair');
    const stepsQr = document.getElementById('wa-steps-qr');
    const insTitle = document.getElementById('wa-instructions-title');

    if (mode === 'pair') {
      pairBtn.style.background = 'var(--card2)';
      pairBtn.style.color = 'white';
      qrBtn.style.background = 'transparent';
      qrBtn.style.color = 'var(--text-muted)';
      pairContainer.style.display = 'block';
      qrContainer.style.display = 'none';
      stepsPair.style.display = 'block';
      stepsQr.style.display = 'none';
      if (insTitle) insTitle.textContent = 'كيفية الإقران (واتساب)';
    } else {
      qrBtn.style.background = 'var(--card2)';
      qrBtn.style.color = 'white';
      pairBtn.style.background = 'transparent';
      pairBtn.style.color = 'var(--text-muted)';
      pairContainer.style.display = 'none';
      qrContainer.style.display = 'block';
      stepsPair.style.display = 'none';
      stepsQr.style.display = 'block';
      if (insTitle) insTitle.textContent = 'كيفية الربط بـ QR (واتساب)';
    }
  }

  async function requestQRCode() {
    const alert = document.getElementById('alert-pairing');
    const btn = document.getElementById('qr-btn');
    const display = document.getElementById('qr-code-display');
    const qrImage = document.getElementById('qr-image');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrStatusText = document.getElementById('qr-status-text');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> جاري الطلب...';
    display.classList.add('visible');
    qrImage.style.display = 'none';
    qrPlaceholder.style.display = 'flex';
    qrPlaceholder.textContent = 'جاري الاتصال بالسيرفر...';
    qrStatusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري بدء الجلسة وتوليد رمز QR...';
    showAlert(alert, 'info', '⏳ جاري بدء جلسة ربط بـ QR code...');

    try {
      const res = await fetch('/api/qr-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (data.success && data.id) {
        qrActiveId = data.id;
        showAlert(alert, 'success', '✅ تم بدء الجلسة! انتظر ظهور رمز QR لمسحه');
        
        let secs = 120;
        const timer = document.getElementById('qr-timer');
        clearInterval(qrPollInterval);
        
        qrPollInterval = setInterval(async () => {
          secs--;
          timer.textContent = `⏱️ ينتهي الطلب خلال ${secs} ثانية`;
          if (secs <= 0) {
            clearInterval(qrPollInterval);
            timer.textContent = '❌ انتهت صلاحية الطلب - أعد المحاولة';
            cancelQRRequest();
            return;
          }

          try {
            const statusRes = await fetch(`/api/qr-status?id=${qrActiveId}`);
            const statusData = await statusRes.json();

            if (statusData.success) {
              if (statusData.status === 'qr' && statusData.qr) {
                qrPlaceholder.style.display = 'none';
                qrImage.src = statusData.qr.startsWith('data:') ? statusData.qr : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=10&data=${encodeURIComponent(statusData.qr)}`;
                qrImage.style.display = 'block';
                qrStatusText.innerHTML = '<i class="fas fa-qrcode"></i> رمز QR جاهز! امسحه بكاميرا واتساب';
              } else if (statusData.status === 'connected') {
                clearInterval(qrPollInterval);
                showAlert(alert, 'success', `🎉 تم ربط واتساب بنجاح! رقم الحساب: +${statusData.phone}`);
                qrStatusText.innerHTML = '<i class="fas fa-check-circle" style="color:var(--accent);"></i> تم الاتصال بنجاح!';
                qrPlaceholder.style.display = 'flex';
                qrPlaceholder.textContent = '✅ متصل!';
                qrImage.style.display = 'none';
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-qrcode"></i> توليد رمز QR للربط';
                setTimeout(() => {
                  display.classList.remove('visible');
                  showPage('sessions');
                }, 2000);
              } else if (statusData.status === 'waiting') {
                qrStatusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري توليد رمز QR على السيرفر...';
              } else if (statusData.status === 'closed') {
                clearInterval(qrPollInterval);
                showAlert(alert, 'error', '❌ تم إغلاق جلسة الربط');
                cancelQRRequest();
              }
            }
          } catch (e) {
            console.error('Error polling QR status:', e);
          }
        }, 3000);

      } else {
        showAlert(alert, 'error', data.error || 'فشل بدء جلسة QR code');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-qrcode"></i> توليد رمز QR للربط';
        display.classList.remove('visible');
      }
    } catch (e) {
      showAlert(alert, 'error', 'خطأ في الاتصال بالسيرفر');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-qrcode"></i> توليد رمز QR للربط';
      display.classList.remove('visible');
    }
  }

  async function cancelQRRequest() {
    clearInterval(qrPollInterval);
    const alert = document.getElementById('alert-pairing');
    const btn = document.getElementById('qr-btn');
    const display = document.getElementById('qr-code-display');

    if (qrActiveId) {
      try {
        await fetch('/api/qr-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: qrActiveId })
        });
      } catch (e) { console.error(e); }
      qrActiveId = null;
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-qrcode"></i> توليد رمز QR للربط';
    display.classList.remove('visible');
    showAlert(alert, 'info', 'تم إلغاء طلب QR Code بنجاح');
  }

  // =================== PAIRING CODE ===================
  async function requestPairingCode() {
    const num = document.getElementById('pairing-number').value.trim().replace(/[^0-9]/g, '');
    const alert = document.getElementById('alert-pairing');
    const btn = document.getElementById('pairing-btn');
    const display = document.getElementById('pairing-code-display');

    if (!num || num.length < 10) {
      showAlert(alert, 'error', 'أدخل رقماً صحيحاً مع كود الدولة (على الأقل 10 أرقام)');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> جاري الطلب...';
    display.classList.remove('visible');
    showAlert(alert, 'info', `⏳ جاري طلب كود الإقران للرقم ${num}...`);
    currentPairingNumber = num;

    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: num })
      });
      const data = await res.json();

      if (data.success && data.code) {
        showAlert(alert, 'success', '✅ تم إنشاء الكود بنجاح! أدخله في واتساب خلال دقيقتين');
        document.getElementById('code-value').textContent = data.code;
        display.classList.add('visible');

        // Countdown
        let secs = 120;
        const timer = document.getElementById('code-timer');
        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
          secs--;
          timer.textContent = `⏱️ ينتهي الكود خلال ${secs} ثانية`;
          if (secs <= 0) {
            clearInterval(countdownInterval);
            timer.textContent = '❌ انتهت صلاحية الكود - أعد الطلب';
            display.classList.remove('visible');
          }
        }, 1000);
      } else {
        showAlert(alert, 'error', data.error || 'فشل في طلب الكود. تأكد أن البوت متصل وحاول مرة أخرى.');
      }
    } catch (e) {
      showAlert(alert, 'error', 'خطأ في الاتصال بالسيرفر. تأكد أن البوت يعمل.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-key"></i> طلب كود الإقران';
    }
  }

  async function cancelPairingRequest() {
    if (!currentPairingNumber) return;
    const alert = document.getElementById('alert-pairing');
    const btn = document.getElementById('cancel-pairing-btn');
    const display = document.getElementById('pairing-code-display');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> جاري الإلغاء...';

    try {
      const res = await fetch('/api/pair-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: currentPairingNumber })
      });
      const data = await res.json();
      if (data.success) {
        clearInterval(countdownInterval);
        display.classList.remove('visible');
        showAlert(alert, 'info', 'ℹ️ تم إلغاء طلب الإقران وتنظيف الجلسة بنجاح.');
        currentPairingNumber = '';
      } else {
        showToast(data.error || 'فشل إلغاء الطلب', 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-times-circle"></i> إلغاء الطلب';
    }
  }

  // =================== SETTINGS ===================
  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      settingsData = data;

      // Basic info
      document.getElementById('s-botName').value = data.botName || '';
      document.getElementById('s-botOwner').value = data.botOwner || '';
      document.getElementById('s-prefix').value = data.prefix || '.';
      document.getElementById('s-commandMode').value = data.commandMode || 'public';
      document.getElementById('s-timezone').value = data.timezone || '';
      document.getElementById('s-pairingNumber').value = data.pairingNumber || '';
      document.getElementById('s-description').value = data.description || '';

      // Toggles
      document.getElementById('s-autoStatusReact').checked = data.AUTO_STATUS_REACT === 'true';
      document.getElementById('s-autoStatusReply').checked = data.AUTO_STATUS_REPLY === 'true';
      document.getElementById('s-autoStatusMsg').value = data.AUTO_STATUS_MSG || '';
      document.getElementById('s-autoRecord').checked = data.AUTORECORD === 'true';
      document.getElementById('s-autoType').checked = data.AUTOTYPE === 'true';
      document.getElementById('s-autoRecordType').checked = data.AUTORECORDTYPE === 'true';
      document.getElementById('s-enableNewsAutoPoster').checked = data.enableNewsAutoPoster === 'true';
      document.getElementById('s-enableChatbot').checked = data.enableChatbot === 'true';
      document.getElementById('s-enableGroupChatbot').checked = data.enableGroupChatbot === 'true';
      document.getElementById('s-enableTrafficBooster').checked = data.enableTrafficBooster === 'true';
      document.getElementById('s-trafficIntervalMinutes').value = data.trafficIntervalMinutes || '5';
      document.getElementById('s-enablePrayerScheduler').checked = data.enablePrayerScheduler !== 'false';
      document.getElementById('s-enableDuasScheduler').checked = data.enableDuasScheduler !== 'false';
      document.getElementById('s-enableRamadanScheduler').checked = data.enableRamadanScheduler !== 'false';
      document.getElementById('s-enableTTS').checked = data.enableTTS === 'true';
      document.getElementById('s-enableGithubAutoPoster').checked = data.enableGithubAutoPoster !== 'false';
      document.getElementById('s-enableAutoDL').checked = data.enableAutoDL !== 'false';
      document.getElementById('s-trafficUrls').value = (data.trafficUrls || []).join('\n');
      document.getElementById('s-duasHours').value = (data.duasHours || [9, 14, 21]).join(', ');

      // Profanity & Ibhaya toggles on their own pages
      const profToggle = document.getElementById('profanity-enabled-toggle');
      const profLabel  = document.getElementById('profanity-status-label');
      if (profToggle) {
        profToggle.checked = data.enableProfanity !== 'false';
        if (profLabel) profLabel.textContent = profToggle.checked ? '🟢 مفعّل' : '🔴 معطَّل';
      }
      const profMonitorToggle = document.getElementById('profanity-monitor-toggle');
      if (profMonitorToggle) profMonitorToggle.checked = data.profanityMonitorOnly === 'true';
      const ibhToggle = document.getElementById('ibhaya-enabled-toggle');
      const ibhLabel  = document.getElementById('ibhaya-status-label');
      if (ibhToggle) {
        ibhToggle.checked = data.enableIbhaya !== 'false';
        if (ibhLabel) ibhLabel.textContent = ibhToggle.checked ? '🟢 مفعّل' : '🔴 معطَّل';
      }
      const ibhMonitorToggle = document.getElementById('ibhaya-monitor-toggle');
      if (ibhMonitorToggle) ibhMonitorToggle.checked = data.ibhayaMonitorOnly === 'true';

      // Stickers & Newsletters
      document.getElementById('s-packname').value = data.packname || '';
      document.getElementById('s-author').value = data.author || '';
      document.getElementById('s-newsletterName').value = data.newsletterName || '';
      document.getElementById('s-newsletterJid').value = data.newsletterJid || '';

      // API Keys & Databases
      document.getElementById('s-giphyApiKey').value = data.giphyApiKey || '';
      document.getElementById('s-hfToken').value = data.hfToken || '';
      document.getElementById('s-openRouterKey').value = data.openRouterKey || '';
      document.getElementById('s-supabaseUrl').value = data.supabaseUrl || '';
      document.getElementById('s-supabaseKey').value = data.supabaseKey || '';
      document.getElementById('s-telegramToken').value = data.telegramToken || '';
      document.getElementById('s-fbPageId').value = data.fbPageId || '';
      document.getElementById('s-fbPageAccessToken').value = data.fbPageAccessToken || '';

      // Social links
      document.getElementById('s-instagram').value = data.instagram || '';
      document.getElementById('s-instagram2').value = data.instagram2 || '';
      document.getElementById('s-instagramChannel').value = data.instagramChannel || '';
      document.getElementById('s-facebook').value = data.facebook || '';
      document.getElementById('s-facebookPage').value = data.facebookPage || '';
      document.getElementById('s-youtube').value = data.youtube || '';
      document.getElementById('s-telegram').value = data.telegram || '';
      document.getElementById('s-officialChannel').value = data.officialChannel || '';
      document.getElementById('s-waGroups').value = data.waGroups || '';
      document.getElementById('s-portfolio').value = data.portfolio || '';

      // APK limit
      document.getElementById('apk-limit-range').value = data.apkLimit || 5;
      document.getElementById('apk-range-value').textContent = data.apkLimit || 5;

      // Owner numbers
      renderNumbersList('owner-numbers-list', data.ownerNumber || [], 'owner');
      renderNumbersList('extra-numbers-list', data.extraNumbers || [], 'extra');

    } catch (e) {
      showToast('خطأ في تحميل الإعدادات', 'error');
    }
  }

  function renderNumbersList(containerId, nums, type) {
    const container = document.getElementById(containerId);
    if (!nums || nums.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">لا توجد أرقام مضافة</p>`;
      return;
    }
    container.innerHTML = nums.map((num, i) => `
      <div class="number-item">
        <div class="number-item-left">
          <div class="number-dot"></div>
          <span style="font-size:14px;font-weight:600;">${num}</span>
        </div>
        <button class="btn btn-danger" style="padding:6px 12px;font-size:12px;" onclick="removeNumber('${type}', ${i})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join('');
  }

  function addOwnerNumber() {
    const input = document.getElementById('new-owner-num');
    const num = input.value.trim().replace(/[^0-9]/g, '');
    if (!num || num.length < 10) { showToast('أدخل رقماً صحيحاً', 'error'); return; }
    if (!settingsData.ownerNumber) settingsData.ownerNumber = [];
    settingsData.ownerNumber.push(num);
    renderNumbersList('owner-numbers-list', settingsData.ownerNumber, 'owner');
    input.value = '';
    showToast('تمت إضافة الرقم', 'success');
  }

  function addExtraNumber() {
    const input = document.getElementById('new-extra-num');
    const num = input.value.trim().replace(/[^0-9]/g, '');
    if (!num || num.length < 10) { showToast('أدخل رقماً صحيحاً', 'error'); return; }
    if (!settingsData.extraNumbers) settingsData.extraNumbers = [];
    settingsData.extraNumbers.push(num);
    renderNumbersList('extra-numbers-list', settingsData.extraNumbers, 'extra');
    input.value = '';
    showToast('تمت إضافة الرقم', 'success');
  }

  function removeNumber(type, index) {
    if (type === 'owner') {
      settingsData.ownerNumber.splice(index, 1);
      renderNumbersList('owner-numbers-list', settingsData.ownerNumber, 'owner');
    } else {
      settingsData.extraNumbers.splice(index, 1);
      renderNumbersList('extra-numbers-list', settingsData.extraNumbers, 'extra');
    }
    showToast('تم حذف الرقم', 'success');
  }

  async function saveSettings() {
    const payload = {
      botName: document.getElementById('s-botName').value,
      botOwner: document.getElementById('s-botOwner').value,
      prefix: document.getElementById('s-prefix').value || '.',
      commandMode: document.getElementById('s-commandMode').value,
      timezone: document.getElementById('s-timezone').value,
      pairingNumber: document.getElementById('s-pairingNumber').value.replace(/[^0-9]/g, ''),
      description: document.getElementById('s-description').value,

      AUTO_STATUS_REACT: document.getElementById('s-autoStatusReact').checked ? 'true' : 'false',
      AUTO_STATUS_REPLY: document.getElementById('s-autoStatusReply').checked ? 'true' : 'false',
      AUTO_STATUS_MSG: document.getElementById('s-autoStatusMsg').value,
      AUTORECORD: document.getElementById('s-autoRecord').checked ? 'true' : 'false',
      AUTOTYPE: document.getElementById('s-autoType').checked ? 'true' : 'false',
      AUTORECORDTYPE: document.getElementById('s-autoRecordType').checked ? 'true' : 'false',
      enableNewsAutoPoster: document.getElementById('s-enableNewsAutoPoster').checked ? 'true' : 'false',
      enableChatbot: document.getElementById('s-enableChatbot').checked ? 'true' : 'false',
      enableGroupChatbot: document.getElementById('s-enableGroupChatbot').checked ? 'true' : 'false',
      enableTrafficBooster: document.getElementById('s-enableTrafficBooster').checked ? 'true' : 'false',
      trafficIntervalMinutes: document.getElementById('s-trafficIntervalMinutes').value || '5',
      enablePrayerScheduler: document.getElementById('s-enablePrayerScheduler').checked ? 'true' : 'false',
      enableDuasScheduler: document.getElementById('s-enableDuasScheduler').checked ? 'true' : 'false',
      enableRamadanScheduler: document.getElementById('s-enableRamadanScheduler').checked ? 'true' : 'false',
      enableTTS: document.getElementById('s-enableTTS').checked ? 'true' : 'false',
      enableGithubAutoPoster: document.getElementById('s-enableGithubAutoPoster').checked ? 'true' : 'false',
      enableAutoDL: document.getElementById('s-enableAutoDL').checked ? 'true' : 'false',
      enableProfanity: (document.getElementById('profanity-enabled-toggle') || {checked:true}).checked ? 'true' : 'false',
      enableIbhaya: (document.getElementById('ibhaya-enabled-toggle') || {checked:true}).checked ? 'true' : 'false',
      profanityMonitorOnly: (document.getElementById('profanity-monitor-toggle') || {checked:false}).checked ? 'true' : 'false',
      ibhayaMonitorOnly: (document.getElementById('ibhaya-monitor-toggle') || {checked:false}).checked ? 'true' : 'false',
      trafficUrls: document.getElementById('s-trafficUrls').value.trim().split('\n').map(u => u.trim()).filter(Boolean),
      duasHours: document.getElementById('s-duasHours').value.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x) && x >= 0 && x <= 23),

      packname: document.getElementById('s-packname').value,
      author: document.getElementById('s-author').value,
      newsletterName: document.getElementById('s-newsletterName').value,
      newsletterJid: document.getElementById('s-newsletterJid').value,

      giphyApiKey: document.getElementById('s-giphyApiKey').value,
      hfToken: document.getElementById('s-hfToken').value,
      openRouterKey: document.getElementById('s-openRouterKey').value,
      supabaseUrl: document.getElementById('s-supabaseUrl').value,
      supabaseKey: document.getElementById('s-supabaseKey').value,
      telegramToken: document.getElementById('s-telegramToken').value,
      fbPageId: document.getElementById('s-fbPageId').value,
      fbPageAccessToken: document.getElementById('s-fbPageAccessToken').value,

      ownerNumber: settingsData.ownerNumber || [],
      extraNumbers: settingsData.extraNumbers || [],
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ تم حفظ الإعدادات بنجاح', 'success');
        showAlert(document.getElementById('settings-alert'), 'success', '✅ تم حفظ الإعدادات بنجاح! أعد تشغيل البوت لتطبيق التغييرات.');
      } else {
        showToast(data.error || 'فشل الحفظ', 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال', 'error');
    }
  }

  async function saveSocialLinks() {
    const payload = {
      instagram: document.getElementById('s-instagram').value,
      instagram2: document.getElementById('s-instagram2').value,
      instagramChannel: document.getElementById('s-instagramChannel').value,
      facebook: document.getElementById('s-facebook').value,
      facebookPage: document.getElementById('s-facebookPage').value,
      youtube: document.getElementById('s-youtube').value,
      telegram: document.getElementById('s-telegram').value,
      officialChannel: document.getElementById('s-officialChannel').value,
      waGroups: document.getElementById('s-waGroups').value,
      portfolio: document.getElementById('s-portfolio').value,
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) showToast('✅ تم حفظ الروابط بنجاح', 'success');
      else showToast(data.error || 'فشل الحفظ', 'error');
    } catch (e) {
      showToast('خطأ في الاتصال', 'error');
    }
  }

  async function saveApkLimit() {
    const limit = parseInt(document.getElementById('apk-limit-range').value);
    try {
      const res = await fetch('/api/apk-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ تم تحديث الحد إلى ${limit} يومياً`, 'success');
        document.getElementById('stat-apk-limit').textContent = limit;
      } else showToast(data.error || 'فشل الحفظ', 'error');
    } catch (e) {
      showToast('خطأ في الاتصال', 'error');
    }
  }

  // =================== CMD LIMITS & RULES FUNCTIONS ===================

  // In-memory working copy of the rules, commands, and users list
  let _cmdRules = { commandLimits: { "ytdl": 5 }, userCommandBans: {}, userDailyLimits: {}, globalUserDailyLimit: 0 };
  let _allCmdsList = [];
  let _autocompleteUsers = [];

  // Global limit slider helper
  function updateGlobalLimitDisplay(val) {
    const v = parseInt(val);
    const display = document.getElementById('global-limit-display');
    const hidden  = document.getElementById('global-daily-limit');
    // 0 = slider at left = unlimited; 100 = slider at right = 100 cmds/day
    // We store 0 in hidden when slider is at 0 (= no limit)
    if (display) display.textContent = v === 0 ? 'بدون حد ∞' : v;
    if (hidden)  hidden.value = v;
  }

  async function loadCmdLimitsPage() {
    // 1. Fetch Rules & Today's Usage
    try {
      const res = await fetch('/api/command-rules');
      const data = await res.json();
      if (data.ok) {
        if (data.rules) {
          _cmdRules = data.rules;
          const gVal = data.rules.globalUserDailyLimit || 0;
          const slider = document.getElementById('global-daily-limit-range');
          if (slider) { slider.value = gVal; updateGlobalLimitDisplay(gVal); }
          renderCmdLimits();
          renderUserBans();
          renderUserLimits();
        }
        
        // Dynamically save all commands
        if (data.commands) {
          _allCmdsList = data.commands;
          populateCommandSelects();
        }

        renderTodayUsage(data.usage);
        updateSummaryCounters();
      }
    } catch (e) { showToast('خطأ في تحميل الإعدادات والحدود', 'error'); }

    // 2. Fetch Users for Search Autocomplete
    try {
      const resUsers = await fetch('/api/users');
      const dataUsers = await resUsers.json();
      if (dataUsers.ok && dataUsers.users) {
        _autocompleteUsers = dataUsers.users;
      }
    } catch (e) { console.error('Error pre-loading users list:', e); }

    // 3. Fetch automated duas settings for this page's card
    try {
      const resSettings = await fetch('/api/settings');
      const dataSettings = await resSettings.json();
      if (dataSettings) {
        const isEnabled = dataSettings.enableDuasScheduler !== 'false';
        const pageToggle = document.getElementById('page-enableDuasScheduler');
        if (pageToggle) pageToggle.checked = isEnabled;
        const pageHours = document.getElementById('page-duasHours');
        if (pageHours) pageHours.value = (dataSettings.duasHours || [9, 14, 21]).join(', ');
      }
    } catch (e) { console.error('Error pre-loading daily duas scheduler settings:', e); }
  }

  async function saveDuasSchedulerPageSettings() {
    try {
      const isEnabled = document.getElementById('page-enableDuasScheduler').checked ? 'true' : 'false';
      const hoursStr = document.getElementById('page-duasHours').value.trim();
      const hours = hoursStr.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x) && x >= 0 && x <= 23);

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enableDuasScheduler: isEnabled,
          duasHours: hours
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ تم حفظ إعدادات الأدعية والأذكار التلقائية بنجاح!', 'success');
        // Synchronize on the main settings page toggle if it exists
        const mainToggle = document.getElementById('s-enableDuasScheduler');
        if (mainToggle) mainToggle.checked = (isEnabled === 'true');
        const mainHours = document.getElementById('s-duasHours');
        if (mainHours) mainHours.value = hours.join(', ');
      } else {
        showToast('❌ فشل حفظ الإعدادات: ' + (data.error || 'خطأ غير معروف'), 'error');
      }
    } catch (e) {
      showToast('❌ خطأ في الاتصال بالخادم', 'error');
    }
  }

  function populateCommandSelects() {
    // Left empty since we transitioned to command autocomplete search input
  }

  // Redesigned: displays user's name, platform icon/badge, and JID/ID cleanly
  function getUserDisplayHtml(jid) {
    if (!jid) return '';
    const user = _autocompleteUsers.find(u => u.id === jid);
    let name = 'مستخدم مجهول';
    let platform = 'whatsapp';
    if (user) {
      name = user.name || 'مستخدم مجهول';
      platform = user.platform || 'whatsapp';
    } else {
      // Guess platform from jid prefix
      if (jid.startsWith('tg:')) {
        platform = 'telegram';
        name = 'تيليغرام: ' + jid.replace('tg:', '');
      } else if (jid.startsWith('fb:')) {
        platform = 'facebook';
        name = 'فيسبوك: ' + jid.replace('fb:', '');
      } else {
        platform = 'whatsapp';
        name = jid;
      }
    }
    
    // Platform icon & badge styling
    let badgeColor = '#10b981';
    let platformIcon = 'fab fa-whatsapp';
    let platformText = 'واتساب';
    if (platform === 'telegram') {
      badgeColor = '#3b82f6';
      platformIcon = 'fab fa-telegram';
      platformText = 'تيليغرام';
    } else if (platform === 'facebook') {
      badgeColor = '#8b5cf6';
      platformIcon = 'fab fa-facebook';
      platformText = 'فيسبوك';
    }

    return `
      <div style="display:flex;align-items:center;gap:10px;text-align:right;">
        <span style="background:rgba(255,255,255,0.04);border:1px solid var(--border);padding:4px 8px;border-radius:12px;font-size:11px;color:${badgeColor};font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">
          <i class="${platformIcon}"></i> ${platformText}
        </span>
        <div style="display:flex;flex-direction:column;align-items:flex-start;">
          <span style="font-size:13px;font-weight:600;color:var(--text);">${name}</span>
          <span style="font-size:10px;color:var(--text-muted);font-family:monospace;margin-top:1px;">${jid}</span>
        </div>
      </div>
    `;
  }

  // Live filter commands search suggestions as user types
  function filterCmdAutocomplete(type) {
    const input = document.getElementById(type + '-cmd-search');
    const list = document.getElementById(type + '-cmd-autocomplete-list');
    const hiddenVal = document.getElementById(type + '-cmd-val');
    
    if (!input || !list) return;
    
    const val = input.value.trim().toLowerCase().replace(/^\./, '');
    
    if (hiddenVal) hiddenVal.value = '';

    // If input is empty, show all commands sorted alphabetically
    let matches = _allCmdsList;
    if (val) {
      matches = _allCmdsList.filter(c => c.toLowerCase().includes(val));
    }
    matches = matches.sort().slice(0, 15); // Cap at 15 matches for a clean layout

    if (!matches.length) {
      list.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--text-muted);text-align:center;">❌ لا توجد أوامر مطابقة</div>`;
      list.classList.remove('hide');
      return;
    }

    list.innerHTML = matches.map(c => {
      return `<div class="autocomplete-item" onclick="selectAutocompleteCmd('${type}', '${c}')" style="padding:8px 12px;">
        <span style="font-family:monospace;font-size:13px;font-weight:600;color:#63b3ed;">.${c}</span>
      </div>`;
    }).join('');
    list.classList.remove('hide');
  }

  function selectAutocompleteCmd(type, cmd) {
    const input = document.getElementById(type + '-cmd-search');
    const list = document.getElementById(type + '-cmd-autocomplete-list');
    const hiddenVal = document.getElementById(type + '-cmd-val');
    
    if (input) input.value = `.${cmd}`;
    if (hiddenVal) hiddenVal.value = cmd;
    if (list) list.classList.add('hide');
  }

  // Live filter users search suggestions as user types
  function filterUserAutocomplete(type) {
    const input = document.getElementById(type + '-user-search');
    const list = document.getElementById(type + '-user-autocomplete-list');
    const hiddenJid = document.getElementById(type + '-user-jid-val');
    
    if (!input || !list) return;
    
    const val = input.value.trim().toLowerCase();
    
    // Clear selection if they edit JID manually
    if (hiddenJid) hiddenJid.value = '';

    // If input is empty, show first 10 users from list
    let matches = _autocompleteUsers;
    if (val) {
      matches = _autocompleteUsers.filter(u => {
        const name = (u.name || '').toLowerCase();
        const jid = (u.id || '').toLowerCase();
        return name.includes(val) || jid.includes(val);
      });
    }
    matches = matches.slice(0, 10); // cap at 10 matches for neat layout

    if (!matches.length) {
      list.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--text-muted);text-align:center;">❌ لم يعثر على مستخدمين</div>`;
      list.classList.remove('hide');
      return;
    }

    list.innerHTML = matches.map(u => {
      // Build platform icon badge
      let platformBadge = '';
      if (u.platform === 'whatsapp') platformBadge = `<i class="fab fa-whatsapp" style="color:#10b981;" title="واتساب"></i>`;
      else if (u.platform === 'telegram') platformBadge = `<i class="fab fa-telegram" style="color:#3b82f6;" title="تيليغرام"></i>`;
      else if (u.platform === 'facebook') platformBadge = `<i class="fab fa-facebook" style="color:#8b5cf6;" title="فيسبوك"></i>`;
      
      const cleanJid = u.id; // full JID/ID
      const displayName = u.name || 'مستخدم مجهول الاسم';

      return `<div class="autocomplete-item" onclick="selectAutocompleteUser('${type}', '${cleanJid}', '${displayName.replace(/'/g, "\\'")}')">
        <div class="autocomplete-user-info">
          <span class="autocomplete-user-name">${displayName}</span>
          <span class="autocomplete-user-id">${cleanJid}</span>
        </div>
        <div>${platformBadge}</div>
      </div>`;
    }).join('');
    list.classList.remove('hide');
  }

  function selectAutocompleteUser(type, jid, name) {
    const input = document.getElementById(type + '-user-search');
    const list = document.getElementById(type + '-user-autocomplete-list');
    const hiddenJid = document.getElementById(type + '-user-jid-val');
    
    if (input) input.value = `${name} (${jid})`;
    if (hiddenJid) hiddenJid.value = jid;
    if (list) list.classList.add('hide');
  }

  // Close suggestions lists when clicking elsewhere
  document.addEventListener('click', function(e) {
    const autocompleteSystems = [
      { input: 'ban-user-search', list: 'ban-user-autocomplete-list' },
      { input: 'ulimit-user-search', list: 'ulimit-user-autocomplete-list' },
      { input: 'new-cmd-search', list: 'new-cmd-autocomplete-list' },
      { input: 'ban-cmd-search', list: 'ban-cmd-autocomplete-list' }
    ];
    
    autocompleteSystems.forEach(sys => {
      const list = document.getElementById(sys.list);
      if (list && !e.target.closest('#' + sys.input) && !e.target.closest('#' + sys.list)) {
        list.classList.add('hide');
      }
    });
  });

  function updateSummaryCounters() {
    const cmdLimCount = Object.keys(_cmdRules.commandLimits || {}).length;
    const userBanCount = Object.entries(_cmdRules.userCommandBans || {}).flatMap(([_, cmds]) => cmds).length;
    const customLimCount = Object.keys(_cmdRules.userDailyLimits || {}).length;

    const el1 = document.getElementById('stat-cmd-limits-cnt');
    const el2 = document.getElementById('stat-user-bans-cnt');
    const el3 = document.getElementById('stat-user-limits-cnt');

    if (el1) el1.textContent = cmdLimCount;
    if (el2) el2.textContent = userBanCount;
    if (el3) el3.textContent = customLimCount;
  }

  function renderCmdLimits() {
    const list = document.getElementById('cmd-limits-list');
    const limits = _cmdRules.commandLimits || {};
    const keys = Object.keys(limits);
    document.getElementById('cmd-limits-count').textContent = keys.length ? `(${keys.length})` : '';
    if (!keys.length) {
      list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;font-size:13px;"><i class="fas fa-terminal" style="font-size:28px;opacity:0.2;display:block;margin-bottom:10px;"></i>لا توجد حدود مضافة حتى الآن</div>';
      return;
    }
    list.innerHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted);text-align:right;">
        <th style="padding:8px 12px;">الأمر</th><th style="padding:8px 12px;">الحد اليومي</th><th style="padding:8px 12px;">إجراء</th>
      </tr></thead><tbody>
      ${keys.map(cmd => `<tr style="border-bottom:1px solid var(--border10);">
        <td style="padding:10px 12px;font-family:monospace;color:#63b3ed;">.${cmd}</td>
        <td style="padding:10px 12px;"><span style="background:rgba(99,179,237,0.12);color:#63b3ed;padding:3px 10px;border-radius:20px;font-weight:700;">${limits[cmd]} / يوم</span></td>
        <td style="padding:10px 12px;"><button onclick="removeCmdLimit('${cmd}')" style="background:rgba(229,62,62,0.12);color:#e53e3e;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-trash"></i></button></td>
      </tr>`).join('')}
      </tbody></table>`;
  }

  function renderUserBans() {
    const list = document.getElementById('user-bans-list');
    const bans = _cmdRules.userCommandBans || {};
    const entries = Object.entries(bans).flatMap(([jid, cmds]) => cmds.map(cmd => ({ jid, cmd })));
    document.getElementById('user-bans-count').textContent = entries.length ? `(${entries.length})` : '';
    if (!entries.length) {
      list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;font-size:13px;"><i class="fas fa-check-circle" style="font-size:28px;opacity:0.2;display:block;margin-bottom:10px;"></i>لا توجد قيود مضافة حتى الآن</div>';
      return;
    }
    list.innerHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted);text-align:right;">
        <th style="padding:8px 12px;">المستخدم</th><th style="padding:8px 12px;">الأمر الممنوع</th><th style="padding:8px 12px;">إجراء</th>
      </tr></thead><tbody>
      ${entries.map(({ jid, cmd }) => `<tr style="border-bottom:1px solid var(--border10);">
        <td style="padding:10px 12px;">${getUserDisplayHtml(jid)}</td>
        <td style="padding:10px 12px;"><span style="background:rgba(229,62,62,0.12);color:#e53e3e;padding:3px 10px;border-radius:20px;font-weight:700;">.${cmd}</span></td>
        <td style="padding:10px 12px;"><button onclick="removeUserBan('${jid}','${cmd}')" style="background:rgba(229,62,62,0.12);color:#e53e3e;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-trash"></i></button></td>
      </tr>`).join('')}
      </tbody></table>`;
  }

  function renderUserLimits() {
    const list = document.getElementById('user-limits-list');
    const limits = _cmdRules.userDailyLimits || {};
    const keys = Object.keys(limits);
    document.getElementById('user-limits-count').textContent = keys.length ? `(${keys.length})` : '';
    if (!keys.length) {
      list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;font-size:13px;"><i class="fas fa-user-check" style="font-size:28px;opacity:0.2;display:block;margin-bottom:10px;"></i>لا توجد حدود مستخدمين مضافة حتى الآن</div>';
      return;
    }
    list.innerHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted);text-align:right;">
        <th style="padding:8px 12px;">المستخدم</th><th style="padding:8px 12px;">الحد اليومي</th><th style="padding:8px 12px;">إجراءات</th>
      </tr></thead><tbody>
      ${keys.map(jid => `<tr style="border-bottom:1px solid var(--border10);">
        <td style="padding:10px 12px;">${getUserDisplayHtml(jid)}</td>
        <td style="padding:10px 12px;"><span style="background:rgba(159,122,234,0.12);color:#9f7aea;padding:3px 10px;border-radius:20px;font-weight:700;">${limits[jid]} / يوم</span></td>
        <td style="padding:10px 12px;display:flex;gap:6px;">
          <button onclick="removeUserLimit('${jid}')" style="background:rgba(229,62,62,0.12);color:#e53e3e;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-trash"></i></button>
          <button onclick="resetUserUsage('${jid}')" style="background:rgba(16,185,129,0.12);color:#10b981;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;" title="إعادة ضبط استخدام اليوم"><i class="fas fa-undo"></i></button>
        </td>
      </tr>`).join('')}
      </tbody></table>`;
  }

  function renderTodayUsage(usage) {
    const list = document.getElementById('today-usage-list');
    if (!list) return;
    if (!usage || !usage.users || !Object.keys(usage.users).length) {
      list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;font-size:13px;"><i class="fas fa-moon" style="font-size:28px;opacity:0.2;display:block;margin-bottom:10px;"></i>لا يوجد استخدام مسجل اليوم بعد</div>';
      return;
    }
    const users = Object.entries(usage.users).sort((a,b) => b[1].total - a[1].total);
    list.innerHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted);text-align:right;">
        <th style="padding:8px 12px;">المستخدم</th><th style="padding:8px 12px;">الإجمالي</th><th style="padding:8px 12px;">تفاصيل الأوامر</th><th style="padding:8px 12px;">إعادة ضبط</th>
      </tr></thead><tbody>
      ${users.map(([jid, info]) => `<tr style="border-bottom:1px solid var(--border10);">
        <td style="padding:10px 12px;">${getUserDisplayHtml(jid)}</td>
        <td style="padding:10px 12px;"><span style="background:rgba(16,185,129,0.12);color:#10b981;padding:3px 10px;border-radius:20px;font-weight:700;">${info.total}</span></td>
        <td style="padding:10px 12px;font-size:12px;">${Object.entries(info.commands || {}).map(([c,n]) => `<span style="background:var(--card);border:1px solid var(--border);padding:2px 8px;border-radius:12px;margin:2px;display:inline-block;">.${c} ×${n}</span>`).join('')}</td>
        <td style="padding:10px 12px;"><button onclick="resetUserUsage('${jid}')" style="background:rgba(229,62,62,0.12);color:#e53e3e;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;"><i class="fas fa-undo"></i></button></td>
      </tr>`).join('')}
      </tbody></table>`;
  }

  function addCmdLimit() {
    let cmd = document.getElementById('new-cmd-val').value;
    if (!cmd) {
      const typed = document.getElementById('new-cmd-search').value.trim();
      cmd = typed.replace(/^\./, '');
    }
    const limit = parseInt(document.getElementById('new-cmd-limit').value);
    if (!cmd) return showToast('يرجى اختيار أو كتابة الأمر أولاً', 'error');
    if (!limit || limit < 1) return showToast('يرجى إدخال حد صحيح أكبر من 0', 'error');
    
    _cmdRules.commandLimits[cmd] = limit;
    document.getElementById('new-cmd-search').value = '';
    document.getElementById('new-cmd-val').value = '';
    document.getElementById('new-cmd-limit').value = '';
    renderCmdLimits();
    updateSummaryCounters();
    saveCmdRules();
  }

  function removeCmdLimit(cmd) {
    delete _cmdRules.commandLimits[cmd];
    renderCmdLimits();
    updateSummaryCounters();
    saveCmdRules();
  }

  function addUserCmdBan() {
    const jid = document.getElementById('ban-user-jid-val').value;
    let cmd = document.getElementById('ban-cmd-val').value;
    if (!cmd) {
      const typed = document.getElementById('ban-cmd-search').value.trim();
      cmd = typed.replace(/^\./, '');
    }
    
    if (!jid) {
      // Fallback to text box content if they typed but didn't click suggestion
      const typed = document.getElementById('ban-user-search').value.trim();
      if (!typed) return showToast('يرجى البحث واختيار المستخدم', 'error');
      // If it contains parenthesized ID, extract it
      const match = typed.match(/\(([^)]+)\)$/);
      const extractedJid = match ? match[1] : typed;
      document.getElementById('ban-user-jid-val').value = extractedJid;
      return addUserCmdBan();
    }
    
    if (!cmd) return showToast('يرجى اختيار أو كتابة الأمر الممنوع', 'error');
    
    if (!_cmdRules.userCommandBans[jid]) _cmdRules.userCommandBans[jid] = [];
    if (!_cmdRules.userCommandBans[jid].includes(cmd)) _cmdRules.userCommandBans[jid].push(cmd);
    
    document.getElementById('ban-user-search').value = '';
    document.getElementById('ban-user-jid-val').value = '';
    document.getElementById('ban-cmd-search').value = '';
    document.getElementById('ban-cmd-val').value = '';
    
    renderUserBans();
    updateSummaryCounters();
    saveCmdRules();
  }

  function removeUserBan(jid, cmd) {
    if (_cmdRules.userCommandBans[jid]) {
      _cmdRules.userCommandBans[jid] = _cmdRules.userCommandBans[jid].filter(c => c !== cmd);
      if (!_cmdRules.userCommandBans[jid].length) delete _cmdRules.userCommandBans[jid];
    }
    renderUserBans();
    updateSummaryCounters();
    saveCmdRules();
  }

  function addUserDailyLimit() {
    const jid = document.getElementById('ulimit-jid-val').value;
    const limit = parseInt(document.getElementById('ulimit-value').value);
    
    if (!jid) {
      // Fallback
      const typed = document.getElementById('ulimit-user-search').value.trim();
      if (!typed) return showToast('يرجى البحث واختيار المستخدم', 'error');
      const match = typed.match(/\(([^)]+)\)$/);
      const extractedJid = match ? match[1] : typed;
      document.getElementById('ulimit-jid-val').value = extractedJid;
      return addUserDailyLimit();
    }
    
    if (isNaN(limit) || limit < 0) return showToast('يرجى إدخال قيمة صحيحة (0 أو أكثر)', 'error');
    
    _cmdRules.userDailyLimits[jid] = limit;
    document.getElementById('ulimit-user-search').value = '';
    document.getElementById('ulimit-jid-val').value = '';
    document.getElementById('ulimit-value').value = '';
    
    renderUserLimits();
    updateSummaryCounters();
    saveCmdRules();
  }

  function removeUserLimit(jid) {
    delete _cmdRules.userDailyLimits[jid];
    renderUserLimits();
    updateSummaryCounters();
    saveCmdRules();
  }

  async function resetUserUsage(jid) {
    try {
      const res = await fetch('/api/command-rules/reset-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid })
      });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم ضبط استخدام هذا المستخدم', 'success'); await loadCmdLimitsPage(); }
      else showToast('❌ فشل: ' + data.error, 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
  }

  async function resetAllUsage() {
    if (!await showConfirm('إعادة ضبط استخدام جميع المستخدمين اليوم؟')) return;
    try {
      const res = await fetch('/api/command-rules/reset-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم ضبط استخدام الجميع', 'success'); await loadCmdLimitsPage(); }
      else showToast('❌ فشل: ' + data.error, 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
  }

  async function saveCmdRules() {
    _cmdRules.globalUserDailyLimit = parseInt(document.getElementById('global-daily-limit')?.value) || 0;
    try {
      const res = await fetch('/api/command-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_cmdRules)
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ تم حفظ الإعدادات بنجاح', 'success');
        updateSummaryCounters();
      }
      else showToast('❌ فشل الحفظ: ' + data.error, 'error');
    } catch (e) { showToast('خطأ في الاتصال', 'error'); }
  }

  async function confirmRestart() {
    if (await showConfirm('⚠️ هل أنت متأكد من إعادة تشغيل البوت؟ سيتم قطع الاتصال مؤقتاً.')) {
      fetch('/api/restart', { method: 'POST' })
        .then(() => showToast('🔄 جاري إعادة التشغيل...', 'success'))
        .catch(() => showToast('خطأ في الاتصال', 'error'));
    }
  }

  // =================== USERS ===================
  let _allUsers = [];
  let _bannedList = [];
  let _currentPlatformFilter = 'all';


  // =================== SUBSCRIBERS PAGE ===================
  let _subscribersData = [];
  let _bsmUsers = [];
  let _bsmPlatform = '';

  async function loadSubscribers() {
    const container = document.getElementById('subscribers-container');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1;"><i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:10px;display:block;"></i>جاري تحميل البيانات...</div>`;
    try {
      const res = await fetch('/api/bot-subscribers');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      _subscribersData = data.bots || [];

      // Update stats totals
      document.getElementById('sub-total-bots').textContent = _subscribersData.length;
      let waCount = 0, tgCount = 0, fbCount = 0;
      _subscribersData.forEach(b => {
        if (b.platform === 'whatsapp') waCount += b.userCount;
        else if (b.platform === 'telegram') tgCount += b.userCount;
        else if (b.platform === 'facebook') fbCount += b.userCount;
      });
      document.getElementById('sub-wa-users').textContent = waCount;
      document.getElementById('sub-tg-users').textContent = tgCount;
      document.getElementById('sub-fb-users').textContent = fbCount;

      renderSubscribers();
    } catch(e) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--red);grid-column:1/-1;">⚠️ خطأ في تحميل البيانات: ${e.message}</div>`;
    }
  }

  function renderSubscribers() {
    const container = document.getElementById('subscribers-container');
    if (!container) return;

    if (!_subscribersData.length) {
      container.innerHTML = `<div style="text-align:center;padding:50px;color:var(--text-muted);grid-column:1/-1;"><i class="fas fa-robot" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.3;"></i>لا يوجد بوتات متصلة</div>`;
      return;
    }

    const platformIcons = { whatsapp: 'fab fa-whatsapp', telegram: 'fab fa-telegram-plane', facebook: 'fab fa-facebook-messenger' };
    const platformColors = { whatsapp: '#25d366', telegram: '#38bdf8', facebook: '#0084ff' };
    const platformBg = { whatsapp: 'rgba(37,211,102,0.08)', telegram: 'rgba(56,189,248,0.08)', facebook: 'rgba(0,132,255,0.08)' };
    const platformBorder = { whatsapp: 'rgba(37,211,102,0.2)', telegram: 'rgba(56,189,248,0.2)', facebook: 'rgba(0,132,255,0.2)' };

    container.innerHTML = _subscribersData.map(bot => {
      const col = platformColors[bot.platform] || '#a78bfa';
      const bg = platformBg[bot.platform] || 'rgba(167,139,250,0.08)';
      const border = platformBorder[bot.platform] || 'rgba(167,139,250,0.2)';
      const icon = platformIcons[bot.platform] || 'fas fa-robot';
      const cleanSub = bot.platform === 'whatsapp' ? (bot.number ? `+${bot.number}` : 'WhatsApp') : bot.platform === 'telegram' ? 'Telegram' : 'Facebook Page';

      return `<div class="card" onclick="openBotStatsModal('${bot.platform}', '${bot.name.replace(/'/g, "\\'")}', '${cleanSub}', ${bot.connected})" style="background:${bg};border:1px solid ${border};border-radius:16px;padding:20px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:14px;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 16px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
        <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,${col},${col}88);display:flex;align-items:center;justify-content:center;font-size:22px;color:white;flex-shrink:0;box-shadow:0 4px 10px ${col}33;">
          <i class="${icon}"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${bot.name}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px;display:flex;align-items:center;gap:6px;">
            <span>${cleanSub}</span>
            <span>·</span>
            <span style="color:${bot.connected ? '#25d366' : '#fc8181'};display:flex;align-items:center;gap:3px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${bot.connected ? '#25d366' : '#fc8181'};"></span>
              ${bot.connected ? 'متصل' : 'غير متصل'}
            </span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:22px;font-weight:900;color:${col};line-height:1;">${bot.userCount}</div>
          <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">مستخدم</div>
        </div>
      </div>`;
    }).join('');
  }

  async function openBotStatsModal(platform, name, subText, connected) {
    _bsmPlatform = platform;
    _bsmUsers = [];
    document.getElementById('bsm-search').value = '';

    // Show the details page
    showPage('bot-details');

    // Set initial display
    const iconEl = document.getElementById('bsm-icon');
    const platformColors = { whatsapp: '#25d366', telegram: '#38bdf8', facebook: '#0084ff' };
    const platformIcons = { whatsapp: 'fab fa-whatsapp', telegram: 'fab fa-telegram-plane', facebook: 'fab fa-facebook-messenger' };
    const col = platformColors[platform] || '#a78bfa';
    iconEl.style.background = `linear-gradient(135deg,${col},${col}88)`;
    iconEl.innerHTML = `<i class="${platformIcons[platform] || 'fas fa-robot'}"></i>`;
    
    document.getElementById('bsm-name').textContent = name;
    document.getElementById('bsm-sub').innerHTML = `${subText} &nbsp;·&nbsp; <span style="color:${connected ? '#25d366' : '#fc8181'};"><i class="fas fa-circle" style="font-size:6px;vertical-align:middle;margin-left:3px;"></i>${connected ? 'نشط الآن' : 'غير متصل'}</span>`;

    // Show loading indicators inside page
    document.getElementById('bsm-total').textContent = '—';
    document.getElementById('bsm-24h').textContent = '—';
    document.getElementById('bsm-7d').textContent = '—';
    document.getElementById('bsm-banned').textContent = '—';
    document.getElementById('bsm-chart').innerHTML = `<div style="color:var(--text-muted);font-size:11px;width:100%;text-align:center;padding-top:30px;">جاري جلب إحصائيات النشاط...</div>`;
    document.getElementById('bsm-chart-labels').innerHTML = '';
    document.getElementById('bsm-cmds').innerHTML = `<div style="color:var(--text-muted);font-size:11px;padding:10px;">جاري جلب الأوامر...</div>`;
    document.getElementById('bsm-users').innerHTML = `<div style="color:var(--text-muted);font-size:11px;text-align:center;grid-column:1/-1;padding:40px;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل قائمة المستخدمين...</div>`;

    try {
      const res = await fetch(`/api/bot-stats/${platform}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      // 1. KPIs
      document.getElementById('bsm-total').textContent = data.total;
      document.getElementById('bsm-24h').textContent = data.active24h;
      document.getElementById('bsm-7d').textContent = data.active7d;
      document.getElementById('bsm-banned').textContent = data.banned_count;

      // 2. Activity Chart
      const maxVal = Math.max(...data.dailyActivity.map(x => x.count), 1);
      document.getElementById('bsm-chart').innerHTML = data.dailyActivity.map(day => {
        const heightPct = (day.count / maxVal) * 100;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;" title="مستخدمون نشطون في ${day.label}: ${day.count}">
          <div style="width:8px;background:${col};border-radius:4px 4px 0 0;height:${heightPct}%;min-height:2px;transition:height 0.3s;"></div>
        </div>`;
      }).join('');
      document.getElementById('bsm-chart-labels').innerHTML = data.dailyActivity.map(day => {
        return `<div style="flex:1;font-size:8px;color:var(--text-muted);text-align:center;white-space:nowrap;overflow:hidden;">${day.label}</div>`;
      }).join('');

      // 3. Top Commands
      if (!data.topCommands || data.topCommands.length === 0) {
        document.getElementById('bsm-cmds').innerHTML = `<div style="color:var(--text-muted);font-size:11px;padding:10px;text-align:center;">لا توجد بيانات أوامر مسجلة</div>`;
      } else {
        document.getElementById('bsm-cmds').innerHTML = data.topCommands.map((c, i) => {
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--card);border-radius:6px;font-size:11px;border:1px solid var(--border);">
            <span style="font-family:monospace;font-weight:700;color:var(--text);">${i+1}. ${c.cmd}</span>
            <span style="color:${col};font-weight:900;">${c.count}</span>
          </div>`;
        }).join('');
      }

      // 4. User list
      _bsmUsers = data.recentUsers || [];
      renderBsmUsers();

    } catch (e) {
      console.error(e);
      document.getElementById('bsm-users').innerHTML = `<div style="color:var(--red);font-size:11px;text-align:center;grid-column:1/-1;padding:40px;">⚠️ فشل تحميل الإحصائيات: ${e.message}</div>`;
    }
  }

  function renderBsmUsers() {
    const container = document.getElementById('bsm-users');
    if (!container) return;
    const q = (document.getElementById('bsm-search').value || '').toLowerCase().trim();

    const filtered = _bsmUsers.filter(u => {
      return (u.name || '').toLowerCase().includes(q) || (u.id || '').toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="text-align:center;grid-column:1/-1;padding:30px;color:var(--text-muted);font-size:11px;">لا يوجد مستخدمون يطابقون البحث</div>`;
      return;
    }

    const platformColors = { whatsapp: '#25d366', telegram: '#38bdf8', facebook: '#0084ff' };
    const platformBg = { whatsapp: 'rgba(37,211,102,0.07)', telegram: 'rgba(56,189,248,0.07)', facebook: 'rgba(0,132,255,0.07)' };
    const platformBorder = { whatsapp: 'rgba(37,211,102,0.2)', telegram: 'rgba(56,189,248,0.2)', facebook: 'rgba(0,132,255,0.2)' };
    const col = platformColors[_bsmPlatform] || '#a78bfa';
    const bg = platformBg[_bsmPlatform] || 'rgba(167,139,250,0.07)';
    const border = platformBorder[_bsmPlatform] || 'rgba(167,139,250,0.2)';

    container.innerHTML = filtered.map(u => {
      const displayName = u.name || (_bsmPlatform === 'whatsapp' ? `+${u.id}` : u.id);
      const initials = (u.name || u.id || '?').charAt(0).toUpperCase();
      const lastSeen = u.lastSeen ? new Date(u.lastSeen).toLocaleDateString('ar-MA') : '—';
      const isBanned = u.banned;

      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:var(--bg);border:1px solid var(--border);transition:all 0.2s;">
        <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,${col},${col}88);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayName}${isBanned ? ' <span style="color:#fc8181;font-size:9px;">(محظور)</span>' : ''}</div>
          <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">آخر ظهور: ${lastSeen}</div>
        </div>
        <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;">
          <button onclick="openDirectMessageModal('${u.id}','${_bsmPlatform}','${displayName.replace(/'/g,"\\'")}'); event.stopPropagation();" style="width:26px;height:26px;border-radius:50%;background:${bg};border:1px solid ${border};color:${col};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;" title="إرسال رسالة"><i class="fas fa-paper-plane"></i></button>
          ${!isBanned
            ? `<button onclick="quickBan('${u.id}','${_bsmPlatform}'); setTimeout(() => openBotStatsModal('${_bsmPlatform}','${document.getElementById('bsm-name').textContent}','',true), 500);" style="width:26px;height:26px;border-radius:50%;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;" title="حظر"><i class="fas fa-ban"></i></button>`
            : `<button onclick="quickUnban('${u.id}','${_bsmPlatform}'); setTimeout(() => openBotStatsModal('${_bsmPlatform}','${document.getElementById('bsm-name').textContent}','',true), 500);" style="width:26px;height:26px;border-radius:50%;background:rgba(37,211,102,0.06);border:1px solid rgba(37,211,102,0.15);color:#25d366;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;" title="رفع الحظر"><i class="fas fa-unlock"></i></button>`}
        </div>
      </div>`;
    }).join('');
  }

  function filterBsmUsers() {
    renderBsmUsers();
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      document.getElementById('u-total').textContent = data.total || 0;
      document.getElementById('u-active').textContent = data.activeCount || 0;
      document.getElementById('u-banned').textContent = (data.banned || []).length;
      const langs = [...new Set((data.users || []).map(u => u.language).filter(Boolean))];
      document.getElementById('u-langs').textContent = langs.length || 1;
      
      // Update broadcast page platform counts
      if(document.getElementById('broadcast-total')) document.getElementById('broadcast-total').textContent = data.total || 0;
      if(document.getElementById('broadcast-wa')) document.getElementById('broadcast-wa').textContent = data.waCount || 0;
      if(document.getElementById('broadcast-tg')) document.getElementById('broadcast-tg').textContent = data.tgCount || 0;
      if(document.getElementById('broadcast-fb')) document.getElementById('broadcast-fb').textContent = data.fbCount || 0;
      
      // Banned list
      const bannedList = document.getElementById('banned-list');
      if (!data.banned || data.banned.length === 0) {
        bannedList.innerHTML = `<p style="color:var(--accent);font-size:13px;text-align:center;padding:16px;">✅ لا يوجد مستخدمون محظورون</p>`;
      } else {
        bannedList.innerHTML = data.banned.map(jid => {
          let platform = 'whatsapp';
          let displayId = jid.split('@')[0];
          let prefix = '+';
          if (jid.startsWith('tg:')) {
            platform = 'telegram';
            displayId = jid.replace('tg:', '');
            prefix = 'تليجرام: ';
          } else if (jid.startsWith('fb:')) {
            platform = 'facebook';
            displayId = jid.replace('fb:', '');
            prefix = 'فيسبوك: ';
          }
          return `<div class="number-item"><div class="number-item-left" style="min-width:0;"><div class="number-dot" style="background:var(--red);flex-shrink:0;"></div><span style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${prefix}${displayId}</span></div><button class="btn btn-primary" style="padding:5px 10px;font-size:11px;flex-shrink:0;" onclick="quickUnban('${displayId}', '${platform}')"><i class="fas fa-unlock"></i> رفع</button></div>`;
        }).join('');
      }

      // Save users globally for instant filtering
      _allUsers = data.users || [];
      _bannedList = data.banned || [];

      // Render the users list
      renderFilteredUsers();
    } catch(e) { showToast('خطأ في تحميل المستخدمين', 'error'); }
  }

  function renderFilteredUsers() {
    const usersList = document.getElementById('users-list');
    const filtered = _allUsers.filter(u => {
      if (_currentPlatformFilter === 'all') return true;
      return u.platform === _currentPlatformFilter;
    });

    if (filtered.length === 0) {
      usersList.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">لا يوجد مستخدمون في هذه المنصة</p>`;
      return;
    }

    usersList.innerHTML = `<div style="display:grid;gap:8px;">` + filtered.map(u => {
      const num = (u.id || '').split('@')[0];
      
      let isBanned = false;
      if (u.platform === 'whatsapp') {
        isBanned = _bannedList.includes(u.id) || _bannedList.includes(`${num}@s.whatsapp.net`);
      } else if (u.platform === 'telegram') {
        isBanned = _bannedList.includes(`tg:${num}`);
      } else if (u.platform === 'facebook') {
        isBanned = _bannedList.includes(`fb:${num}`);
      }
      
      const lastSeen = u.lastSeen ? new Date(u.lastSeen).toLocaleDateString('ar-MA') : '—';
      
      let icon = '👤';
      let bg = 'linear-gradient(135deg,var(--accent),var(--blue))';
      let platBadge = '';
      
      if (u.platform === 'whatsapp') {
        icon = '<i class="fab fa-whatsapp"></i>';
        bg = 'linear-gradient(135deg,#25d366,#128c7e)';
        platBadge = `<span class="chip" style="background:rgba(37,211,102,0.1);color:#25d366;font-size:10px;padding:1px 6px;">WhatsApp</span>`;
      } else if (u.platform === 'telegram') {
        icon = '<i class="fab fa-telegram-plane"></i>';
        bg = 'linear-gradient(135deg,#38bdf8,#0284c7)';
        platBadge = `<span class="chip" style="background:rgba(56,189,248,0.1);color:#38bdf8;font-size:10px;padding:1px 6px;">Telegram</span>`;
      } else if (u.platform === 'facebook') {
        icon = '<i class="fab fa-facebook-messenger"></i>';
        bg = 'linear-gradient(135deg,#0084ff,#0044ff)';
        platBadge = `<span class="chip" style="background:rgba(0,132,255,0.1);color:#0084ff;font-size:10px;padding:1px 6px;">Facebook</span>`;
      }

      // Display name is either profile name or ID (phone/user ID)
      const displayName = u.name ? u.name : (u.platform === 'whatsapp' ? `+${num}` : num);
      const subLabel = u.name ? `${u.platform === 'whatsapp' ? '+' : ''}${num}` : '';
      
      return `<div class="number-item">
        <div class="number-item-left" style="min-width:0;">
          <div style="width:36px;height:36px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:14px;color:white;flex-shrink:0;">${icon}</div>
          <div style="min-width:0;flex:1;">
            <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayName} ${platBadge}</div>
            <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subLabel ? subLabel + ' · ' : ''}آخر ظهور: ${lastSeen}${u.language ? ' · ' + u.language : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
          <button class="btn btn-primary" style="padding:5px 10px;font-size:11px;background:rgba(99,179,237,0.1);border:1px solid rgba(99,179,237,0.2);color:var(--blue);" onclick="openDirectMessageModal('${num}', '${u.platform}', '${displayName.replace(/'/g, "\\'")}')" title="إرسال رسالة مباشرة"><i class="fas fa-paper-plane"></i></button>
          ${isBanned ? 
            `<span class="chip chip-red">محظور</span><button class="btn btn-primary" style="padding:5px 10px;font-size:11px;" onclick="quickUnban('${num}', '${u.platform}')" title="رفع الحظر"><i class="fas fa-unlock"></i></button>` : 
            `<span class="chip chip-green">نشط</span><button class="btn btn-danger" style="padding:5px 10px;font-size:11px;" onclick="quickBan('${num}', '${u.platform}')" title="حظر"><i class="fas fa-ban"></i></button>`
          }
          <button class="btn btn-danger" style="padding:5px 10px;font-size:11px;background:rgba(252,129,129,0.1);border:1px solid rgba(252,129,129,0.2);color:var(--red);" onclick="deleteUserSingle('${num}', '${u.platform}')" title="حذف من قاعدة البيانات"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
    }).join('') + `</div>`;
  }

  function filterUsersPlatform(platform) {
    _currentPlatformFilter = platform;
    // Update active tab styling
    document.querySelectorAll('.platform-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-filter-${platform}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    renderFilteredUsers();
  }

  async function refreshUserNames() {
    const btn = document.getElementById('btn-refresh-names');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الجلب...';
    }
    try {
      const res = await fetch('/api/refresh-names', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        let msg = `✅ تم التحديث:`;
        let parts = [];
        if (data.facebook && data.facebook.total > 0) {
          parts.push(`فيسبوك (${data.facebook.fetched} تم جلبهم، ${data.facebook.failed} فشل)`);
        }
        if (data.telegram && data.telegram.total > 0) {
          parts.push(`تليجرام (${data.telegram.fetched} تم جلبهم، ${data.telegram.failed} فشل)`);
        }
        msg += ' ' + (parts.join(' و ') || 'لا توجد بيانات جديدة');
        showToast(msg, 'success');
        // Reload users to show the new names
        await loadUsers();
      } else {
        showToast('❌ فشل في جلب الأسماء: ' + (data.error || ''), 'error');
      }
    } catch(e) {
      showToast('❌ خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-id-badge"></i> جلب الأسماء';
      }
    }
  }

  async function deleteUserSingle(num, platform) {
    if (await showConfirm(`⚠️ هل أنت متأكد من حذف هذا المستخدم (${num}) نهائياً من قاعدة البيانات؟`)) {
      try {
        const res = await fetch('/api/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: num, platform })
        });
        const data = await res.json();
        if (data.ok) {
          showToast('✅ تم حذف المستخدم بنجاح', 'success');
          loadUsers();
        } else {
          showToast(data.error || 'فشل حذف المستخدم', 'error');
        }
      } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر', 'error');
      }
    }
  }

  async function deleteAllUsers() {
    if (await showConfirm('⚠️ هل أنت متأكد تماماً من حذف جميع المستخدمين من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء!')) {
      try {
        const res = await fetch('/api/delete-all-users', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          showToast('✅ تم حذف جميع المستخدمين بنجاح', 'success');
          loadUsers();
        } else {
          showToast(data.error || 'فشل حذف المستخدمين', 'error');
        }
      } catch (e) {
        showToast('خطأ في الاتصال بالسيرفر', 'error');
      }
    }
  }

  async function banUser() {
    const num = document.getElementById('ban-number').value.trim();
    const platform = document.getElementById('ban-platform').value;
    if (!num) { showToast('أدخل رقماً أو معرفاً صحيحاً', 'error'); return; }
    const res = await fetch('/api/ban', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({number:num, platform}) });
    const data = await res.json();
    if (data.ok) { showAlert(document.getElementById('ban-alert'),'success','✅ تم الحظر بنجاح'); loadUsers(); }
    else showAlert(document.getElementById('ban-alert'),'error', data.error || 'فشل');
  }

  async function unbanUser() {
    const num = document.getElementById('ban-number').value.trim();
    const platform = document.getElementById('ban-platform').value;
    if (!num) { showToast('أدخل رقماً أو معرفاً صحيحاً', 'error'); return; }
    const res = await fetch('/api/unban', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({number:num, platform}) });
    const data = await res.json();
    if (data.ok) { showAlert(document.getElementById('ban-alert'),'success','✅ تم رفع الحظر'); loadUsers(); }
    else showAlert(document.getElementById('ban-alert'),'error', data.error || 'فشل');
  }

  async function quickBan(num, platform) {
    if (!await showConfirm(`حظر ${platform === 'whatsapp' ? '+' : ''}${num}؟`)) return;
    const res = await fetch('/api/ban', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({number:num, platform}) });
    const data = await res.json();
    if (data.ok) { showToast('✅ تم الحظر', 'success'); loadUsers(); }
    else showToast(data.error || 'فشل', 'error');
  }

  async function quickUnban(num, platform) {
    const res = await fetch('/api/unban', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({number:num, platform}) });
    const data = await res.json();
    if (data.ok) { showToast('✅ تم رفع الحظر', 'success'); loadUsers(); }
    else showToast(data.error || 'فشل', 'error');
  }

  // =================== MEDIA FILE HELPERS ===================
  // State for DM media
  let _dmMediaFile = null;
  let _dmMediaIsRecorded = false;

  function setDmFileAccept(accept) {
    document.getElementById('dm-media-file').accept = accept;
  }

  function onDmMediaChange(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    _dmMediaFile = file;
    _dmMediaIsRecorded = false;
    showDmMediaPreview(file);
  }

  function showDmMediaPreview(file) {
    const preview = document.getElementById('dm-media-preview');
    const icon = document.getElementById('dm-media-icon');
    const nameEl = document.getElementById('dm-media-name');
    const sizeEl = document.getElementById('dm-media-size');
    preview.style.display = 'block';
    nameEl.textContent = file.name;
    sizeEl.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';

    const oldAudio = document.getElementById('dm-audio-preview-player');
    if (oldAudio) oldAudio.remove();

    if (file.type.startsWith('image/')) {
      icon.className = 'fas fa-image'; icon.style.color = '#38bdf8';
    } else if (file.type.startsWith('audio/')) {
      icon.className = 'fas fa-music'; icon.style.color = '#a78bfa';
      const audioEl = document.createElement('audio');
      audioEl.id = 'dm-audio-preview-player';
      audioEl.controls = true;
      audioEl.src = URL.createObjectURL(file);
      audioEl.style.cssText = 'width:100%; margin-top:8px; height:32px;';
      preview.appendChild(audioEl);
    } else if (file.type.startsWith('video/')) {
      icon.className = 'fas fa-video'; icon.style.color = '#34d399';
    } else {
      icon.className = 'fas fa-file-alt'; icon.style.color = '#fbbf24';
    }
  }

  function clearDmMedia() {
    _dmMediaFile = null;
    _dmMediaIsRecorded = false;
    document.getElementById('dm-media-file').value = '';
    document.getElementById('dm-media-preview').style.display = 'none';
    const oldAudio = document.getElementById('dm-audio-preview-player');
    if (oldAudio) oldAudio.remove();
  }

  // State for broadcast media
  let _broadcastMediaFile = null;
  let _broadcastMediaIsRecorded = false;

  function setBroadcastFileAccept(accept) {
    document.getElementById('broadcast-media-file').accept = accept;
  }

  function onBroadcastMediaChange(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    _broadcastMediaFile = file;
    _broadcastMediaIsRecorded = false;
    showBroadcastMediaPreview(file);
  }

  function showBroadcastMediaPreview(file) {
    const preview = document.getElementById('broadcast-media-preview');
    const icon = document.getElementById('broadcast-media-icon');
    const nameEl = document.getElementById('broadcast-media-name');
    const sizeEl = document.getElementById('broadcast-media-size');
    preview.style.display = 'block';
    nameEl.textContent = file.name;
    sizeEl.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';

    const oldAudio = document.getElementById('broadcast-audio-preview-player');
    if (oldAudio) oldAudio.remove();

    if (file.type.startsWith('image/')) {
      icon.className = 'fas fa-image'; icon.style.color = '#38bdf8';
    } else if (file.type.startsWith('audio/')) {
      icon.className = 'fas fa-music'; icon.style.color = '#a78bfa';
      const audioEl = document.createElement('audio');
      audioEl.id = 'broadcast-audio-preview-player';
      audioEl.controls = true;
      audioEl.src = URL.createObjectURL(file);
      audioEl.style.cssText = 'width:100%; margin-top:8px; height:32px;';
      preview.appendChild(audioEl);
    } else if (file.type.startsWith('video/')) {
      icon.className = 'fas fa-video'; icon.style.color = '#34d399';
    } else {
      icon.className = 'fas fa-file-alt'; icon.style.color = '#fbbf24';
    }
  }

  function clearBroadcastMedia() {
    _broadcastMediaFile = null;
    _broadcastMediaIsRecorded = false;
    document.getElementById('broadcast-media-file').value = '';
    document.getElementById('broadcast-media-preview').style.display = 'none';
    const oldAudio = document.getElementById('broadcast-audio-preview-player');
    if (oldAudio) oldAudio.remove();
  }

  // MediaRecorder Logic for DM
  let _dmRecorder = null;
  let _dmAudioChunks = [];
  let _dmRecordTimer = null;
  let _dmRecordSeconds = 0;

  async function toggleDmRecording() {
    const btn = document.getElementById('dm-mic-btn');
    const label = document.getElementById('dm-mic-label');
    
    if (_dmRecorder && _dmRecorder.state === 'recording') {
      _dmRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _dmAudioChunks = [];
      _dmRecorder = new MediaRecorder(stream);
      
      _dmRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) _dmAudioChunks.push(e.data);
      };

      _dmRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        clearInterval(_dmRecordTimer);
        btn.style.background = 'rgba(239,68,68,0.1)';
        btn.style.color = '#ef4444';
        label.textContent = 'تسجيل صوت';

        const audioBlob = new Blob(_dmAudioChunks, { type: 'audio/ogg; codecs=opus' });
        const audioFile = new File([audioBlob], `voice_note_${Date.now()}.ogg`, { type: 'audio/ogg' });
        _dmMediaFile = audioFile;
        _dmMediaIsRecorded = true;
        showDmMediaPreview(audioFile);
        showToast('🎤 تم حفظ التسجيل بنجاح', 'success');
      };

      _dmRecorder.start();
      _dmRecordSeconds = 0;
      btn.style.background = '#ef4444';
      btn.style.color = '#fff';
      label.textContent = '🔴 إيقاف (00:00)';

      _dmRecordTimer = setInterval(() => {
        _dmRecordSeconds++;
        const mins = String(Math.floor(_dmRecordSeconds / 60)).padStart(2, '0');
        const secs = String(_dmRecordSeconds % 60).padStart(2, '0');
        label.textContent = `🔴 إيقاف (${mins}:${secs})`;
      }, 1000);

    } catch (err) {
      console.error('Error starting audio recording:', err);
      showToast('❌ تعذر الوصول للميكروفون', 'error');
    }
  }

  // MediaRecorder Logic for Broadcast
  let _broadcastRecorder = null;
  let _broadcastAudioChunks = [];
  let _broadcastRecordTimer = null;
  let _broadcastRecordSeconds = 0;

  async function toggleBroadcastRecording() {
    const btn = document.getElementById('broadcast-mic-btn');
    const label = document.getElementById('broadcast-mic-label');

    if (_broadcastRecorder && _broadcastRecorder.state === 'recording') {
      _broadcastRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _broadcastAudioChunks = [];
      _broadcastRecorder = new MediaRecorder(stream);

      _broadcastRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) _broadcastAudioChunks.push(e.data);
      };

      _broadcastRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        clearInterval(_broadcastRecordTimer);
        btn.style.background = 'rgba(239,68,68,0.1)';
        btn.style.color = '#ef4444';
        label.textContent = 'تسجيل صوت';

        const audioBlob = new Blob(_broadcastAudioChunks, { type: 'audio/ogg; codecs=opus' });
        const audioFile = new File([audioBlob], `voice_note_${Date.now()}.ogg`, { type: 'audio/ogg' });
        _broadcastMediaFile = audioFile;
        _broadcastMediaIsRecorded = true;
        showBroadcastMediaPreview(audioFile);
        showToast('🎤 تم حفظ التسجيل بنجاح', 'success');
      };

      _broadcastRecorder.start();
      _broadcastRecordSeconds = 0;
      btn.style.background = '#ef4444';
      btn.style.color = '#fff';
      label.textContent = '🔴 إيقاف (00:00)';

      _broadcastRecordTimer = setInterval(() => {
        _broadcastRecordSeconds++;
        const mins = String(Math.floor(_broadcastRecordSeconds / 60)).padStart(2, '0');
        const secs = String(_broadcastRecordSeconds % 60).padStart(2, '0');
        label.textContent = `🔴 إيقاف (${mins}:${secs})`;
      }, 1000);

    } catch (err) {
      console.error('Error starting audio recording:', err);
      showToast('❌ تعذر الوصول للميكروفون', 'error');
    }
  }

  // Convert File to base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Key-value stores for dynamically rendered inline reply boxes in the Inbox
  const _devReplyFiles = {};
  const _devReplyIsRecorded = {};
  const _devReplyRecorders = {};
  const _devReplyRecordTimers = {};

  function updateDevMsgActionBtn(senderJid) {
    const input = document.getElementById('chat-input-text');
    const btn = document.getElementById('chat-send-btn');
    if (!input || !btn) return;
    
    if (_devReplyRecorders[senderJid] && _devReplyRecorders[senderJid].state === 'recording') {
      btn.innerHTML = '<i class="fas fa-stop" style="color: white; font-size: 14px;"></i>';
      btn.style.background = '#ef4444';
      return;
    }
    
    const text = input.value.trim();
    const hasFile = !!_devReplyFiles[senderJid];
    
    if (text.length > 0 || hasFile) {
      btn.innerHTML = '<i class="fas fa-paper-plane" style="color: white; font-size: 14px;"></i>';
      btn.style.background = 'linear-gradient(135deg,var(--accent),var(--blue))';
    } else {
      btn.innerHTML = '<i class="fas fa-microphone" style="color: white; font-size: 14px;"></i>';
      btn.style.background = '#25d366';
    }
  }

  function handleDevMsgActionClick(senderJid) {
    const input = document.getElementById('chat-input-text');
    const text = input ? input.value.trim() : '';
    
    if (_devReplyRecorders[senderJid] && _devReplyRecorders[senderJid].state === 'recording') {
      toggleDevReplyRecording(senderJid);
      return;
    }
    
    if (text.length > 0 || _devReplyFiles[senderJid]) {
      sendConversationReply(senderJid);
    } else {
      toggleDevReplyRecording(senderJid);
    }
  }

  let _devMsgFilter = 'all';

  async function setDevMsgFilter(filter) {
    _devMsgFilter = filter;
    const allBtn = document.getElementById('devmsg-filter-all');
    const unansweredBtn = document.getElementById('devmsg-filter-unanswered');
    if (allBtn && unansweredBtn) {
      if (filter === 'all') {
        allBtn.style.background = 'linear-gradient(135deg, var(--accent), var(--blue))';
        allBtn.style.color = 'white';
        unansweredBtn.style.background = 'transparent';
        unansweredBtn.style.color = 'var(--text-muted)';
      } else {
        allBtn.style.background = 'transparent';
        allBtn.style.color = 'var(--text-muted)';
        unansweredBtn.style.background = 'linear-gradient(135deg, var(--accent), var(--blue))';
        unansweredBtn.style.color = 'white';
      }
    }
    await loadDevMessages();
  }

  function setDevReplyFileAccept(id, accept) {
    const input = document.getElementById(`devreply-media-file-${id}`);
    if (input) input.accept = accept;
  }

  function onDevReplyMediaChange(id, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    _devReplyFiles[id] = file;
    _devReplyIsRecorded[id] = false;
    showDevReplyMediaPreview(id, file);
    updateDevMsgActionBtn(id);
  }

  function showDevReplyMediaPreview(id, file) {
    const preview = document.getElementById(`devreply-media-preview-${id}`);
    const icon = document.getElementById(`devreply-media-icon-${id}`);
    const nameEl = document.getElementById(`devreply-media-name-${id}`);
    const sizeEl = document.getElementById('devreply-media-size-' + id);
    if (!preview) return;
    preview.style.display = 'block';
    nameEl.textContent = file.name;
    sizeEl.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';

    // Remove existing audio preview if any
    const oldAudio = document.getElementById(`devreply-audio-preview-player-${id}`);
    if (oldAudio) oldAudio.remove();

    if (file.type.startsWith('image/')) {
      icon.className = 'fas fa-image'; icon.style.color = '#38bdf8';
    } else if (file.type.startsWith('audio/')) {
      icon.className = 'fas fa-music'; icon.style.color = '#a78bfa';
      // Inline player
      const audioEl = document.createElement('audio');
      audioEl.id = `devreply-audio-preview-player-${id}`;
      audioEl.controls = true;
      audioEl.src = URL.createObjectURL(file);
      audioEl.style.cssText = 'width:100%; margin-top:6px; height:28px;';
      preview.appendChild(audioEl);
    } else if (file.type.startsWith('video/')) {
      icon.className = 'fas fa-video'; icon.style.color = '#34d399';
    } else {
      icon.className = 'fas fa-file-alt'; icon.style.color = '#fbbf24';
    }
  }

  const _devReplyRecTimerIntervals = {};
  const _devReplyRecSeconds = {};
  const _devReplyWaveIntervals = {};

  function _devReplyStartWaveform(id) {
    const bars = document.querySelectorAll(`.devreply-wave-bar-${id}`);
    _devReplyWaveIntervals[id] = setInterval(function() {
      bars.forEach(function(b) {
        const h = Math.floor(Math.random() * 20) + 4;
        b.style.height = h + 'px';
      });
    }, 120);
  }

  function _devReplyStopWaveform(id) {
    if (_devReplyWaveIntervals[id]) { clearInterval(_devReplyWaveIntervals[id]); delete _devReplyWaveIntervals[id]; }
    const bars = document.querySelectorAll(`.devreply-wave-bar-${id}`);
    bars.forEach(function(b) { b.style.height = '4px'; });
  }

  function _devReplyStartTimer(id) {
    _devReplyRecSeconds[id] = 0;
    const timerEl = document.getElementById(`devreply-rec-timer-${id}`);
    _devReplyRecTimerIntervals[id] = setInterval(function() {
      _devReplyRecSeconds[id]++;
      const m = Math.floor(_devReplyRecSeconds[id] / 60);
      const s = _devReplyRecSeconds[id] % 60;
      if (timerEl) timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  function _devReplyStopTimer(id) {
    if (_devReplyRecTimerIntervals[id]) { clearInterval(_devReplyRecTimerIntervals[id]); delete _devReplyRecTimerIntervals[id]; }
  }

  function toggleDevReplyAudioPreview(id) {
    const player = document.getElementById(`devreply-audio-player-${id}`);
    const playBtn = document.getElementById(`devreply-audio-play-btn-${id}`);
    const fill = document.getElementById(`devreply-audio-fill-${id}`);
    const durEl = document.getElementById(`devreply-audio-dur-${id}`);
    if (!player) return;
    if (player.paused) {
      player.play();
      if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      player.ontimeupdate = function() {
        if (player.duration) {
          const pct = (player.currentTime / player.duration) * 100;
          if (fill) fill.style.width = pct + '%';
          const s = Math.floor(player.currentTime);
          const m = Math.floor(s / 60); const sec = s % 60;
          if (durEl) durEl.textContent = m + ':' + (sec < 10 ? '0' : '') + sec;
        }
      };
      player.onended = function() {
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (fill) fill.style.width = '0%';
      };
    } else {
      player.pause();
      if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
  }

  function clearDevReplyMedia(id) {
    delete _devReplyFiles[id];
    delete _devReplyIsRecorded[id];
    const imgInput = document.getElementById(`devreply-media-file-image-${id}`);
    if (imgInput) imgInput.value = '';
    const audioInput = document.getElementById(`devreply-media-file-audio-${id}`);
    if (audioInput) audioInput.value = '';
    const docInput = document.getElementById(`devreply-media-file-doc-${id}`);
    if (docInput) docInput.value = '';
    const legacyInput = document.getElementById(`devreply-media-file-${id}`);
    if (legacyInput) legacyInput.value = '';
    const preview = document.getElementById(`devreply-media-preview-${id}`);
    if (preview) preview.style.display = 'none';
    
    // Reset audio preview and show main input row
    const audioPreview = document.getElementById(`devreply-audio-preview-${id}`);
    if (audioPreview) audioPreview.style.display = 'none';
    const inputRow = document.getElementById(`devreply-main-input-row-${id}`);
    if (inputRow) inputRow.style.display = 'flex';
    
    // Stop audio player
    const player = document.getElementById(`devreply-audio-player-${id}`);
    if (player) { player.pause(); player.src = ''; }
    const playBtn = document.getElementById(`devreply-audio-play-btn-${id}`);
    if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
    const fill = document.getElementById(`devreply-audio-fill-${id}`);
    if (fill) fill.style.width = '0%';

    updateDevMsgActionBtn(id);
  }

  async function toggleDevReplyRecording(id) {
    if (!_devReplyRecorders[id]) {
      // ── START RECORDING ──
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        const recorder = new MediaRecorder(stream);
        _devReplyRecorders[id] = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          _devReplyStopWaveform(id);
          _devReplyStopTimer(id);
          
          // hide rec bar, show audio preview
          const recBar = document.getElementById(`devreply-rec-bar-${id}`);
          const inputRow = document.getElementById(`devreply-main-input-row-${id}`);
          const audioPreview = document.getElementById(`devreply-audio-preview-${id}`);
          if (recBar) recBar.style.display = 'none';
          if (inputRow) inputRow.style.display = 'none';
          if (audioPreview) {
            audioPreview.style.display = 'flex';
            const player = document.getElementById(`devreply-audio-player-${id}`);
            const durEl = document.getElementById(`devreply-audio-dur-${id}`);
            const fill = document.getElementById(`devreply-audio-fill-${id}`);
            if (player) {
              const url = URL.createObjectURL(new Blob(chunks, { type: 'audio/ogg; codecs=opus' }));
              player.src = url;
              player.onloadedmetadata = function() {
                const total = Math.floor(player.duration);
                const m = Math.floor(total / 60); const s = total % 60;
                if (durEl) durEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
              };
              if (fill) fill.style.width = '0%';
            }
          }

          const audioBlob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
          const audioFile = new File([audioBlob], `voice_note_${Date.now()}.ogg`, { type: 'audio/ogg' });
          _devReplyFiles[id] = audioFile;
          _devReplyIsRecorded[id] = true;
          updateDevMsgActionBtn(id);
        };

        recorder.start();
        // show rec bar, hide input row
        const recBar = document.getElementById(`devreply-rec-bar-${id}`);
        const inputRow = document.getElementById(`devreply-main-input-row-${id}`);
        const audioPreview = document.getElementById(`devreply-audio-preview-${id}`);
        if (recBar) recBar.style.display = 'flex';
        if (inputRow) inputRow.style.display = 'none';
        if (audioPreview) audioPreview.style.display = 'none';
        _devReplyStartWaveform(id);
        _devReplyStartTimer(id);
        updateDevMsgActionBtn(id);
      } catch (err) {
        console.error('Error starting audio recording:', err);
        showToast('❌ تعذر الوصول للميكروفون', 'error');
      }
    } else {
      // ── STOP RECORDING ──
      _devReplyRecorders[id].stop();
      delete _devReplyRecorders[id];
    }
  }

  let _dmTargetNumber = '';
  let _dmTargetPlatform = '';

  function openDirectMessageModal(num, platform, name) {
    // Route to the unified WhatsApp-style chat modal instead of the old simple popup
    _dmTargetNumber = num;
    _dmTargetPlatform = platform;
    const modal = document.getElementById('devmsg-chat-modal');
    if (modal) {
      modal.style.display = 'flex';
      openConversation(num, platform, name);
    }
  }

  function closeDirectMessageModal() {
    const modal = document.getElementById('direct-message-modal');
    modal.classList.remove('show');
    modal.classList.add('hide');
  }

  async function submitDirectMessage() {
    const message = document.getElementById('dm-message-text').value.trim();
    const mediaFile = _dmMediaFile;
    const alertEl = document.getElementById('dm-alert');
    const sendBtn = document.getElementById('dm-send-btn');
    
    if (!message && !mediaFile) {
      alertEl.style.display = 'block';
      alertEl.className = 'alert alert-error';
      alertEl.textContent = '⚠️ يرجى كتابة رسالة أو إرفاق ملف';
      return;
    }
    
    sendBtn.disabled = true;
    sendBtn.textContent = 'جاري الإرسال...';
    alertEl.style.display = 'none';
    
    try {
      const body = {
        number: _dmTargetNumber,
        platform: _dmTargetPlatform,
        message: message
      };

      if (mediaFile) {
        sendBtn.textContent = 'جاري رفع الملف...';
        body.mediaBase64 = await fileToBase64(mediaFile);
        body.mediaType = mediaFile.type;
        body.mediaName = mediaFile.name;
        body.caption = message;
        body.ptt = _dmMediaIsRecorded;
        sendBtn.textContent = 'جاري الإرسال...';
      }

      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        alertEl.style.display = 'block';
        alertEl.className = 'alert alert-success';
        alertEl.textContent = '✅ تم إرسال الرسالة بنجاح!';
        showToast('✅ تم إرسال الرسالة', 'success');
        setTimeout(closeDirectMessageModal, 1500);
      } else {
        sendBtn.disabled = false;
        sendBtn.textContent = 'إرسال';
        alertEl.style.display = 'block';
        alertEl.className = 'alert alert-error';
        alertEl.textContent = `❌ ${data.error || 'فشل إرسال الرسالة'}`;
      }
    } catch (e) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'إرسال';
      alertEl.style.display = 'block';
      alertEl.className = 'alert alert-error';
      alertEl.textContent = '❌ حدث خطأ في الاتصال بالسيرفر';
    }
  }

  // =================== CMD STATS ===================
  async function loadCmdStats() {
    try {
      const platform = document.getElementById('cs-platform-filter')?.value || 'all';
      const res = await fetch(`/api/cmd-stats?platform=${platform}`);
      const data = await res.json();
      document.getElementById('cs-total').textContent = data.total || 0;
      document.getElementById('cs-used').textContent = data.usedCount || 0;
      document.getElementById('cs-unused').textContent = data.unusedCount || 0;
      document.getElementById('cs-top').textContent = data.topCommands?.[0]?.cmd ? '.' + data.topCommands[0].cmd : '—';
      
      // Platform totals
      if (data.platformStats) {
        const waTotal = Object.values(data.platformStats.whatsapp || {}).reduce((a, b) => a + b, 0);
        const tgTotal = Object.values(data.platformStats.telegram || {}).reduce((a, b) => a + b, 0);
        const fbTotal = Object.values(data.platformStats.facebook || {}).reduce((a, b) => a + b, 0);
        document.getElementById('cs-wa-total').textContent = waTotal;
        document.getElementById('cs-tg-total').textContent = tgTotal;
        document.getElementById('cs-fb-total').textContent = fbTotal;
      }

      // Store globally and render top commands
      window.lastCmdStatsData = data;
      const savedPlat = localStorage.getItem('top_commands_platform') || 'all';
      renderTopCommands(savedPlat);

      // Unused commands
      const unusedEl = document.getElementById('unused-commands-list');
      if (!data.unusedFiles || data.unusedFiles.length === 0) {
        unusedEl.innerHTML = `<p style="color:var(--accent);text-align:center;padding:20px;">🎉 جميع الأوامر تم استخدامها!</p>`;
      } else {
        const catColors = {thmil:'var(--blue)',ai:'var(--purple)',image:'var(--yellow)',tools:'var(--accent)',admin:'var(--red)',group:'var(--blue)',fun:'var(--yellow)',info:'var(--text-muted)',islamic:'var(--accent)',morocco:'var(--red)'};
        unusedEl.innerHTML = data.unusedFiles.map(f => {
          const [cat, name] = f.split('/');
          const col = catColors[cat] || 'var(--text-muted)';
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:10px;margin-bottom:6px;"><span style="font-size:10px;padding:2px 8px;border-radius:20px;background:rgba(252,129,129,0.1);color:var(--red);font-weight:600;white-space:nowrap;">غير مستخدم</span><span style="font-size:13px;flex:1;"><span style="color:${col};font-weight:700;">${cat}/</span>${name||f}</span></div>`;
        }).join('');
      }
    } catch(e) { showToast('خطأ في تحميل الإحصائيات', 'error'); }
  }

  async function loadCmdErrors() {
    const tbody = document.getElementById('errors-tbody');
    if (!tbody) return;
    const badgeEl = document.getElementById('diagnostics-status-badge');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</td></tr>';
    
    // Live diagnostics check
    let geminiWorking = false;
    try {
      if (badgeEl) badgeEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري فحص حالة الذكاء الاصطناعي...';
      const diagRes = await fetch('/api/errors/check-status');
      const diagData = await diagRes.json();
      if (diagData.ok && diagData.diagnostics) {
        geminiWorking = diagData.diagnostics.gemini;
        window.geminiWorking = geminiWorking; // Store globally for modal use
        if (badgeEl) {
          if (geminiWorking) {
            badgeEl.innerHTML = '<span style="color:#10b981;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-check-circle"></i> الذكاء الاصطناعي: يعمل</span>';
          } else {
            badgeEl.innerHTML = `<span style="color:#ef4444;font-weight:700;display:inline-flex;align-items:center;gap:4px;" title="${diagData.diagnostics.geminiDetails}"><i class="fas fa-times-circle"></i> عطل بالـ AI (${diagData.diagnostics.geminiDetails.substring(0,18)}...)</span>`;
          }
        }
      }
    } catch (e) {
      if (badgeEl) badgeEl.innerHTML = '<span style="color:#f59e0b;font-weight:700;"><i class="fas fa-exclamation-triangle"></i> تعذر الاتصال</span>';
    }

    try {
      const res = await fetch('/api/errors?limit=100');
      const data = await res.json();
      if (!data.ok || !data.errors || data.errors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#10b981;font-weight:700;">✅ سجل الأعطال فارغ، لا توجد أخطاء حالياً</td></tr>';
        return;
      }
      
      // Store globally to avoid JSON string escaping bugs in HTML attributes
      window.loadedErrors = data.errors;
      
      const platformColors = { whatsapp: '#25d366', telegram: '#38bdf8', facebook: '#0084ff', wa: '#25d366', tg: '#38bdf8', fb: '#0084ff', WA: '#25d366', TG: '#38bdf8', FB: '#0084ff' };
      const platformIcons  = { whatsapp: 'fab fa-whatsapp', telegram: 'fab fa-telegram-plane', facebook: 'fab fa-facebook-messenger', wa: 'fab fa-whatsapp', tg: 'fab fa-telegram-plane', fb: 'fab fa-facebook-messenger', WA: 'fab fa-whatsapp', TG: 'fab fa-telegram-plane', FB: 'fab fa-facebook-messenger' };
      
      tbody.innerHTML = data.errors.map((err, i) => {
        const ptf = (err.platform || '').toLowerCase();
        const color  = platformColors[ptf] || '#a78bfa';
        const icon   = platformIcons[ptf]  || 'fas fa-robot';
        const date   = err.created_at ? new Date(err.created_at).toLocaleString('ar-MA', { hour12: false }) : '—';
        const rawMsg = (err.error_message || err.message || err.stack || '—');
        
        let statusBadge = '';
        const isAiError = rawMsg.toLowerCase().includes('ai') || rawMsg.toLowerCase().includes('gemini') || rawMsg.toLowerCase().includes('model');
        if (isAiError) {
          if (geminiWorking) {
            statusBadge = '<span style="color:#10b981;background:rgba(16,185,129,0.1);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-check"></i> تم الإصلاح تلقائياً</span>';
          } else {
            statusBadge = '<span style="color:#ef4444;background:rgba(239,68,68,0.1);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-exclamation-circle"></i> نشط (عطل Gemini)</span>';
          }
        } else {
          statusBadge = '<span style="color:#10b981;background:rgba(16,185,129,0.1);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-check"></i> تم الإصلاح (السيرفر نشط)</span>';
        }

        const shortMsg = rawMsg.length > 55 ? rawMsg.substring(0, 55) + '...' : rawMsg;
        const userId = err.user_id || err.jid || '—';

        return `<tr id="err-row-${err.id}" style="border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.2s;vertical-align:middle;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
          <td style="padding:12px 14px;font-weight:700;color:var(--accent);white-space:nowrap;">
            <code style="background:rgba(167,139,250,0.1);padding:2px 6px;border-radius:5px;font-size:12px;">${err.command || err.cmd || '—'}</code>
          </td>
          <td style="padding:12px 14px;max-width:280px;word-break:break-word;color:#fc8181;font-size:12px;">${shortMsg}</td>
          <td style="padding:12px 14px;">${statusBadge}</td>
          <td style="padding:12px 14px;font-size:12px;color:var(--text-muted);">${userId}</td>
          <td style="padding:12px 14px;white-space:nowrap;">
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:${color};background:${color}22;padding:3px 8px;border-radius:8px;">
              <i class="${icon}"></i> ${err.platform || '—'}
            </span>
          </td>
          <td style="padding:12px 14px;color:var(--text-muted);font-size:11px;white-space:nowrap;">${date}</td>
          <td style="padding:12px 14px;white-space:nowrap;">
            <div style="display:inline-flex;gap:6px;">
              <button onclick="showErrorDetailModal(${i})" class="btn btn-secondary" style="padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:4px;" title="عرض التفاصيل"><i class="fas fa-eye"></i> تفاصيل</button>
              <button onclick="deleteErrorLog(${err.id})" class="btn btn-danger" style="padding:6px 10px;font-size:12px;display:inline-flex;align-items:center;justify-content:center;" title="حذف الخطأ"><i class="fas fa-trash-alt"></i></button>
            </div>
          </td>
        </tr>`;
      }).join('');
    } catch(e) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--red);">❌ خطأ في تحميل البيانات: ' + e.message + '</td></tr>';
    }
  }

  function showErrorDetailModal(index) {
    if (!window.loadedErrors || !window.loadedErrors[index]) return;
    const err = window.loadedErrors[index];
    const geminiWorking = !!window.geminiWorking;
    
    document.getElementById('mdl-err-cmd').textContent = err.command || err.cmd || '—';
    document.getElementById('mdl-err-platform').textContent = err.platform || '—';
    document.getElementById('mdl-err-user').textContent = err.user_id || err.jid || '—';
    
    const rawMsg = err.error_message || err.message || err.stack || '—';
    
    // Build status html dynamically
    let statusBadge = '';
    const isAiError = rawMsg.toLowerCase().includes('ai') || rawMsg.toLowerCase().includes('gemini') || rawMsg.toLowerCase().includes('model');
    if (isAiError) {
      if (geminiWorking) {
        statusBadge = '<span style="color:#10b981;background:rgba(16,185,129,0.1);padding:3.5px 10px;border-radius:6px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-check"></i> تم الإصلاح تلقائياً</span>';
      } else {
        statusBadge = '<span style="color:#ef4444;background:rgba(239,68,68,0.1);padding:3.5px 10px;border-radius:6px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-exclamation-circle"></i> نشط (عطل Gemini)</span>';
      }
    } else {
      statusBadge = '<span style="color:#10b981;background:rgba(16,185,129,0.1);padding:3.5px 10px;border-radius:6px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-check"></i> تم الإصلاح (السيرفر نشط)</span>';
    }
    document.getElementById('mdl-err-status').innerHTML = statusBadge;
    document.getElementById('mdl-err-msg').textContent = rawMsg;
    
    // Suggest solution based on content
    const solEl = document.getElementById('mdl-err-solution');
    const msgLower = rawMsg.toLowerCase();
    if (msgLower.includes('unavailable') || msgLower.includes('experiencing high demand') || msgLower.includes('503')) {
      solEl.innerHTML = `<span style="color:#10b981;font-weight:700;">خوادم Google AI تواجه ضغطاً كبيراً مؤقتاً.</span> تم تلقائياً الترقية إلى النموذج المستقر والجديد <code style="background:rgba(255,255,255,0.06);padding:2px 5px;border-radius:4px;">gemini-3.1-flash-lite</code> لحل هذا العطل.`;
    } else if (msgLower.includes('quota') || msgLower.includes('429')) {
      solEl.innerHTML = `<span style="color:#ef4444;font-weight:700;">تم استهلاك حصة الـ API (Rate Limit / Quota Exceeded).</span> يرجى إما الانتظار لبضع دقائق أو تسجيل مفتاح API مجاني جديد من Google AI Studio وضبطه في الإعدادات.`;
    } else if (msgLower.includes('api key') || msgLower.includes('api_key_invalid') || msgLower.includes('400')) {
      solEl.innerHTML = `<span style="color:#f59e0b;font-weight:700;">مفتاح API غير صالح أو خاطئ.</span> يرجى إعادة التحقق من إدخال مفتاح Gemini الـ API بشكل صحيح في حقل <code style="background:rgba(255,255,255,0.06);padding:2px 5px;border-radius:4px;">geminiApiKey</code> في الإعدادات.`;
    } else {
      solEl.innerHTML = `حدث خطأ عام أثناء معالجة الطلب. يرجى الضغط على زر <code style="background:rgba(255,255,255,0.06);padding:2px 5px;border-radius:4px;">تحديث</code> لمعرفة ما إذا كان المشكل قد تم إصلاحه تلقائياً في الطلبات الجديدة.`;
    }
    
    // Configure delete button inside modal
    document.getElementById('mdl-err-del-btn').onclick = function() {
      deleteErrorLog(err.id);
      closeErrorDetailModal();
    };
    
    document.getElementById('err-log-detail-modal').style.display = 'flex';
  }

  function closeErrorDetailModal() {
    document.getElementById('err-log-detail-modal').style.display = 'none';
  }

  async function deleteErrorLog(id) {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا السجل؟')) return;
    try {
      const res = await fetch('/api/errors/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('🗑️ تم حذف السجل بنجاح', 'success');
        const row = document.getElementById(`err-row-${id}`);
        if (row) row.remove();
        loadCmdErrors();
      } else {
        showToast('فشل حذف السجل', 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    }
  }

  async function clearAllCmdErrors() {
    if (!confirm('⚠️ هل أنت متأكد من رغبتك في حذف جميع سجلات الأعطال؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      const res = await fetch('/api/errors/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.ok) {
        showToast('🗑️ تم تنظيف جميع السجلات بنجاح', 'success');
        loadCmdErrors();
      } else {
        showToast('فشل مسح السجلات', 'error');
      }
    } catch (e) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    }
  }

  function renderTopCommands(platform) {

    const data = window.lastCmdStatsData;
    if (!data) return;

    localStorage.setItem('top_commands_platform', platform);

    // Update active state of sub-tabs
    const tabs = ['all', 'whatsapp', 'telegram', 'facebook'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-top-${t}`);
      if (btn) {
        if (t === platform) {
          btn.classList.add('active');
          btn.style.background = 'var(--accent)';
          btn.style.color = 'white';
        } else {
          btn.classList.remove('active');
          btn.style.background = 'rgba(255,255,255,0.05)';
          btn.style.color = 'var(--text-muted)';
        }
      }
    });

    let statsSource = {};
    if (platform === 'all') {
      statsSource = data.stats || {};
    } else {
      statsSource = data.platformStats?.[platform] || {};
    }

    const topCmds = Object.entries(statsSource)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([cmd, count]) => ({ cmd, count }));

    const topEl = document.getElementById('top-commands-list');
    if (topCmds.length === 0) {
      topEl.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px;">لم يُستخدم أي أمر في هذه المنصة بعد</p>`;
    } else {
      const maxCount = topCmds[0]?.count || 1;
      const colors = ['var(--accent)','var(--blue)','var(--purple)','var(--yellow)','var(--red)'];
      topEl.innerHTML = topCmds.map((item, i) => {
        const pct = Math.round((item.count / maxCount) * 100);
        const color = colors[i % colors.length];
        const waCount = data.platformStats?.whatsapp?.[item.cmd] || 0;
        const tgCount = data.platformStats?.telegram?.[item.cmd] || 0;
        const fbCount = data.platformStats?.facebook?.[item.cmd] || 0;
        const breakdown = `<span style="font-size:11px;color:var(--text-muted);font-weight:normal;margin-right:8px;">(📱 ${waCount} | ✈️ ${tgCount} | 🔵 ${fbCount})</span>`;
        return `<div style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="font-size:13px;font-weight:600;"><i class="fas fa-terminal" style="color:${color};margin-left:6px;"></i>.${item.cmd}${breakdown}</span><span style="font-size:13px;font-weight:700;color:${color};">${item.count}x</span></div><div style="background:var(--bg);border-radius:6px;height:8px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${color};border-radius:6px;transition:width 0.5s;"></div></div></div>`;
      }).join('');
    }
  }

  // =================== ANALYTICS ===================
  let _anCmdData = null; // cache cmd-stats response

  async function loadAnalytics() {
    const icon = document.getElementById('an-refresh-icon');
    if (icon) icon.classList.add('fa-spin');
    try {
      // Fetch in parallel
      const [usersRes, cmdRes, actRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/cmd-stats'),
        fetch('/api/activity')
      ]);
      const usersData = await usersRes.json();
      const cmdData   = await cmdRes.json();
      const actData   = await actRes.json();

      _anCmdData = cmdData; // cache for platform tab switching

      const users = usersData.users || [];
      const log   = actData.log   || [];

      // ---- KPI Cards ----
      const waUsers = users.filter(u => u.platform === 'whatsapp').length;
      const tgUsers = users.filter(u => u.platform === 'telegram').length;
      const fbUsers = users.filter(u => u.platform === 'facebook').length;
      const totalUsers = users.length;

      document.getElementById('an-total-users').textContent = totalUsers;
      const elWa = document.getElementById('an-wa-count'); if (elWa) elWa.textContent = waUsers;
      const elTg = document.getElementById('an-tg-count'); if (elTg) elTg.textContent = tgUsers;
      const elFb = document.getElementById('an-fb-count'); if (elFb) elFb.textContent = fbUsers;

      // Total messages = sum of all cmd counts across platforms
      const allStats = cmdData.platformStats || { whatsapp:{}, telegram:{}, facebook:{} };
      const totalMsgs = Object.values(allStats).reduce((sum, pl) =>
        sum + Object.values(pl).reduce((s, v) => s + v, 0), 0);
      document.getElementById('an-total-msgs').textContent = totalMsgs > 0 ? totalMsgs.toLocaleString('ar') : log.length;

      const topCmds = (cmdData.topCommands || []);
      const usedUniqueCommands = Object.keys(cmdData.stats || {}).length;
      document.getElementById('an-cmds-used').textContent = usedUniqueCommands;
      document.getElementById('an-top-cmd').textContent = topCmds[0] ? '.' + topCmds[0].cmd + ' ×' + topCmds[0].count : '—';

      // ---- Platform chart ----
      renderAnPlatformChart(waUsers, tgUsers, fbUsers, totalUsers);

      // ---- Activity strip ----
      renderAnActivityStrip(log);

      // ---- Top commands chart ----
      renderAnCmds('all');

      // ---- Activity feed ----
      renderAnActivityFeed(log);

    } catch(e) {
      console.error('[Analytics]', e);
      showToast('❌ خطأ في تحميل Analytics', 'error');
    } finally {
      if (icon) icon.classList.remove('fa-spin');
    }
  }

  function renderAnPlatformChart(wa, tg, fb, total) {
    const el = document.getElementById('an-platform-chart');
    if (!el) return;
    const items = [
      { label: 'WhatsApp', count: wa, color: '#25d366', icon: 'fab fa-whatsapp' },
      { label: 'Telegram', count: tg, color: '#38bdf8', icon: 'fab fa-telegram-plane' },
      { label: 'Facebook', count: fb, color: '#0084ff', icon: 'fab fa-facebook-messenger' },
    ];
    const max = Math.max(wa, tg, fb, 1);
    el.innerHTML = items.map(item => {
      const pct = Math.round((item.count / max) * 100);
      const share = total > 0 ? Math.round((item.count / total) * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);">
          <div style="width:36px;height:36px;border-radius:10px;background:${item.color}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="${item.icon}" style="color:${item.color};font-size:18px;"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="font-weight:700;font-size:13px;">${item.label}</span>
              <span style="font-weight:800;font-size:14px;color:${item.color};">${item.count} <small style="font-size:11px;color:var(--text-muted);">(${share}%)</small></span>
            </div>
            <div style="background:var(--bg);border-radius:6px;height:8px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${item.color};border-radius:6px;transition:width 0.8s cubic-bezier(0.4,0,0.2,1);"></div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderAnActivityStrip(log) {
    const el = document.getElementById('an-activity-strip');
    if (!el) return;
    if (!log.length) { el.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">لا يوجد نشاط</div>'; return; }

    // Group by day (last 7 unique days)
    const byDay = {};
    log.forEach(e => {
      const d = new Date(e.time).toLocaleDateString('ar-MA', { month:'short', day:'numeric' });
      byDay[d] = (byDay[d] || 0) + 1;
    });
    const days = Object.entries(byDay).slice(0, 7);
    const maxDay = Math.max(...days.map(([,c]) => c), 1);

    const platformColors = { whatsapp:'#25d366', telegram:'#38bdf8', facebook:'#0084ff' };
    const recent = log.slice(0, 7);

    el.innerHTML = `
      <div style="padding:12px 16px;">
        <div style="display:flex;align-items:flex-end;gap:6px;height:72px;margin-bottom:6px;">
          ${days.map(([day, count]) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div title="${count} تفاعل" style="width:100%;background:linear-gradient(135deg,var(--purple),var(--blue));border-radius:4px 4px 0 0;height:${Math.max(6, Math.round((count/maxDay)*60))}px;transition:height 0.6s;"></div>
              <div style="font-size:9px;color:var(--text-muted);white-space:nowrap;">${day}</div>
            </div>`).join('')}
        </div>
      </div>
      <div style="border-top:1px solid var(--border);padding:10px 16px;display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;">
        ${recent.map(e => `
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${platformColors[e.platform]||'#ccc'};flex-shrink:0;"></div>
            <span style="font-size:11px;color:var(--text-muted);flex-shrink:0;">${new Date(e.time).toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'})}</span>
            <span style="font-size:12px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.message}</span>
          </div>`).join('')}
      </div>`;
  }

  function renderAnCmds(platform) {
    // Update active tab
    ['all','whatsapp','telegram','facebook'].forEach(p => {
      const btn = document.getElementById('an-tab-'+p);
      if (btn) btn.classList.toggle('active', p === platform);
    });

    const el = document.getElementById('an-cmds-chart');
    if (!el || !_anCmdData) { if(el) el.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">لا توجد بيانات</div>'; return; }

    let stats = {};
    if (platform === 'all') {
      stats = _anCmdData.stats || {};
    } else {
      stats = (_anCmdData.platformStats || {})[platform] || {};
    }

    const top = Object.entries(stats).sort((a,b)=>b[1]-a[1]).slice(0,12);
    if (!top.length) { el.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">لا توجد أوامر مستخدمة بعد</div>'; return; }

    const colors = { all:'var(--purple)', whatsapp:'#25d366', telegram:'#38bdf8', facebook:'#0084ff' };
    const color = colors[platform] || 'var(--purple)';
    const maxCount = top[0][1];

    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;padding:10px 16px;">` +
      top.map(([cmd, count], i) => {
        const pct = Math.round((count / maxCount) * 100);
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span style="font-size:12px;color:var(--text-muted);">#${i+1}</span>`;
        return `
          <div style="background:var(--bg);border-radius:12px;padding:12px 14px;border:1px solid var(--border);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                ${medal}
                <span style="font-size:13px;font-weight:700;color:var(--text);">.${cmd}</span>
              </div>
              <span style="font-size:14px;font-weight:800;color:${color};">${count}x</span>
            </div>
            <div style="background:var(--surface);border-radius:6px;height:6px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${color};border-radius:6px;transition:width 0.7s ease;"></div>
            </div>
          </div>`;
      }).join('') + `</div>`;
  }

  function renderAnActivityFeed(log) {
    const el = document.getElementById('an-activity-feed');
    if (!el) return;
    if (!log.length) { el.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">لا يوجد نشاط مسجّل بعد</div>'; return; }

    const icons = { whatsapp:{ icon:'fab fa-whatsapp', color:'#25d366'}, telegram:{ icon:'fab fa-telegram-plane', color:'#38bdf8'}, facebook:{ icon:'fab fa-facebook-messenger', color:'#0084ff'} };

    el.innerHTML = log.map(e => {
      const pi = icons[e.platform] || { icon:'fas fa-circle', color:'var(--text-muted)'};
      const ts = new Date(e.time).toLocaleString('ar-MA', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const isCmd = e.cmd && e.cmd.length > 0;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);transition:background .2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
          <div style="width:34px;height:34px;border-radius:10px;background:${pi.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="${pi.icon}" style="color:${pi.color};font-size:16px;"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
              <span style="font-weight:700;font-size:12px;color:var(--text);">${e.user || '—'}</span>
              ${isCmd ? `<span style="font-size:10px;background:${pi.color}22;color:${pi.color};border-radius:6px;padding:1px 7px;font-weight:700;">.${e.cmd}</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.message || '—'}</div>
          </div>
          <div style="font-size:10px;color:var(--text-muted);flex-shrink:0;">${ts}</div>
        </div>`;
    }).join('');
  }

  // =================== BROADCAST ===================

  async function sendBroadcast() {
    const msg = document.getElementById('broadcast-msg').value.trim();
    const platform = document.getElementById('broadcast-platform').value;
    const mediaFile = _broadcastMediaFile;
    if (!msg && !mediaFile) { showToast('اكتب رسالة أو أرفق ملفاً أولاً', 'error'); return; }
    if (!await showConfirm('إرسال هذه الرسالة للمستلمين المحددين؟')) return;

    const alert = document.getElementById('broadcast-alert');
    showAlert(alert, 'info', '⏳ جاري تحضير الملف...');

    // Show live progress panel
    let progressPanel = document.getElementById('bc-progress-panel');
    if (!progressPanel) {
      progressPanel = document.createElement('div');
      progressPanel.id = 'bc-progress-panel';
      progressPanel.style.cssText = 'margin-top:16px;padding:16px;background:rgba(0,0,0,0.25);border-radius:14px;border:1px solid rgba(255,255,255,0.07);';
      document.getElementById('broadcast-alert').parentNode.insertBefore(progressPanel, document.getElementById('broadcast-alert').nextSibling);
    }

    try {
      const bypassEl = document.getElementById('broadcast-fb-bypass');
      const body = { 
        message: msg, 
        platform,
        bypass24h: bypassEl ? bypassEl.checked : false
      };
      if (mediaFile) {
        showAlert(alert, 'info', '⏳ جاري رفع الملف...');
        body.mediaBase64 = await fileToBase64(mediaFile);
        body.mediaType = mediaFile.type;
        body.mediaName = mediaFile.name;
        body.caption = msg;
        body.ptt = _broadcastMediaIsRecorded;
      }
      showAlert(alert, 'info', '⏳ جاري بدء الإرسال...');

      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!data.ok) {
        showAlert(alert, 'error', data.error || 'فشل الإرسال');
        return;
      }

      // Start polling progress
      showAlert(alert, 'info', `📡 البث يعمل في الخلفية... (${data.total} مستخدم)`);
      document.getElementById('broadcast-msg').value = '';
      clearBroadcastMedia();
      document.getElementById('broadcast-last').textContent = new Date().toLocaleTimeString('ar-MA');

      let pollInterval = setInterval(async () => {
        try {
          const pr = await fetch('/api/broadcast/progress');
          const p = await pr.json();

          const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          const barColor = p.running ? '#6ee7b7' : (p.failed > 0 ? '#f87171' : '#34d399');
          const skipped = p.skipped || 0;

          progressPanel.innerHTML = [
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
            '<span style="font-size:13px;font-weight:700;color:var(--text);">' + (p.running ? '📡 جاري الإرسال...' : '✅ اكتمل البث') + '</span>',
            '<span style="font-size:12px;display:flex;gap:10px;align-items:center;">',
            '<span style="color:#34d399;">✅ ' + p.sent + '</span>',
            '<span style="color:#f87171;">❌ ' + p.failed + '</span>',
            (skipped > 0 ? '<span style="color:#fbbf24;">⏰ ' + skipped + '</span>' : ''),
            '<span style="color:var(--text-muted);">' + p.done + '/' + p.total + '</span>',
            '</span></div>',
            '<div style="background:rgba(255,255,255,0.07);border-radius:99px;height:8px;overflow:hidden;margin-bottom:12px;">',
            '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:99px;transition:width 0.4s ease;"></div></div>',
            (skipped > 0 ? '<div style="font-size:11px;color:#fbbf24;margin-bottom:8px;padding:6px 10px;background:rgba(251,191,36,0.08);border-radius:8px;border:1px solid rgba(251,191,36,0.2);">⏰ ' + skipped + ' مستخدم خارج نافذة 24 ساعة — Facebook لا يسمح بالإرسال</div>' : ''),
            '<div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">',
            (p.log || []).map(function(entry) {
              var isSk = entry.skipped;
              var bg = isSk ? 'rgba(251,191,36,0.06)' : (entry.ok ? 'rgba(255,255,255,0.03)' : 'rgba(248,113,113,0.06)');
              var col = isSk ? '#fbbf24' : (entry.ok ? 'var(--text)' : '#f87171');
              var badge = isSk ? '<span style="color:#fbbf24;">⏰</span>' : (entry.ok ? '<span style="color:#34d399;">✅</span>' : '<span style="color:#f87171;">❌</span>');
              return '<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 8px;background:' + bg + ';border-radius:8px;"><span>' + (entry.icon||'📨') + '</span><span style="flex:1;color:' + col + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + entry.name + '</span><span style="color:var(--text-muted);font-size:11px;">' + entry.platform + '</span>' + badge + '<span style="color:var(--text-muted);font-size:10px;white-space:nowrap;">' + entry.time + '</span></div>';
            }).join(''),
            '</div>'
          ].join('');

          if (!p.running) {
            clearInterval(pollInterval);
            var skMsg = skipped > 0 ? '، ⏰ ' + skipped + ' تخطي (24h)' : '';
            var statusColor = p.failed === 0 ? 'success' : 'warning';
            showAlert(alert, statusColor, '✅ اكتمل البث: ' + p.sent + ' وصلت، ' + p.failed + ' فشلت' + skMsg + ' من ' + p.total);
          }
        } catch (_) {}
      }, 800);

    } catch(e) { showAlert(alert, 'error', 'خطأ في الاتصال'); }
  }

  // =================== ACTIVITY LOG ===================
  let _activityPollInterval = null;

  function startActivityPolling() {
    stopActivityPolling();
    // Poll every 5 seconds to get fresh activity data
    _activityPollInterval = setInterval(async () => {
      const activePage = localStorage.getItem('active_page');
      if (activePage === 'activity') {
        await loadActivity();
      } else {
        stopActivityPolling();
      }
    }, 5000);
  }

  function stopActivityPolling() {
    if (_activityPollInterval) {
      clearInterval(_activityPollInterval);
      _activityPollInterval = null;
    }
  }

  async function loadActivity() {
    try {
      const res = await fetch('/api/activity');
      const data = await res.json();
      const logEl = document.getElementById('activity-log');
      if (!data.log || data.log.length === 0) {
        logEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:40px;"><i class="fas fa-history" style="font-size:40px;margin-bottom:12px;display:block;opacity:0.3;"></i>الأنشطة تُسجَّل بعد استخدام الأوامر في البوت</div>`;
        return;
      }
      logEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">` +
        data.log.map(entry => {
          const d = new Date(entry.time);
          const timeStr = d.toLocaleTimeString('ar-MA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
          const dateStr = d.toLocaleDateString('ar-MA');
          
          let platformColor = 'var(--accent)';
          let platformIcon = '<i class="fas fa-robot"></i>';
          let platformBg = 'linear-gradient(135deg,var(--accent),var(--blue))';
          let userLabel = entry.user || '';
          
          if (entry.platform === 'whatsapp') {
            platformColor = '#25d366';
            platformIcon = '<i class="fab fa-whatsapp"></i>';
            platformBg = 'linear-gradient(135deg,#25d366,#128c7e)';
            userLabel = `+${userLabel}`;
          } else if (entry.platform === 'telegram') {
            platformColor = '#38bdf8';
            platformIcon = '<i class="fab fa-telegram-plane"></i>';
            platformBg = 'linear-gradient(135deg,#38bdf8,#0284c7)';
            userLabel = `تليجرام: ${userLabel}`;
          } else if (entry.platform === 'facebook') {
            platformColor = '#0084ff';
            platformIcon = '<i class="fab fa-facebook-messenger"></i>';
            platformBg = 'linear-gradient(135deg,#0084ff,#0044ff)';
            userLabel = `فيسبوك: ${userLabel}`;
          }
          
          let contentHtml = '';
          if (entry.cmd) {
            contentHtml = `<span style="background:rgba(37,211,102,0.1);color:var(--accent);padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;margin-left:6px;display:inline-block;direction:ltr;">.${entry.cmd}</span>`;
          }
          
          const displayMessage = entry.message || (entry.cmd ? `نفذ الأمر .${entry.cmd}` : 'أرسل رسالة');
          
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg);border-radius:12px;border-right:3px solid ${platformColor};"><div style="width:32px;height:32px;border-radius:50%;background:${platformBg};display:flex;align-items:center;justify-content:center;font-size:13px;color:white;">${platformIcon}</div><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;"><span style="font-size:12px;font-weight:700;color:var(--text-main);">${userLabel}</span>${contentHtml}</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displayMessage}</div></div><div style="text-align:left;font-size:11px;color:var(--text-muted);white-space:nowrap;"><div>${timeStr}</div><div>${dateStr}</div></div></div>`;
        }).join('') + `</div>`;
    } catch(e) { showToast('خطأ في تحميل السجل', 'error'); }
  }

  // =================== PROFANITY VIOLATORS PAGE ===================

  // =================== TTS ENGINE (Web Speech API - Google Voices) ===================
  let _ttsUtterance = null;
  let _ttsVoices = [];
  let _ttsSelectedVoiceName = '';
  let _ttsSpeaking = false;

  function _ttsLoadVoices() {
    _ttsVoices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  }
  if (window.speechSynthesis) {
    speechSynthesis.addEventListener('voiceschanged', _ttsLoadVoices);
    _ttsLoadVoices();
  }

  function ttsGetVoices(lang) {
    // prefer voices that include lang code, fallback to all
    const all = speechSynthesis.getVoices();
    return all.filter(v => lang ? v.lang.startsWith(lang) : true);
  }

  function ttsPopulateSelect(selectEl, lang) {
    if (!selectEl) return;
    const voices = ttsGetVoices(lang || 'ar');
    const fallback = voices.length === 0 ? ttsGetVoices('') : voices;
    selectEl.innerHTML = fallback.map(v =>
      `<option value="${v.name}" ${v.name === _ttsSelectedVoiceName ? 'selected' : ''}>${v.name} (${v.lang})</option>`
    ).join('');
    if (fallback.length > 0 && !_ttsSelectedVoiceName) {
      _ttsSelectedVoiceName = fallback[0].name;
    }
  }

  function ttsOnVoiceChange(selectEl) {
    if (selectEl) _ttsSelectedVoiceName = selectEl.value;
  }

  function speakText(text, lang) {
    if (!window.speechSynthesis) {
      showToast('\u274c \u0627\u0644\u0645\u062a\u0635\u0641\u062d \u0644\u0627 \u064a\u062f\u0639\u0645 TTS', 'error');
      return;
    }
    speechSynthesis.cancel();
    _ttsSpeaking = false;

    // update all speak buttons to default
    document.querySelectorAll('.tts-speak-btn').forEach(b => {
      b.innerHTML = '\ud83d\udd0a';
      b.style.background = 'rgba(37,211,102,0.1)';
      b.style.color = '#25d366';
    });

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang || 'ar-SA';

    // pick best matching voice
    const allVoices = speechSynthesis.getVoices();
    let voice = allVoices.find(v => v.name === _ttsSelectedVoiceName);
    if (!voice) voice = allVoices.find(v => v.lang.startsWith(lang || 'ar'));
    if (voice) utt.voice = voice;

    utt.rate = 0.9;
    utt.pitch = 1;
    utt.volume = 1;

    _ttsUtterance = utt;
    _ttsSpeaking = true;
    speechSynthesis.speak(utt);

    utt.onend = function() { _ttsSpeaking = false; };
    utt.onerror = function() { _ttsSpeaking = false; };
  }

  function stopSpeaking() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    _ttsSpeaking = false;
    document.querySelectorAll('.tts-speak-btn').forEach(b => {
      b.innerHTML = '\ud83d\udd0a';
      b.style.background = 'rgba(37,211,102,0.1)';
      b.style.color = '#25d366';
    });
  }

  function ttsSetupSelect(selectId, lang) {
    setTimeout(function() {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      ttsPopulateSelect(sel, lang);
      if (window.speechSynthesis) {
        speechSynthesis.addEventListener('voiceschanged', function() {
          ttsPopulateSelect(sel, lang);
        });
      }
    }, 200);
  }
  // =================== END TTS ENGINE ===================

  // =================== FULL CONVERSATION POPUP MODAL ===================
  let _popupChatFiles    = {};
  let _popupChatRecorded = {};
  let _popupChatRecorder = null;
  let _popupChatChunks   = [];

  function updatePopupActionBtn(jid) {
    const input = document.getElementById('popup-chat-input');
    const btn = document.getElementById('popup-send-btn');
    if (!input || !btn) return;
    
    if (_popupChatRecorder && _popupChatRecorder.state === 'recording') {
      btn.innerHTML = '<i class="fas fa-stop" style="color: white;"></i>';
      btn.style.background = '#ef4444';
      return;
    }
    
    const text = input.value.trim();
    const hasFile = !!_popupChatFiles[jid];
    
    if (text.length > 0 || hasFile) {
      btn.innerHTML = '<i class="fas fa-paper-plane" style="color: white;"></i>';
      btn.style.background = 'linear-gradient(135deg,var(--accent),var(--blue))';
    } else {
      btn.innerHTML = '<i class="fas fa-microphone" style="color: white;"></i>';
      btn.style.background = '#25d366';
    }
  }

  function handlePopupActionClick(jid, platform) {
    const input = document.getElementById('popup-chat-input');
    const text = input ? input.value.trim() : '';
    
    if (_popupChatRecorder && _popupChatRecorder.state === 'recording') {
      togglePopupRecording(jid);
      return;
    }
    
    if (text.length > 0 || _popupChatFiles[jid]) {
      sendPopupChatMsg(jid, platform);
    } else {
      togglePopupRecording(jid);
    }
  }

  async function openProfanityMsgModal(jid, platform, name) {
    // Redirect to the unified WhatsApp-style chat modal
    openDirectMessageModal(jid, platform, name);
  }
  // Deprecated old popup function placeholder to prevent references error
  async function old_openProfanityMsgModal_deprecated(jid, platform, name) {

    // Fetch latest dev messages from database to ensure conversation is always loaded and up-to-date
    try {
      const res = await fetch('/api/dev-messages');
      const data = await res.json();
      if (data.ok && data.messages) {
        window.devMessagesCache = data.messages;
      }
    } catch (e) {
      console.error('Failed to pre-fetch dev messages cache:', e);
    }

    // 1. Get direct dev messages
    const allMsgs  = window.devMessagesCache || [];
    const userDevMsgs = allMsgs.filter(function(m) { return m.sender === jid; });

    // 2. Fetch user violations from caches (profanity + ibhaya)
    const profLogs = (window.profanityLogsCache || []).filter(function(l) { return l.jid === jid; });
    const ibhLogs = (window.ibhayaLogsCache || []).filter(function(l) { return l.jid === jid; });
    
    // Convert violations to bubble-like format
    const violationMsgs = [];
    profLogs.forEach(function(l) {
      violationMsgs.push({
        id: l.timestamp + '_v',
        sender: jid,
        senderName: l.name,
        platform: l.platform,
        text: '⚠️ [مخالفة سب وشتم] الكلمة: ' + l.bad_word + '\nالرسالة: ' + l.message,
        timestamp: l.timestamp,
        isViolation: true
      });
    });
    ibhLogs.forEach(function(l) {
      violationMsgs.push({
        id: l.timestamp + '_v',
        sender: jid,
        senderName: l.name,
        platform: l.platform,
        text: '⚠️ [مخالفة إباحية] الكلمة: ' + l.bad_word + '\nالرسالة: ' + l.message,
        timestamp: l.timestamp,
        isViolation: true
      });
    });

    // Merge both list and sort chronologically
    const convMsgs = [...userDevMsgs, ...violationMsgs]
      .sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });

    const plat = (platform || 'whatsapp').toLowerCase();
    let pColor = '#25d366', pIcon = 'fab fa-whatsapp', pLabel = 'واتساب';
    if (plat === 'telegram' || plat === 'tg') { pColor = '#38bdf8'; pIcon = 'fab fa-telegram-plane'; pLabel = 'تيليغرام'; }
    if (plat === 'facebook' || plat === 'fb') { pColor = '#0084ff'; pIcon = 'fab fa-facebook-messenger'; pLabel = 'فيسبوك'; }

    let bubblesHtml = '';
    if (convMsgs.length === 0) {
      bubblesHtml = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text-muted);opacity:0.5;padding:30px 0;">'
        + '<i class="' + pIcon + '" style="font-size:48px;color:' + pColor + ';opacity:0.18;"></i>'
        + '<span style="font-size:12px;">لا توجد رسائل سابقة</span>'
        + '</div>';
    } else {
      convMsgs.forEach(function(m) {
        var t = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('ar-MA', {hour:'2-digit', minute:'2-digit'}) : '';
        
        // Render user message or violation
        if (m.isViolation) {
          bubblesHtml += '<div style="display:flex;flex-direction:column;align-items:flex-start;max-width:82%;align-self:flex-start;margin-bottom:10px;">'
            + '<div style="font-size:9px;color:var(--red);margin-bottom:4px;direction:rtl;font-weight:700;padding-left:4px;">' + (m.senderName || 'مستخدم') + ' · ' + t + ' (مخالفة)</div>'
            + '<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:18px 18px 18px 4px;padding:10px 14px;font-size:13px;color:#fc8181;line-height:1.6;white-space:pre-wrap;word-break:break-word;direction:rtl;text-align:right;box-shadow: 0 2px 6px rgba(239,68,68,0.08);">' + escapeHtml(m.text || '') + '</div>'
            + '</div>';
        } else if (m.text) {
          var safeText = (m.text || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
          bubblesHtml += '<div style="display:flex;flex-direction:column;align-items:flex-start;max-width:82%;align-self:flex-start;margin-bottom:10px;">'
            + '<div style="font-size:9px;color:var(--text-muted);margin-bottom:4px;direction:rtl;padding-left:4px;"><span style="font-weight:700;">' + (m.senderName || 'مستخدم') + '</span> · ' + t + '</div>'
            + '<div style="display:flex;align-items:center;gap:6px;">'
            + '<div style="background:rgba(255, 255, 255, 0.04);border:1px solid rgba(255, 255, 255, 0.07);border-radius:18px 18px 18px 4px;padding:10px 14px;font-size:13px;color:var(--text-main);line-height:1.6;white-space:pre-wrap;word-break:break-word;direction:rtl;text-align:right;box-shadow: 0 2px 6px rgba(0,0,0,0.15);">' + formatMessageContent(m.text || '') + '</div>'
            + '<button class="tts-speak-btn" onclick="speakText(\'' + safeText + '\', \'ar\')" title="استمع" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;border:none;background:rgba(37,211,102,0.1);color:#25d366;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔊</button>'
            + '</div>'
            + '</div>';
        }

        // Render developer replies
        if (m.replied && m.replyText) {
          var rt = m.replyTimestamp ? new Date(m.replyTimestamp).toLocaleTimeString('ar-MA', {hour:'2-digit',minute:'2-digit'}) : '';
          var safeReply = (m.replyText || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
          bubblesHtml += '<div style="display:flex;flex-direction:column;align-items:flex-end;max-width:82%;align-self:flex-end;margin-bottom:10px;">'
            + '<div style="font-size:9px;color:var(--text-muted);margin-bottom:4px;direction:rtl;padding-right:4px;"><span style="font-weight:700;color:var(--accent);">المطور</span> · ' + rt + '</div>'
            + '<div style="display:flex;align-items:center;gap:6px;flex-direction:row-reverse;">'
            + '<div style="background:linear-gradient(135deg, rgba(37, 211, 102, 0.16) 0%, rgba(18, 140, 126, 0.06) 100%);border:1px solid rgba(37, 211, 102, 0.22);border-radius:18px 18px 4px 18px;padding:10px 14px;font-size:13px;color:var(--text-main);line-height:1.6;white-space:pre-wrap;word-break:break-word;direction:rtl;text-align:right;box-shadow: 0 2px 8px rgba(37,211,102,0.06);">' + formatMessageContent(m.replyText) + '</div>'
            + '<button class="tts-speak-btn" onclick="speakText(\'' + safeReply + '\', \'ar\')" title="استمع" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;border:none;background:rgba(56,189,248,0.1);color:#38bdf8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔊</button>'
            + '</div>'
            + '</div>';
        }
      });
    }

    var safeName = (name || jid).replace(/"/g, '&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var safeJid  = jid.replace(/"/g, '&quot;');

    var modal = document.createElement('div');
    modal.id = 'chat-popup-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);padding:16px;box-sizing:border-box;';
    modal.innerHTML = ''
      + '<div style="background:var(--card);border-radius:18px;width:100%;max-width:520px;height:90vh;max-height:680px;border:1px solid var(--border);box-shadow:0 24px 80px rgba(0,0,0,0.6);display:flex;flex-direction:column;overflow:hidden;">'

      // ── Header ──
      + '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:var(--card);">'
      +   '<div style="display:flex;align-items:center;gap:10px;">'
      +     '<div style="width:38px;height:38px;border-radius:50%;background:' + pColor + '18;display:flex;align-items:center;justify-content:center;color:' + pColor + ';font-size:18px;"><i class="' + pIcon + '"></i></div>'
      +     '<div>'
      +       '<div style="font-weight:700;font-size:14px;color:var(--text-main);">' + safeName + '</div>'
      +       '<div style="font-size:10px;color:var(--text-muted);direction:ltr;text-align:right;">' + safeJid + ' \u00b7 ' + pLabel + '</div>'
      +     '</div>'
      +   '</div>'
      +   '<button onclick="document.getElementById(\'chat-popup-modal\').remove()" style="background:none;border:none;color:var(--text-muted);font-size:22px;cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;">&times;</button>'
      + '</div>'

      // ── Chat Body ──
      + '<div id="popup-chat-body" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background-image:radial-gradient(var(--border) 0.5px,transparent 0);background-size:16px 16px;min-height:0;direction:ltr;">'
      +   bubblesHtml
      + '</div>'

      // ── Footer ──
      + '<div style="padding:10px 14px;border-top:1px solid var(--border);background:var(--card);display:flex;flex-direction:column;gap:7px;flex-shrink:0;">'

      // recording waveform bar (hidden by default)
      + '<div id="popup-rec-bar" style="display:none;align-items:center;gap:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:8px 12px;direction:ltr;">'
      +   '<button onclick="togglePopupRecording(\'' + jid + '\')" style="width:32px;height:32px;border-radius:50%;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;"><i class="fas fa-stop"></i></button>'
      +   '<div style="display:flex;align-items:center;gap:2px;flex:1;height:28px;">'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +     '<span class="popup-wave-bar" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;"></span>'
      +   '</div>'
      +   '<span id="popup-rec-timer" style="font-size:12px;font-weight:700;color:#ef4444;font-family:monospace;flex-shrink:0;">0:00</span>'
      +   '<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;animation:blink 1s infinite;flex-shrink:0;"></span>'
      + '</div>'

      // audio preview bar (hidden by default)
      + '<div id="popup-audio-preview" style="display:none;align-items:center;gap:8px;background:rgba(37,211,102,0.07);border:1px solid rgba(37,211,102,0.2);border-radius:10px;padding:8px 12px;direction:ltr;">'
      +   '<button id="popup-audio-play-btn" onclick="togglePopupAudioPreview(\'' + jid + '\',\'' + platform + '\')" style="width:32px;height:32px;border-radius:50%;background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.4);color:#25d366;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;"><i class="fas fa-play"></i></button>'
      +   '<div style="flex:1;">'
      +     '<div style="font-size:10px;font-weight:700;color:#25d366;margin-bottom:3px;text-align:left;">🎤 رسالة صوتية</div>'
      +     '<audio id="popup-audio-player" style="display:none;"></audio>'
      +     '<div id="popup-audio-progress" style="height:3px;background:rgba(37,211,102,0.2);border-radius:2px;overflow:hidden;"><div id="popup-audio-fill" style="height:100%;background:#25d366;width:0%;transition:width 0.1s;"></div></div>'
      +     '<div id="popup-audio-dur" style="font-size:9px;color:var(--text-muted);margin-top:2px;text-align:left;">0:00</div>'
      +   '</div>'
      +   '<button onclick="clearPopupMedia(\'' + jid + '\')" style="width:26px;height:26px;border-radius:50%;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;"><i class="fas fa-trash"></i></button>'
      +   '<button onclick="sendPopupChatMsg(\'' + jid + '\',\'' + platform + '\',\'' + safeName + '\')" style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#25d366,#128c7e);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;box-shadow:0 2px 8px rgba(37,211,102,0.3);"><i class="fas fa-paper-plane"></i></button>'
      + '</div>'

      // main input row
      +   '<div id="popup-main-input-row" style="display:flex;gap:8px;align-items:flex-end;direction:ltr;">'
      +     '<textarea id="popup-chat-input" placeholder="\u0627\u0643\u062a\u0628 \u0631\u062f\u0643 \u0647\u0646\u0627..." style="flex:1;min-height:36px;max-height:100px;height:36px;padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:Cairo,sans-serif;font-size:12px;resize:none;box-sizing:border-box;line-height:1.4;direction:rtl;text-align:right;" oninput="updatePopupActionBtn(\'' + jid + '\')" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendPopupChatMsg(\'' + jid + '\',\'' + platform + '\',\'' + safeName + '\')}"></textarea>'
      +     '<button id="popup-send-btn" onclick="handlePopupActionClick(\'' + jid + '\',\'' + platform + '\',\'' + safeName + '\')" style="width:42px;height:42px;border-radius:50%;background:#25d366;border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;box-shadow:0 2px 8px rgba(37,211,102,0.35);transition:all 0.2s;"><i class="fas fa-microphone"></i></button>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
      +     '<input type="file" id="popup-media-file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.zip,.txt" style="display:none;" onchange="onPopupMediaChange(\'' + jid + '\',this)" />'
      +     '<button type="button" onclick="document.getElementById(\'popup-media-file\').accept=\'image/*\';document.getElementById(\'popup-media-file\').click()" style="padding:4px 10px;font-size:11px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);border-radius:6px;color:#38bdf8;cursor:pointer;font-family:Cairo,sans-serif;display:flex;align-items:center;gap:4px;"><i class="fas fa-image"></i> \u0635\u0648\u0631\u0629</button>'
      +     '<button type="button" onclick="document.getElementById(\'popup-media-file\').accept=\'audio/*\';document.getElementById(\'popup-media-file\').click()" style="padding:4px 10px;font-size:11px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:6px;color:#a78bfa;cursor:pointer;font-family:Cairo,sans-serif;display:flex;align-items:center;gap:4px;"><i class="fas fa-music"></i> \u0635\u0648\u062a</button>'
      +     '<button type="button" onclick="document.getElementById(\'popup-media-file\').accept=\'.pdf,.doc,.docx,.zip,.txt\';document.getElementById(\'popup-media-file\').click()" style="padding:4px 10px;font-size:11px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:6px;color:#fbbf24;cursor:pointer;font-family:Cairo,sans-serif;display:flex;align-items:center;gap:4px;"><i class="fas fa-file"></i> \u0645\u0644\u0641</button>'
      +     '<button type="button" onclick="document.getElementById(\'popup-media-file\').accept=\'video/*\';document.getElementById(\'popup-media-file\').click()" style="padding:4px 10px;font-size:11px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:6px;color:#34d399;cursor:pointer;font-family:Cairo,sans-serif;display:flex;align-items:center;gap:4px;"><i class="fas fa-video"></i> \u0641\u064a\u062f\u064a\u0648</button>'
      +     '<div id="popup-media-preview" style="display:none;flex:1;max-width:180px;">'
      +       '<div style="display:flex;align-items:center;gap:5px;padding:3px 8px;background:rgba(37,211,102,0.07);border:1px solid rgba(37,211,102,0.2);border-radius:6px;">'
      +         '<i id="popup-media-icon" class="fas fa-file" style="font-size:11px;color:#25d366;flex-shrink:0;"></i>'
      +         '<div id="popup-media-name" style="font-size:9px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;"></div>'
      +         '<button type="button" onclick="clearPopupMedia(\'' + jid + '\')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:11px;"><i class="fas fa-times"></i></button>'
      +       '</div>'
      +     '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<button id="popup-mic-btn" style="display:none;"><span id="popup-mic-label"></span></button>'
      + '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    setTimeout(function() {
      var body = document.getElementById('popup-chat-body');
      if (body) body.scrollTop = body.scrollHeight;
    }, 80);
  }

  function onPopupMediaChange(jid, input) {
    var file = input.files && input.files[0];
    if (!file) return;
    _popupChatFiles[jid] = file;
    _popupChatRecorded[jid] = false;
    var preview = document.getElementById('popup-media-preview');
    var nameEl  = document.getElementById('popup-media-name');
    var iconEl  = document.getElementById('popup-media-icon');
    if (preview) preview.style.display = 'flex';
    if (nameEl) nameEl.textContent = file.name;
    if (iconEl) {
      if (file.type.startsWith('image/'))       iconEl.className = 'fas fa-image';
      else if (file.type.startsWith('audio/'))  iconEl.className = 'fas fa-music';
      else if (file.type.startsWith('video/'))  iconEl.className = 'fas fa-video';
      else                                       iconEl.className = 'fas fa-file';
    }
    updatePopupActionBtn(jid);
  }

  function clearPopupMedia(jid) {
    delete _popupChatFiles[jid];
    delete _popupChatRecorded[jid];
    var preview = document.getElementById('popup-media-preview');
    if (preview) preview.style.display = 'none';
    var fi = document.getElementById('popup-media-file');
    if (fi) fi.value = '';
    
    // Reset audio preview and show main input row
    var audioPreview = document.getElementById('popup-audio-preview');
    if (audioPreview) audioPreview.style.display = 'none';
    var inputRow = document.getElementById('popup-main-input-row');
    if (inputRow) inputRow.style.display = 'flex';
    
    // Stop audio player
    var player = document.getElementById('popup-audio-player');
    if (player) { player.pause(); player.src = ''; }
    var playBtn = document.getElementById('popup-audio-play-btn');
    if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
    var fill = document.getElementById('popup-audio-fill');
    if (fill) fill.style.width = '0%';

    updatePopupActionBtn(jid);
  }

  var _popupRecTimerInterval = null;
  var _popupRecSeconds = 0;
  var _popupWaveInterval = null;

  function _popupStartWaveform() {
    var bars = document.querySelectorAll('#popup-rec-bar .popup-wave-bar');
    _popupWaveInterval = setInterval(function() {
      bars.forEach(function(b) {
        var h = Math.floor(Math.random() * 20) + 4;
        b.style.height = h + 'px';
      });
    }, 120);
  }

  function _popupStopWaveform() {
    if (_popupWaveInterval) { clearInterval(_popupWaveInterval); _popupWaveInterval = null; }
    var bars = document.querySelectorAll('#popup-rec-bar .popup-wave-bar');
    bars.forEach(function(b) { b.style.height = '4px'; });
  }

  function _popupStartTimer() {
    _popupRecSeconds = 0;
    var timerEl = document.getElementById('popup-rec-timer');
    _popupRecTimerInterval = setInterval(function() {
      _popupRecSeconds++;
      var m = Math.floor(_popupRecSeconds / 60);
      var s = _popupRecSeconds % 60;
      if (timerEl) timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  function _popupStopTimer() {
    if (_popupRecTimerInterval) { clearInterval(_popupRecTimerInterval); _popupRecTimerInterval = null; }
  }

  function togglePopupAudioPreview(jid, platform) {
    var player = document.getElementById('popup-audio-player');
    var playBtn = document.getElementById('popup-audio-play-btn');
    var fill = document.getElementById('popup-audio-fill');
    var durEl = document.getElementById('popup-audio-dur');
    if (!player) return;
    if (player.paused) {
      player.play();
      if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      player.ontimeupdate = function() {
        if (player.duration) {
          var pct = (player.currentTime / player.duration) * 100;
          if (fill) fill.style.width = pct + '%';
          var s = Math.floor(player.currentTime);
          var m = Math.floor(s / 60); s = s % 60;
          if (durEl) durEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
        }
      };
      player.onended = function() {
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
        if (fill) fill.style.width = '0%';
      };
    } else {
      player.pause();
      if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
  }

  async function togglePopupRecording(jid) {
    if (!_popupChatRecorder) {
      // ── START RECORDING ──
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _popupChatChunks = [];
        _popupChatRecorder = new MediaRecorder(stream);
        _popupChatRecorder.ondataavailable = function(e) { _popupChatChunks.push(e.data); };
        _popupChatRecorder.onstop = function() {
          var blob = new Blob(_popupChatChunks, { type: 'audio/ogg; codecs=opus' });
          var file = new File([blob], 'voice_note.ogg', { type: 'audio/ogg' });
          _popupChatFiles[jid] = file;
          _popupChatRecorded[jid] = true;
          stream.getTracks().forEach(function(t) { t.stop(); });
          _popupStopWaveform();
          _popupStopTimer();
          // hide rec bar, show audio preview
          var recBar = document.getElementById('popup-rec-bar');
          var inputRow = document.getElementById('popup-main-input-row');
          var audioPreview = document.getElementById('popup-audio-preview');
          if (recBar) recBar.style.display = 'none';
          if (inputRow) inputRow.style.display = 'none';
          if (audioPreview) {
            audioPreview.style.display = 'flex';
            var player = document.getElementById('popup-audio-player');
            var durEl = document.getElementById('popup-audio-dur');
            var fill = document.getElementById('popup-audio-fill');
            if (player) {
              var url = URL.createObjectURL(blob);
              player.src = url;
              player.onloadedmetadata = function() {
                var total = Math.floor(player.duration);
                var m = Math.floor(total / 60); var s = total % 60;
                if (durEl) durEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
              };
              if (fill) fill.style.width = '0%';
            }
          }
          updatePopupActionBtn(jid);
        };
        _popupChatRecorder.start();
        // show rec bar, hide input row
        var recBar = document.getElementById('popup-rec-bar');
        var inputRow = document.getElementById('popup-main-input-row');
        var audioPreview = document.getElementById('popup-audio-preview');
        if (recBar) recBar.style.display = 'flex';
        if (inputRow) inputRow.style.display = 'none';
        if (audioPreview) audioPreview.style.display = 'none';
        _popupStartWaveform();
        _popupStartTimer();
        updatePopupActionBtn(jid);
      } catch (e) {
        showToast('\u274c \u0641\u0634\u0644 \u062a\u0641\u0639\u064a\u0644 \u0627\u0644\u0645\u064a\u0643\u0631\u0648\u0641\u0648\u0646', 'error');
      }
    } else {
      // ── STOP RECORDING ──
      _popupChatRecorder.stop();
      _popupChatRecorder = null;
    }
  }

  async function sendPopupChatMsg(jid, platform, name) {
    var input = document.getElementById('popup-chat-input');
    var text  = input ? input.value.trim() : '';
    var file  = _popupChatFiles[jid];

    if (!text && !file) {
      showToast('\u26a0\ufe0f \u0627\u0643\u062a\u0628 \u0631\u0633\u0627\u0644\u0629 \u0623\u0648 \u0627\u0631\u0641\u0642 \u0645\u0644\u0641\u0627\u064b \u0623\u0648\u0644\u0627\u064b', 'error');
      return;
    }

    var btn = document.getElementById('popup-send-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
      var body = { jid: jid, platform: platform, message: text };

      if (file) {
        var b64 = await fileToBase64(file);
        body.mediaBase64 = b64;
        body.mediaType   = file.type;
        body.mediaName   = file.name;
        body.ptt         = !!_popupChatRecorded[jid];
      }

      var res  = await fetch('/api/profanity/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await res.json();

      if (data.ok) {
        showToast('\u2705 \u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0628\u0646\u062c\u0627\u062d!', 'success');

        if (input) input.value = '';
        clearPopupMedia(jid);

        // Reload dev messages cache and re-open modal to render playable player
        await loadDevMessages();
        openProfanityMsgModal(jid, platform, name);
      } else {
        showToast('\u274c \u0641\u0634\u0644: ' + (data.error || '\u062e\u0637\u0623 \u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641'), 'error');
      }
    } catch (e) {
      showToast('\u274c \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644: ' + e.message, 'error');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i>'; }
  }


  async function banProfanityUser(jid) {
    if (!await showConfirm(`حظر هذا المستخدم فوراً؟<br><small style="color:var(--text-muted);font-family:monospace;">${jid}</small>`)) return;
    try {
      // Determine platform key from jid format
      let number = jid, platform = 'whatsapp';
      if (jid.startsWith('tg:')) { number = jid.replace('tg:', ''); platform = 'telegram'; }
      else if (jid.startsWith('fb:')) { number = jid.replace('fb:', ''); platform = 'facebook'; }
      else if (jid.includes('@')) { number = jid.split('@')[0]; }
      const res = await fetch('/api/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number, platform }) });
      const data = await res.json();
      if (data.ok) { showToast('🚫 تم حظر المستخدم', 'success'); await loadProfanityLogs(); }
      else showToast('❌ فشل: ' + data.error, 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function resetProfanityWarnings(jid) {
    if (!await showConfirm(`إعادة ضبط تحذيرات هذا المستخدم؟<br><small style="color:var(--text-muted);font-family:monospace;">${jid}</small>`)) return;
    try {
      const res = await fetch('/api/profanity/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jid }) });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم إعادة ضبط التحذيرات', 'success'); await loadProfanityLogs(); }
      else showToast('❌ فشل: ' + data.error, 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function unbanProfanityUser(jid) {
    let number = jid, platform = 'whatsapp';
    if (jid.startsWith('tg:')) { number = jid.replace('tg:', ''); platform = 'telegram'; }
    else if (jid.startsWith('fb:')) { number = jid.replace('fb:', ''); platform = 'facebook'; }
    else if (jid.includes('@')) { number = jid.split('@')[0]; }
    if (!await showConfirm(`هل تريد رفع الحظر عن هذا المستخدم؟<br><small style="color:var(--text-muted);font-family:monospace;">${jid}</small>`)) return;
    try {
      const res = await fetch('/api/unban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number, platform }) });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم رفع الحظر', 'success'); await loadProfanityLogs(); }
      else showToast('❌ فشل: ' + data.error, 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function loadProfanityLogs() {
    const listEl = document.getElementById('profanity-list');
    const countEl = document.getElementById('profanity-count');
    if (!listEl) return;
    listEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size:28px;margin-bottom:10px;display:block;"></i>جاري التحميل...</div>`;
    try {
      const res = await fetch('/api/profanity-logs');
      const data = await res.json();
      const logs = data.logs || [];
      const banned = data.banned || [];
      window.profanityLogsCache = logs;
      if (countEl) countEl.textContent = `(${logs.length} مخالفة)`;
      if (logs.length === 0) {
        listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:40px;"><i class="fas fa-shield-alt" style="font-size:40px;margin-bottom:12px;display:block;opacity:0.3;"></i>لا توجد مخالفات مسجلة حالياً. ✅</div>`;
        return;
      }
      // Group by JID
      const grouped = {};
      for (const log of logs) {
        if (!grouped[log.jid]) grouped[log.jid] = { ...log, count: 0 };
        grouped[log.jid].count++;
        if (new Date(log.timestamp) >= new Date(grouped[log.jid].timestamp)) {
          grouped[log.jid].warnings_left = log.warnings_left;
          grouped[log.jid].timestamp = log.timestamp;
        }
      }
      const users = Object.values(grouped);
      const platformIcon = { WA: '🟢', TG: '✈️', FB: '🔵' };
      const platformLabel = { WA: 'واتساب', TG: 'تيليغرام', FB: 'فيسبوك' };
      const platKey = { WA: 'WA', TG: 'TG', FB: 'FB' };
      listEl.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border);">
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">المنصة</th>
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">المستخدم</th>
                <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">الحالة</th>
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">الكلمة</th>
                <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">مخالفات</th>
                <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">تحذيرات</th>
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">آخر مخالفة</th>
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;min-width:260px;">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const isBanned = banned.includes(u.jid);
                const wLeft = u.warnings_left;
                const wColor = isBanned ? '#fc8181' : (wLeft === 1 ? '#f6a623' : '#68d391');
                const wLabel = isBanned ? '🚫 محظور' : `${wLeft <= 0 ? 3 : wLeft} / 3`;
                const ts = new Date(u.timestamp).toLocaleString('ar-MA');
                const pkey = u.platform;
                const safeName = (u.name || 'مستخدم').replace(/'/g, "\\'");
                return `
                  <tr style="border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
                    <td style="padding:10px 12px;white-space:nowrap;">${platformIcon[pkey] || '❓'} ${platformLabel[pkey] || pkey}</td>
                    <td style="padding:10px 12px;font-size:12px;max-width:150px;">
                      <div style="font-weight:600;">${u.name || '—'}</div>
                      <div style="color:var(--text-muted);font-size:10px;font-family:monospace;word-break:break-all;">${u.jid}</div>
                    </td>
                    <td style="padding:10px 12px;text-align:center;">
                      ${isBanned
                        ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(252,129,129,0.15);color:#fc8181;border:1px solid rgba(252,129,129,0.4);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">🚫 محظور</span>`
                        : `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(104,211,145,0.12);color:#68d391;border:1px solid rgba(104,211,145,0.35);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">✅ نشط</span>`
                      }
                    </td>
                    <td style="padding:10px 12px;"><code style="background:rgba(252,129,129,0.12);color:#fc8181;padding:2px 7px;border-radius:4px;">${u.bad_word}</code></td>
                    <td style="padding:10px 12px;text-align:center;font-weight:700;color:var(--purple);">${u.count}</td>
                    <td style="padding:10px 12px;text-align:center;font-weight:700;color:${wColor};">${wLabel}</td>
                    <td style="padding:10px 12px;color:var(--text-muted);font-size:11px;white-space:nowrap;">${ts}</td>
                    <td style="padding:10px 12px;">
                      <div style="display:flex;gap:5px;flex-wrap:wrap;">
                        <button onclick="openProfanityMsgModal('${u.jid}','${pkey}','${safeName}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(99,179,237,0.4);background:rgba(99,179,237,0.08);color:#63b3ed;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="إرسال رسالة أو صورة">
                          <i class="fas fa-paper-plane"></i> رسالة
                        </button>
                        <button onclick="resetProfanityWarnings('${u.jid}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(104,211,145,0.4);background:rgba(104,211,145,0.08);color:#68d391;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="إعادة ضبط التحذيرات">
                          <i class="fas fa-redo"></i> إعادة ضبط
                        </button>
                         <button onclick="banProfanityUser('${u.jid}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(252,129,129,0.4);background:rgba(252,129,129,0.08);color:#fc8181;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="حظر المستخدم"><i class="fas fa-ban"></i> حظر</button>
                         <button onclick="unbanProfanityUser('${u.jid}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(246,224,94,0.4);background:rgba(246,224,94,0.08);color:#f6e05e;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="رفع الحظر"><i class="fas fa-unlock"></i> رفع حظر</button>
                       </div>
                     </td>
                   </tr>`
               }).join('')}
             </tbody>
           </table>
         </div>
       </div>
     </div>`;
    } catch(e) {
      listEl.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px;font-size:12px;">خطأ: ${e.message}</div>`;
    }
  }

  async function toggleProfanityMonitor(enabled) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profanityMonitorOnly: enabled ? 'true' : 'false' })
      });
      const data = await res.json();
      if (data.success) showToast(enabled ? '👁️ وضع المراقبة فقط — لن يتلقى المستخدمون تحذيرات أو حظر' : '✅ العودة للوضع العادي — التحذيرات والحظر مفعّلان', enabled ? 'warning' : 'success');
      else showToast('❌ فشل الحفظ', 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function toggleIbhayaMonitor(enabled) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ibhayaMonitorOnly: enabled ? 'true' : 'false' })
      });
      const data = await res.json();
      if (data.success) showToast(enabled ? '👁️ وضع المراقبة فقط — لن يتلقى المستخدمون تحذيرات أو حظر' : '✅ العودة للوضع العادي — التحذيرات والحظر مفعّلان', enabled ? 'warning' : 'success');
      else showToast('❌ فشل الحفظ', 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function toggleProfanityFeature(enabled) {

    const label = document.getElementById('profanity-status-label');
    if (label) label.textContent = enabled ? '🟢 مفعّل' : '🔴 معطَّل';
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enableProfanity: enabled ? 'true' : 'false' })
      });
      const data = await res.json();
      if (data.success) showToast(enabled ? '✅ تم تفعيل الكشف عن الألفاظ النابية' : '⛔ تم تعطيل الكشف عن الألفاظ النابية', enabled ? 'success' : 'warning');
      else showToast('❌ فشل الحفظ', 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function toggleIbhayaFeature(enabled) {
    const label = document.getElementById('ibhaya-status-label');
    if (label) label.textContent = enabled ? '🟢 مفعّل' : '🔴 معطَّل';
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enableIbhaya: enabled ? 'true' : 'false' })
      });
      const data = await res.json();
      if (data.success) showToast(enabled ? '✅ تم تفعيل الكشف عن المحتوى الإباحي' : '⛔ تم تعطيل الكشف عن المحتوى الإباحي', enabled ? 'success' : 'warning');
      else showToast('❌ فشل الحفظ', 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function sendProfanityWarn(jid, warningsLeft) {

    const remaining = typeof warningsLeft === 'number' ? warningsLeft : '?';
    if (!await showConfirm(`⚠️ <b>إرسال تحذير تلقائي لهذا المستخدم؟</b><br><br>سيتلقى رسالة تخبره أن لديه ${remaining} تحذير متبقٍ قبل الحظر بسبب الكلام غير اللائق.<br><br><small style="color:var(--text-muted);font-family:monospace;">${jid}</small>`)) return;
    try {
      const btn = event.target.closest('button');
      const origText = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
      const res = await fetch('/api/profanity/warn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid, warnings_left: remaining })
      });
      const data = await res.json();
      if (btn) { btn.disabled = false; btn.innerHTML = origText; }
      if (data.ok && data.sent) {
        showToast('✅ تم إرسال التحذير بنجاح!', 'success');
      } else if (data.ok && !data.sent) {
        showToast('⚠️ تم طلب الإرسال لكن البوت غير متصل', 'warning');
      } else {
        showToast('❌ فشل: ' + (data.error || 'خطأ غير معروف'), 'error');
      }
    } catch (e) {
      showToast('❌ خطأ في الاتصال: ' + e.message, 'error');
    }
  }

  // =================== IBHAYA VIOLATORS PAGE ===================

  async function loadIbhayaWords() {
    const listEl = document.getElementById('ibhaya-words-list');
    const countEl = document.getElementById('ibhaya-words-count');
    if (!listEl) return;
    try {
      const res = await fetch('/api/ibhaya-words');
      const data = await res.json();
      const words = data.words || [];
      if (countEl) countEl.textContent = `(${words.length} كلمة)`;
      listEl.innerHTML = words.map(w =>
        `<code style="background:rgba(229,62,62,0.1);color:#e53e3e;padding:3px 8px;border-radius:6px;font-size:11px;">${escapeHtml(w)}</code>`
      ).join('');
    } catch (e) {
      listEl.innerHTML = `<span style="color:var(--red);font-size:12px;">خطأ: ${e.message}</span>`;
    }
  }

  async function resetIbhayaWarnings(jid) {
    if (!await showConfirm(`إعادة ضبط تحذيرات الإباحية لهذا المستخدم؟<br><small style="color:var(--text-muted);font-family:monospace;">${jid}</small>`)) return;
    try {
      const res = await fetch('/api/ibhaya/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jid }) });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم إعادة ضبط التحذيرات', 'success'); await loadIbhayaLogs(); }
      else showToast('❌ فشل: ' + data.error, 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function sendIbhayaWarn(jid, warningsLeft) {
    const remaining = typeof warningsLeft === 'number' ? warningsLeft : '?';
    if (!await showConfirm(`⚠️ <b>إرسال تحذير تلقائي لهذا المستخدم؟</b><br><br>سيتلقى رسالة تخبره أن لديه ${remaining} تحذير متبقٍ قبل الحظر.<br><br><small style="color:var(--text-muted);font-family:monospace;">${jid}</small>`)) return;
    try {
      const btn = event.target.closest('button');
      const origText = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
      const res = await fetch('/api/ibhaya/warn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid, warnings_left: remaining })
      });
      const data = await res.json();
      if (btn) { btn.disabled = false; btn.innerHTML = origText; }
      if (data.ok && data.sent) {
        showToast('✅ تم إرسال التحذير بنجاح!', 'success');
      } else if (data.ok && !data.sent) {
        showToast('⚠️ تم طلب الإرسال لكن البوت غير متصل', 'warning');
      } else {
        showToast('❌ فشل: ' + (data.error || 'خطأ غير معروف'), 'error');
      }
    } catch (e) {
      showToast('❌ خطأ في الاتصال: ' + e.message, 'error');
    }
  }

  async function banIbhayaUser(jid) {
    if (!await showConfirm(`حظر هذا المستخدم فوراً؟<br><small style="color:var(--text-muted);font-family:monospace;">${jid}</small>`)) return;
    try {
      const res = await fetch('/api/ibhaya/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jid }) });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم الحظر', 'success'); await loadIbhayaLogs(); }
      else showToast('❌ فشل: ' + data.error, 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function unbanIbhayaUser(jid) {
    let number = jid, platform = 'whatsapp';
    if (jid.startsWith('tg:')) { number = jid.replace('tg:', ''); platform = 'telegram'; }
    else if (jid.startsWith('fb:')) { number = jid.replace('fb:', ''); platform = 'facebook'; }
    else if (jid.includes('@')) { number = jid.split('@')[0]; }
    if (!await showConfirm(`رفع الحظر عن هذا المستخدم؟<br><small style="color:var(--text-muted);font-family:monospace;">${jid}</small>`)) return;
    try {
      const res = await fetch('/api/unban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number, platform }) });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم رفع الحظر', 'success'); await loadIbhayaLogs(); }
      else showToast('❌ فشل: ' + data.error, 'error');
    } catch (e) { showToast('❌ خطأ في الاتصال', 'error'); }
  }

  async function loadIbhayaLogs() {
    const listEl = document.getElementById('ibhaya-list');
    const countEl = document.getElementById('ibhaya-count');
    if (!listEl) return;
    listEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size:28px;margin-bottom:10px;display:block;"></i>جاري التحميل...</div>`;
    try {
      const res = await fetch('/api/ibhaya-logs');
      const data = await res.json();
      const logs = data.logs || [];
      const banned = data.banned || [];
      window.ibhayaLogsCache = logs;
      if (countEl) countEl.textContent = `(${logs.length} مخالفة)`;
      if (logs.length === 0) {
        listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:40px;"><i class="fas fa-shield-alt" style="font-size:40px;margin-bottom:12px;display:block;opacity:0.3;"></i>لا توجد مخالفات مسجلة حالياً. ✅</div>`;
        return;
      }
      const grouped = {};
      for (const log of logs) {
        if (!grouped[log.jid]) grouped[log.jid] = { ...log, count: 0 };
        grouped[log.jid].count++;
        if (new Date(log.timestamp) >= new Date(grouped[log.jid].timestamp)) {
          grouped[log.jid].warnings_left = log.warnings_left;
          grouped[log.jid].timestamp = log.timestamp;
        }
      }
      const users = Object.values(grouped);
      const platformIcon = { WA: '🟢', TG: '✈️', FB: '🔵' };
      const platformLabel = { WA: 'واتساب', TG: 'تيليغرام', FB: 'فيسبوك' };
      listEl.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border);">
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">المنصة</th>
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">المستخدم</th>
                <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">الحالة</th>
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">الكلمة</th>
                <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">مخالفات</th>
                <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">تحذيرات</th>
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">آخر مخالفة</th>
                <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;min-width:260px;">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const isBanned = banned.includes(u.jid);
                const wLeft = u.warnings_left;
                const wColor = isBanned ? '#fc8181' : (wLeft === 1 ? '#f6a623' : '#68d391');
                const wLabel = isBanned ? '🚫 محظور' : `${wLeft <= 0 ? 3 : wLeft} / 3`;
                const ts = new Date(u.timestamp).toLocaleString('ar-MA');
                const pkey = u.platform;
                const safeName = (u.name || 'مستخدم').replace(/'/g, "\\'");
                return `
                  <tr style="border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
                    <td style="padding:10px 12px;white-space:nowrap;">${platformIcon[pkey] || '❓'} ${platformLabel[pkey] || pkey}</td>
                    <td style="padding:10px 12px;font-size:12px;max-width:150px;">
                      <div style="font-weight:600;">${escapeHtml(u.name || '—')}</div>
                      <div style="color:var(--text-muted);font-size:10px;font-family:monospace;word-break:break-all;">${u.jid}</div>
                    </td>
                    <td style="padding:10px 12px;text-align:center;">
                      ${isBanned
                        ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(252,129,129,0.15);color:#fc8181;border:1px solid rgba(252,129,129,0.4);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">🚫 محظور</span>`
                        : `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(104,211,145,0.12);color:#68d391;border:1px solid rgba(104,211,145,0.35);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">✅ نشط</span>`
                      }
                    </td>
                    <td style="padding:10px 12px;"><code style="background:rgba(229,62,62,0.12);color:#e53e3e;padding:2px 7px;border-radius:4px;">${escapeHtml(u.bad_word || '')}</code></td>
                    <td style="padding:10px 12px;text-align:center;font-weight:700;color:var(--purple);">${u.count}</td>
                    <td style="padding:10px 12px;text-align:center;font-weight:700;color:${wColor};">${wLabel}</td>
                    <td style="padding:10px 12px;color:var(--text-muted);font-size:11px;white-space:nowrap;">${ts}</td>
                    <td style="padding:10px 12px;">
                      <div style="display:flex;gap:5px;flex-wrap:wrap;">
                        <button onclick="speakText('${(u.message||u.bad_word||'').replace(/'/g,'')}','ar')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(37,211,102,0.4);background:rgba(37,211,102,0.08);color:#25d366;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="استمع للرسالة">
                          🔊 استمع
                        </button>
                        <button onclick="openProfanityMsgModal('${u.jid}','${pkey}','${safeName}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(99,179,237,0.4);background:rgba(99,179,237,0.08);color:#63b3ed;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="إرسال رسالة">
                          <i class="fas fa-paper-plane"></i> رسالة
                        </button>
                        <button onclick="sendIbhayaWarn('${u.jid}', ${u.warnings_left !== undefined ? u.warnings_left : 2})" style="padding:4px 9px;font-size:11px;border:1px solid rgba(246,173,85,0.5);background:rgba(246,173,85,0.1);color:#f6a44e;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="إرسال تحذير تلقائي للمستخدم">
                          ⚠️ تحذير (${u.warnings_left !== undefined ? u.warnings_left : '?'})
                        </button>
                        <button onclick="resetIbhayaWarnings('${u.jid}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(104,211,145,0.4);background:rgba(104,211,145,0.08);color:#68d391;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="إعادة ضبط التحذيرات">
                          <i class="fas fa-redo"></i> إعادة ضبط
                        </button>
                        <button onclick="banIbhayaUser('${u.jid}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(252,129,129,0.4);background:rgba(252,129,129,0.08);color:#fc8181;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="حظر المستخدم"><i class="fas fa-ban"></i> حظر</button>
                        <button onclick="unbanIbhayaUser('${u.jid}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(246,224,94,0.4);background:rgba(246,224,94,0.08);color:#f6e05e;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="رفع الحظر"><i class="fas fa-unlock"></i> رفع حظر</button>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    } catch(e) {
      listEl.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px;font-size:12px;">خطأ: ${e.message}</div>`;
    }
  }

  // =================== DEV MESSAGES CHAT INBOX ===================
  window.activeDevMsgJid = null;
  window.devMessagesCache = [];

  async function loadDevMessages() {
    const listEl = document.getElementById('chats-list-container');
    const countEl = document.getElementById('devmsg-count');

    try {
      const res = await fetch('/api/dev-messages');
      const data = await res.json();
      if (!data.ok || !data.messages) {
        if (listEl) listEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--red); font-size:12px;">فشل التحميل</div>`;
        return;
      }

      window.devMessagesCache = data.messages;
      if (!listEl) return;

      const messages = data.messages;

      // Group messages by sender
      const conversations = {};
      for (const m of messages) {
        const sender = m.sender;
        if (!conversations[sender]) {
          conversations[sender] = {
            sender: sender,
            senderName: m.senderName || sender,
            platform: m.platform || 'whatsapp',
            messages: [],
            latestTimestamp: m.timestamp
          };
        }
        conversations[sender].messages.push(m);
        
        const msgTime = new Date(m.timestamp).getTime();
        const convTime = new Date(conversations[sender].latestTimestamp).getTime();
        if (msgTime > convTime) {
          conversations[sender].latestTimestamp = m.timestamp;
        }
      }

      let convList = Object.values(conversations);

      // Filter unanswered if requested
      if (_devMsgFilter === 'unanswered') {
        convList = convList.filter(c => c.messages.some(m => !m.replied));
      }

      // Sort chats by latest active message timestamp descending
      convList.sort((a, b) => new Date(b.latestTimestamp) - new Date(a.latestTimestamp));

      const unansweredCount = Object.values(conversations).filter(c => c.messages.some(m => !m.replied)).length;
      if (countEl) {
        countEl.textContent = unansweredCount > 0 ? `(${unansweredCount} غير مقروء)` : `(${convList.length})`;
      }

      if (convList.length === 0) {
        listEl.innerHTML = `
          <div style="text-align:center; padding:40px; color:var(--text-muted); font-size:12px;">
            <i class="fas fa-inbox" style="font-size:32px; margin-bottom:12px; opacity:0.3;"></i>
            لا توجد محادثات نشطة.
          </div>`;
        return;
      }

      const platformIcon = { 
        whatsapp: 'fab fa-whatsapp', telegram: 'fab fa-telegram-plane', facebook: 'fab fa-facebook-messenger',
        wa: 'fab fa-whatsapp', tg: 'fab fa-telegram-plane', fb: 'fab fa-facebook-messenger'
      };
      const platformColor = { 
        whatsapp: '#25d366', telegram: '#38bdf8', facebook: '#0084ff',
        wa: '#25d366', tg: '#38bdf8', fb: '#0084ff'
      };

      listEl.innerHTML = convList.map(c => {
        const plat = (c.platform || 'whatsapp').toLowerCase();
        const pIcon = platformIcon[plat] || 'fas fa-envelope';
        const pColor = platformColor[plat] || 'var(--text-muted)';
        
        // Get the absolute latest message text snippet
        const sorted = [...c.messages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const latestMsg = sorted[0];
        let snippet = '[ملف مرفق]';
        if (latestMsg.text) {
          snippet = latestMsg.text.length > 50 ? latestMsg.text.substring(0, 50) + '...' : latestMsg.text;
        } else if (latestMsg.replyText) {
          try {
            const parsed = JSON.parse(latestMsg.replyText);
            snippet = `الرد: ${parsed.text ? (parsed.text.length > 50 ? parsed.text.substring(0, 50) + '...' : parsed.text) : '[ملف صادر]'}`;
          } catch(e) {
            snippet = `الرد: ${latestMsg.replyText.length > 50 ? latestMsg.replyText.substring(0, 50) + '...' : latestMsg.replyText}`;
          }
        }
        const timeStr = c.latestTimestamp ? new Date(c.latestTimestamp).toLocaleDateString('ar-MA', {month:'numeric', day:'numeric'}) : '';
        const isUnread = c.messages.some(m => !m.replied);

        return `
          <div class="chat-list-item" data-jid="${c.sender}" style="display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px; background:var(--card); border:1px solid var(--border); border-radius:12px; transition:all 0.2s;">
            <div style="display:flex; align-items:center; gap:14px; flex:1; min-width:0; direction:rtl;">
              <div style="width:40px; height:40px; border-radius:50%; background:${pColor}18; display:flex; align-items:center; justify-content:center; color:${pColor}; font-size:18px; flex-shrink:0;">
                <i class="${pIcon}"></i>
              </div>
              <div style="flex:1; min-width:0; text-align:right;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                  <span class="chat-item-name" style="font-weight:700; font-size:14px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.senderName || c.sender}</span>
                  ${isUnread ? `<span style="background:rgba(239, 68, 68, 0.12); color:#fc8181; border:1px solid rgba(239, 68, 68, 0.25); font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; margin-right:4px;">لم يتم الرد</span>` : ''}
                  <span style="font-size:10px; color:var(--text-muted); margin-right:auto; direction:ltr;">${timeStr}</span>
                </div>
                <div style="color:var(--text-muted); font-size:11px; font-family:monospace; margin-bottom:4px;">${c.sender}</div>
                <div style="font-size:12px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:90%;">${snippet}</div>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:8px;">
              <button onclick="openDevMsgChatModal('${c.sender}')" class="btn btn-primary" style="padding:6px 14px; font-size:12px; font-family:Cairo,sans-serif; white-space:nowrap;">
                <i class="fas fa-reply"></i> رد
              </button>
            </div>
            <div class="chat-item-jid" style="display:none;">${c.sender}</div>
          </div>`;
      }).join('');

      // Auto-open/reload the active conversation if set
      if (window.activeDevMsgJid) {
        updateActiveConversationMessages(window.activeDevMsgJid);
      }

    } catch(e) {
      listEl.innerHTML = `<div style="color:var(--red); text-align:center; padding:20px; font-size:12px;">خطأ: ${e.message}</div>`;
    }
  }

  // Helper to dynamically update messages in an open chat modal without losing textarea focus/values
  function updateActiveConversationMessages(senderJid) {
    const chatBody = document.getElementById('chat-body-container');
    if (!chatBody) {
      // If modal container is open but conversation is not rendered, render full layout
      openConversation(senderJid);
      return;
    }

    const chats = window.devMessagesCache || [];
    const convMsgs = chats
      .filter(m => m.sender === senderJid)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const newHtml = convMsgs.map(m => {
      const dateStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('ar-MA', {hour: '2-digit', minute:'2-digit'}) : '';

      // Standalone violation block
      if (m.isViolation || (m.text && (m.text.includes('⚠️ [مخالفة سب وشتم]') || m.text.includes('⚠️ [مخالفة إباحية]')))) {
        const safeViolId = (m.id || m.timestamp || '').toString().replace(/'/g, '');
        return `
          <div style="display:flex; flex-direction:column; align-items:flex-start; max-width:82%; align-self:flex-start; margin-bottom:10px; position:relative;" class="violation-bubble-wrap">
            <div style="font-size:9px; color:var(--red); margin-bottom:4px; direction:rtl; font-weight:700; padding-left:4px;">
              ${m.senderName || 'مستخدم'} · ${dateStr} (مخالفة)
            </div>
            <div style="position:relative; width:100%;">
              <div style="background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.25); border-radius:18px 18px 18px 4px; padding:10px 14px; font-size:13px; color:#fc8181; line-height:1.6; white-space:pre-wrap; word-break:break-word; direction:rtl; text-align:right; box-shadow: 0 2px 6px rgba(239,68,68,0.08);">
                ${escapeHtml(m.text || '')}
              </div>
              <button onclick="event.stopPropagation(); deleteDevMsg('${safeViolId}')" style="position:absolute; top:-8px; left:-8px; width:20px; height:20px; border-radius:50%; background:var(--bg); border:1px solid rgba(239,68,68,0.5); color:var(--red); font-size:10px; cursor:pointer; display:none; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3);" class="delete-msg-btn" title="حذف المخالفة">✕</button>
            </div>
          </div>`;
      }

      // Standalone dev reply row
      if (!m.text && m.replied && m.replyText) {
        const rt = m.replyTimestamp ? new Date(m.replyTimestamp).toLocaleTimeString('ar-MA', {hour:'2-digit',minute:'2-digit'}) : dateStr;
        return `<div style="display:flex; flex-direction:column; align-items:flex-end; max-width:82%; align-self:flex-end; margin-bottom:4px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:9px; color:var(--text-muted); direction:rtl; padding-right:4px;">
            <span style="font-weight:700; color:var(--accent);">المطور</span>
            <span style="opacity:0.5;">·</span>
            <span>${rt}</span>
          </div>
          <div style="background:linear-gradient(135deg, rgba(37,211,102,0.16) 0%, rgba(18,140,126,0.06) 100%); border:1px solid rgba(37,211,102,0.22); border-radius:18px 18px 4px 18px; padding:10px 14px; font-size:13px; color:var(--text-main); line-height:1.6; white-space:pre-wrap; word-break:break-word; direction:rtl; text-align:right; box-shadow:0 2px 8px rgba(37,211,102,0.06);">
            ${formatMessageContent(m.replyText)}
          </div>
        </div>`;
      }

      const safeUserText = (m.text || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
      const userBubble = m.text ? `
        <div style="display:flex; flex-direction:column; align-items:flex-start; max-width:82%; align-self:flex-start; position:relative; margin-bottom: 4px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:9px; color:var(--text-muted); direction:rtl; padding-left: 4px;">
            <span style="font-weight:700;">${m.senderName || 'مستخدم'}</span>
            <span style="opacity:0.5;">·</span>
            <span>${dateStr}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:18px 18px 18px 4px; padding:10px 14px; font-size:13px; color:var(--text-main); line-height:1.6; white-space:pre-wrap; word-break:break-word; position:relative; direction:rtl; text-align:right; box-shadow:0 2px 6px rgba(0,0,0,0.15);">
              ${formatMessageContent(m.text)}
              <button onclick="event.stopPropagation(); deleteDevMsg('${m.id}')" style="position:absolute; top:-8px; left:-8px; width:20px; height:20px; border-radius:50%; background:var(--bg); border:1px solid var(--border); color:var(--red); font-size:10px; cursor:pointer; display:none; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3);" class="delete-msg-btn" title="حذف الرسالة">✕</button>
            </div>
            <button class="tts-speak-btn" onclick="speakText('${safeUserText}','ar')" title="استمع" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;border:none;background:rgba(37,211,102,0.1);color:#25d366;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔊</button>
          </div>
        </div>` : '';

      const safeReplyTxt = (m.replyText || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
      const replyBubble = m.text && m.replied && m.replyText ? `
        <div style="display:flex; flex-direction:column; align-items:flex-end; max-width:82%; align-self:flex-end; margin-bottom: 4px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:9px; color:var(--text-muted); direction:rtl; padding-right: 4px;">
            <span style="font-weight:700; color:var(--accent);">المطور</span>
            <span style="opacity:0.5;">·</span>
            <span>${m.replyTimestamp ? new Date(m.replyTimestamp).toLocaleTimeString('ar-MA', {hour:'2-digit',minute:'2-digit'}) : ''}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-direction:row-reverse;">
            <div style="background:linear-gradient(135deg,rgba(37,211,102,0.16),rgba(18,140,126,0.06)); border:1px solid rgba(37,211,102,0.22); border-radius:18px 18px 4px 18px; padding:10px 14px; font-size:13px; color:var(--text-main); line-height:1.6; white-space:pre-wrap; word-break:break-word; direction:rtl; text-align:right; box-shadow:0 2px 8px rgba(37,211,102,0.06);">
              ${formatMessageContent(m.replyText)}
            </div>
            <button class="tts-speak-btn" onclick="speakText('${safeReplyTxt}','ar')" title="استمع" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;border:none;background:rgba(56,189,248,0.1);color:#38bdf8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔊</button>
          </div>
        </div>` : '';

      return userBubble + replyBubble;
    }).join('');

    if (chatBody.innerHTML !== newHtml) {
      chatBody.innerHTML = newHtml;
      chatBody.scrollTop = chatBody.scrollHeight;

      // Re-apply hover styles to show delete buttons on new bubbles
      const bubbles = chatBody.querySelectorAll(':scope > div');
      bubbles.forEach(b => {
        b.addEventListener('mouseenter', () => {
          const delBtn = b.querySelector('.delete-msg-btn');
          if (delBtn) delBtn.style.display = 'flex';
        });
        b.addEventListener('mouseleave', () => {
          const delBtn = b.querySelector('.delete-msg-btn');
          if (delBtn) delBtn.style.display = 'none';
        });
      });
    }
  }

  let _devMessagesPollInterval = null;

  function startDevMessagesPolling() {
    stopDevMessagesPolling();
    // Poll every 3 seconds to fetch new user messages dynamically
    _devMessagesPollInterval = setInterval(async () => {
      const activePage = localStorage.getItem('active_page');
      if (activePage === 'devmessages') {
        await loadDevMessages();
      } else {
        stopDevMessagesPolling();
      }
    }, 3000);
  }

  function stopDevMessagesPolling() {
    if (_devMessagesPollInterval) {
      clearInterval(_devMessagesPollInterval);
      _devMessagesPollInterval = null;
    }
  }

  function filterChatsList() {
    const q = document.getElementById('devmsg-search')?.value?.trim()?.toLowerCase() || '';
    const items = document.querySelectorAll('.chat-list-item');
    items.forEach(item => {
      const name = item.querySelector('.chat-item-name')?.textContent?.toLowerCase() || '';
      const jid = item.querySelector('.chat-item-jid')?.textContent?.toLowerCase() || '';
      if (name.includes(q) || jid.includes(q)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  function openDevMsgChatModal(senderJid) {
    const modal = document.getElementById('devmsg-chat-modal');
    if (modal) {
      modal.style.display = 'flex';
      openConversation(senderJid);
    }
  }

  function closeDevMsgModal() {
    const modal = document.getElementById('devmsg-chat-modal');
    if (modal) {
      modal.style.display = 'none';
      window.activeDevMsgJid = null;
    }
  }

  // ── WhatsApp Style Attachments Helpers ──
  if (!document.getElementById('attach-menu-styles')) {
    const style = document.createElement('style');
    style.id = 'attach-menu-styles';
    style.innerHTML = `
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .attach-menu-popover button:hover {
        background: rgba(255,255,255,0.08) !important;
      }
    `;
    document.head.appendChild(style);
  }

  window.toggleAttachmentMenu = function(jid, event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('attach-menu-' + jid);
    const icon = document.getElementById('attach-icon-' + jid);
    if (!menu) return;
    const isHidden = menu.style.display === 'none';
    
    // Close other attachment menus
    document.querySelectorAll('.attach-menu-popover').forEach(m => m.style.display = 'none');
    document.querySelectorAll('[id^="attach-icon-"]').forEach(i => i.style.transform = 'rotate(0deg)');

    if (isHidden) {
      menu.style.display = 'flex';
      if (icon) icon.style.transform = 'rotate(45deg)';
    } else {
      menu.style.display = 'none';
      if (icon) icon.style.transform = 'rotate(0deg)';
    }
  };

  window.selectAttachmentOption = function(jid, type) {
    const menu = document.getElementById('attach-menu-' + jid);
    const icon = document.getElementById('attach-icon-' + jid);
    if (menu) menu.style.display = 'none';
    if (icon) icon.style.transform = 'rotate(0deg)';
    
    let fileInput;
    if (type === 'image') {
      fileInput = document.getElementById('devreply-media-file-image-' + jid);
    } else if (type === 'audio') {
      fileInput = document.getElementById('devreply-media-file-audio-' + jid);
    } else {
      fileInput = document.getElementById('devreply-media-file-doc-' + jid);
    }
    if (fileInput) fileInput.click();
  };

  // Close when clicking anywhere outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('[id^="attach-toggle-btn-"]') && !e.target.closest('.attach-menu-popover')) {
      document.querySelectorAll('.attach-menu-popover').forEach(m => m.style.display = 'none');
      document.querySelectorAll('[id^="attach-icon-"]').forEach(i => i.style.transform = 'rotate(0deg)');
    }
  });

  async function openConversation(senderJid, _fallbackPlatform, _fallbackName) {
    window.activeDevMsgJid = senderJid;
    const container = document.getElementById('conversation-container');
    if (!container) return;

    // Highlight active chat item in sidebar
    const items = document.querySelectorAll('.chat-list-item');
    items.forEach(item => {
      if (item.getAttribute('data-jid') === senderJid) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const chats = window.devMessagesCache || [];
    const userDevMsgs = chats.filter(m => m.sender === senderJid).map(m => {
      if (m.text && (m.text.includes('⚠️ [مخالفة سب وشتم]') || m.text.includes('⚠️ [مخالفة إباحية]'))) {
        return { ...m, isViolation: true };
      }
      return m;
    });

    // Fetch user violations from caches (profanity + ibhaya)
    const profLogs = (window.profanityLogsCache || []).filter(l => l.jid === senderJid);
    const ibhLogs = (window.ibhayaLogsCache || []).filter(l => l.jid === senderJid);
    
    const violationMsgs = [];
    const existingTexts = new Set(userDevMsgs.map(m => m.text));

    profLogs.forEach(l => {
      const vText = '⚠️ [مخالفة سب وشتم] الكلمة: ' + l.bad_word + '\nالرسالة: ' + l.message;
      if (!existingTexts.has(vText)) {
        violationMsgs.push({
          id: l.timestamp + '_v',
          sender: senderJid,
          senderName: l.name,
          platform: l.platform,
          text: vText,
          timestamp: l.timestamp,
          isViolation: true
        });
      }
    });

    ibhLogs.forEach(l => {
      const vText = '⚠️ [مخالفة إباحية] الكلمة: ' + l.bad_word + '\nالرسالة: ' + l.message;
      if (!existingTexts.has(vText)) {
        violationMsgs.push({
          id: l.timestamp + '_v',
          sender: senderJid,
          senderName: l.name,
          platform: l.platform,
          text: vText,
          timestamp: l.timestamp,
          isViolation: true
        });
      }
    });

    // Merge dev messages + violations and sort chronologically
    const convMsgs = [...userDevMsgs, ...violationMsgs]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // For new/empty conversations, still build the full UI with header + input bar
    const isNewConversation = convMsgs.length === 0;
    const firstMsg = convMsgs[0] || null;
    const platform = (firstMsg?.platform || _fallbackPlatform || 'whatsapp').toLowerCase();
    const displayName = firstMsg?.senderName || _fallbackName || senderJid;
    let pColor = '#25d366', pIcon = 'fab fa-whatsapp', pLabel = 'واتساب';
    if (platform === 'telegram' || platform === 'tg')  { pColor = '#38bdf8'; pIcon = 'fab fa-telegram-plane'; pLabel = 'تليجرام'; }
    if (platform === 'facebook' || platform === 'fb')  { pColor = '#0084ff'; pIcon = 'fab fa-facebook-messenger'; pLabel = 'فيسبوك'; }

    container.innerHTML = `
      <!-- Conversation Header -->
      <div style="padding:10px 16px; border-bottom:1px solid var(--border); background:var(--card); display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:50%; background:${pColor}18; display:flex; align-items:center; justify-content:center; color:${pColor}; font-size:16px; font-weight:bold;">
            <i class="${pIcon}"></i>
          </div>
          <div>
            <div style="font-weight:700; font-size:13px; color:var(--text-main);">${displayName}</div>
            <div style="font-size:10px; color:var(--text-muted); direction:ltr; text-align:right;">${senderJid} · ${pLabel}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-secondary" onclick="banProfanityUser('${senderJid}')" style="padding:4px 10px; font-size:10px; border-color:rgba(252,129,129,0.3); color:#fc8181; background:rgba(252,129,129,0.05); font-family:Cairo,sans-serif;"><i class="fas fa-ban"></i> حظر</button>
          <button class="btn btn-secondary" onclick="unbanProfanityUser('${senderJid}')" style="padding:4px 10px; font-size:10px; border-color:rgba(246,224,94,0.3); color:#f6e05e; background:rgba(246,224,94,0.05); font-family:Cairo,sans-serif;"><i class="fas fa-unlock"></i> إلغاء حظر</button>
          <button onclick="closeDevMsgModal()" style="background:none; border:none; color:var(--text-muted); font-size:22px; cursor:pointer; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:6px;" title="إغلاق">&times;</button>
        </div>
      </div>

      <!-- Messages Body -->
      <div id="chat-body-container" style="flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; gap:12px; background-image: radial-gradient(var(--border) 0.5px, transparent 0); background-size: 16px 16px; min-height:0; direction:ltr;">
        ${isNewConversation ? `<div style="flex:1; display:flex; align-items:center; justify-content:center; flex-direction:column; color:var(--text-muted); padding:40px; text-align:center; gap:12px;"><i class="${pIcon}" style="font-size:56px; color:${pColor}; opacity:0.18;"></i><p style="font-size:14px; margin:0;">لا توجد رسائل بعد. ابدأ المحادثة الآن 👇</p></div>` : convMsgs.map(m => {
          const dateStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('ar-MA', {hour: '2-digit', minute:'2-digit'}) : '';

          // Render user message, developer reply, or violation message
          if (m.isViolation) {
            const safeViolId = (m.id || m.timestamp || '').toString().replace(/'/g, '');
            return `
              <div style="display:flex; flex-direction:column; align-items:flex-start; max-width:82%; align-self:flex-start; margin-bottom:10px; position:relative;" class="violation-bubble-wrap">
                <div style="font-size:9px; color:var(--red); margin-bottom:4px; direction:rtl; font-weight:700; padding-left:4px;">
                  ${m.senderName || 'مستخدم'} · ${dateStr} (مخالفة)
                </div>
                <div style="position:relative; width:100%;">
                  <div style="background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.25); border-radius:18px 18px 18px 4px; padding:10px 14px; font-size:13px; color:#fc8181; line-height:1.6; white-space:pre-wrap; word-break:break-word; direction:rtl; text-align:right; box-shadow: 0 2px 6px rgba(239,68,68,0.08);">
                    ${escapeHtml(m.text || '')}
                  </div>
                  <button onclick="event.stopPropagation(); deleteDevMsg('${safeViolId}')" style="position:absolute; top:-8px; left:-8px; width:20px; height:20px; border-radius:50%; background:var(--bg); border:1px solid rgba(239,68,68,0.5); color:var(--red); font-size:10px; cursor:pointer; display:none; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3);" class="delete-msg-btn" title="حذف المخالفة">✕</button>
                </div>
              </div>`;
          }

          if (!m.text && m.replied && m.replyText) {
            const rt = m.replyTimestamp ? new Date(m.replyTimestamp).toLocaleTimeString('ar-MA', {hour:'2-digit',minute:'2-digit'}) : dateStr;
            return `<div style="display:flex; flex-direction:column; align-items:flex-end; max-width:82%; align-self:flex-end; margin-bottom:4px;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:9px; color:var(--text-muted); direction:rtl; padding-right:4px;">
                <span style="font-weight:700; color:var(--accent);">المطور</span>
                <span style="opacity:0.5;">·</span>
                <span>${rt}</span>
              </div>
              <div style="background:linear-gradient(135deg, rgba(37,211,102,0.16) 0%, rgba(18,140,126,0.06) 100%); border:1px solid rgba(37,211,102,0.22); border-radius:18px 18px 4px 18px; padding:10px 14px; font-size:13px; color:var(--text-main); line-height:1.6; white-space:pre-wrap; word-break:break-word; direction:rtl; text-align:right; box-shadow:0 2px 8px rgba(37,211,102,0.06);">
                ${formatMessageContent(m.replyText)}
              </div>
            </div>`;
          }

          const safeUserText = (m.text || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
          const userBubble = m.text ? `
            <div style="display:flex; flex-direction:column; align-items:flex-start; max-width:82%; align-self:flex-start; position:relative; margin-bottom: 4px;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:9px; color:var(--text-muted); direction:rtl; padding-left: 4px;">
                <span style="font-weight:700;">${m.senderName || 'مستخدم'}</span>
                <span style="opacity:0.5;">·</span>
                <span>${dateStr}</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:18px 18px 18px 4px; padding:10px 14px; font-size:13px; color:var(--text-main); line-height:1.6; white-space:pre-wrap; word-break:break-word; position:relative; direction:rtl; text-align:right; box-shadow:0 2px 6px rgba(0,0,0,0.15);">
                  ${formatMessageContent(m.text)}
                  <button onclick="event.stopPropagation(); deleteDevMsg('${m.id}')" style="position:absolute; top:-8px; left:-8px; width:20px; height:20px; border-radius:50%; background:var(--bg); border:1px solid var(--border); color:var(--red); font-size:10px; cursor:pointer; display:none; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3);" class="delete-msg-btn" title="حذف الرسالة">✕</button>
                </div>
                <button class="tts-speak-btn" onclick="speakText('${safeUserText}','ar')" title="استمع" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;border:none;background:rgba(37,211,102,0.1);color:#25d366;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔊</button>
              </div>
            </div>` : '';

          const safeReplyTxt = (m.replyText || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
          const replyBubble = m.text && m.replied && m.replyText ? `
            <div style="display:flex; flex-direction:column; align-items:flex-end; max-width:82%; align-self:flex-end; margin-bottom: 4px;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:9px; color:var(--text-muted); direction:rtl; padding-right: 4px;">
                <span style="font-weight:700; color:var(--accent);">المطور</span>
                <span style="opacity:0.5;">·</span>
                <span>${m.replyTimestamp ? new Date(m.replyTimestamp).toLocaleTimeString('ar-MA', {hour:'2-digit',minute:'2-digit'}) : ''}</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px; flex-direction:row-reverse;">
                <div style="background:linear-gradient(135deg,rgba(37,211,102,0.16),rgba(18,140,126,0.06)); border:1px solid rgba(37,211,102,0.22); border-radius:18px 18px 4px 18px; padding:10px 14px; font-size:13px; color:var(--text-main); line-height:1.6; white-space:pre-wrap; word-break:break-word; direction:rtl; text-align:right; box-shadow:0 2px 8px rgba(37,211,102,0.06);">
                  ${formatMessageContent(m.replyText)}
                </div>
                <button class="tts-speak-btn" onclick="speakText('${safeReplyTxt}','ar')" title="استمع" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;border:none;background:rgba(56,189,248,0.1);color:#38bdf8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔊</button>
              </div>
            </div>` : '';

          return userBubble + replyBubble;
        }).join('')}
      </div>

      <!-- Footer / Input Form -->
      <div style="padding:10px 16px; border-top:1px solid var(--border); background:var(--card); display:flex; flex-direction:column; gap:6px; flex-shrink:0;">

        <!-- Recording Waveform Bar (hidden by default) -->
        <div id="devreply-rec-bar-${senderJid}" style="display:none;align-items:center;gap:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:8px 12px;direction:ltr;">
          <button onclick="toggleDevReplyRecording('${senderJid}')" style="width:32px;height:32px;border-radius:50%;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;"><i class="fas fa-stop"></i></button>
          <div style="display:flex;align-items:center;gap:2px;flex:1;height:28px;">
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
            <span class="devreply-wave-bar-${senderJid}" style="display:inline-block;width:3px;border-radius:2px;background:#ef4444;height:4px;"></span>
          </div>
          <span id="devreply-rec-timer-${senderJid}" style="font-size:12px;font-weight:700;color:#ef4444;font-family:monospace;flex-shrink:0;">0:00</span>
          <span style="width:8px;height:8px;border-radius:50%;background:#ef4444;animation:blink 1s infinite;flex-shrink:0;"></span>
        </div>

        <!-- Audio Preview Bar (hidden by default) -->
        <div id="devreply-audio-preview-${senderJid}" style="display:none;align-items:center;gap:8px;background:rgba(37,211,102,0.07);border:1px solid rgba(37,211,102,0.2);border-radius:10px;padding:8px 12px;direction:ltr;">
          <button id="devreply-audio-play-btn-${senderJid}" onclick="toggleDevReplyAudioPreview('${senderJid}')" style="width:32px;height:32px;border-radius:50%;background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.4);color:#25d366;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;"><i class="fas fa-play"></i></button>
          <div style="flex:1;">
            <div style="font-size:10px;font-weight:700;color:#25d366;margin-bottom:3px;text-align:left;">🎤 رسالة صوتية</div>
            <audio id="devreply-audio-player-${senderJid}" style="display:none;"></audio>
            <div style="height:3px;background:rgba(37,211,102,0.2);border-radius:2px;overflow:hidden;"><div id="devreply-audio-fill-${senderJid}" style="height:100%;background:#25d366;width:0%;transition:width 0.1s;"></div></div>
            <div id="devreply-audio-dur-${senderJid}" style="font-size:9px;color:var(--text-muted);margin-top:2px;text-align:left;">0:00</div>
          </div>
          <button onclick="clearDevReplyMedia('${senderJid}')" style="width:26px;height:26px;border-radius:50%;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;"><i class="fas fa-trash"></i></button>
          <button onclick="sendConversationReply('${senderJid}')" style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#25d366,#128c7e);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;box-shadow:0 2px 8px rgba(37,211,102,0.3);"><i class="fas fa-paper-plane"></i></button>
        </div>

        <!-- Main Input Row -->
        <div id="devreply-main-input-row-${senderJid}" style="display:flex; gap:8px; align-items:flex-end; direction:ltr;">
          <textarea id="chat-input-text" placeholder="اكتب ردك هنا..." style="flex:1; min-height:36px; max-height:100px; height:36px; padding:8px 12px; border-radius:10px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-family:Cairo,sans-serif; font-size:12px; resize:none; box-sizing:border-box; line-height:1.4; direction:rtl; text-align:right;" oninput="updateDevMsgActionBtn('${senderJid}')" onkeydown="handleChatInputKeyDown(event, '${senderJid}')"></textarea>
          
          <!-- Attachment Button & Popover -->
          <div style="position: relative; display: flex; align-items: center; flex-shrink: 0;">
            <input type="file" id="devreply-media-file-image-${senderJid}" accept="image/*" style="display:none;" onchange="onDevReplyMediaChange('${senderJid}', this)" />
            <input type="file" id="devreply-media-file-audio-${senderJid}" accept="audio/*" style="display:none;" onchange="onDevReplyMediaChange('${senderJid}', this)" />
            <input type="file" id="devreply-media-file-doc-${senderJid}" accept=".pdf,.doc,.docx,.zip,.txt" style="display:none;" onchange="onDevReplyMediaChange('${senderJid}', this)" />
            
            <button type="button" id="attach-toggle-btn-${senderJid}" onclick="toggleAttachmentMenu('${senderJid}', event)" style="width:36px; height:36px; border-radius:50%; background:var(--card2); border:1px solid var(--border); color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:16px; transition:all 0.2s;" title="إرفاق ملف">
              <i class="fas fa-plus" id="attach-icon-${senderJid}" style="transition: transform 0.2s;"></i>
            </button>

            <div id="attach-menu-${senderJid}" class="attach-menu-popover" style="display:none; position:absolute; bottom:42px; right:0; background:var(--card2); border:1px solid var(--border); border-radius:14px; box-shadow:0 8px 30px rgba(0,0,0,0.55); padding:6px; flex-direction:column; gap:2px; z-index:9999; min-width:110px; animation: slideUp 0.15s ease-out;">
              <button type="button" onclick="selectAttachmentOption('${senderJid}', 'image')" style="width:100%; padding:6px 10px; font-size:11px; background:transparent; border:none; border-radius:8px; color:var(--text); cursor:pointer; display:flex; align-items:center; gap:8px; font-family:Cairo,sans-serif; text-align:right; transition: background 0.2s;">
                <span style="width:22px; height:22px; border-radius:50%; background:rgba(56,189,248,0.15); color:#38bdf8; display:flex; align-items:center; justify-content:center; font-size:10px; flex-shrink:0;"><i class="fas fa-image"></i></span>
                صورة
              </button>
              <button type="button" onclick="selectAttachmentOption('${senderJid}', 'audio')" style="width:100%; padding:6px 10px; font-size:11px; background:transparent; border:none; border-radius:8px; color:var(--text); cursor:pointer; display:flex; align-items:center; gap:8px; font-family:Cairo,sans-serif; text-align:right; transition: background 0.2s;">
                <span style="width:22px; height:22px; border-radius:50%; background:rgba(167,139,250,0.15); color:#a78bfa; display:flex; align-items:center; justify-content:center; font-size:10px; flex-shrink:0;"><i class="fas fa-music"></i></span>
                صوت
              </button>
              <button type="button" onclick="selectAttachmentOption('${senderJid}', 'doc')" style="width:100%; padding:6px 10px; font-size:11px; background:transparent; border:none; border-radius:8px; color:var(--text); cursor:pointer; display:flex; align-items:center; gap:8px; font-family:Cairo,sans-serif; text-align:right; transition: background 0.2s;">
                <span style="width:22px; height:22px; border-radius:50%; background:rgba(251,191,36,0.15); color:#fbbf24; display:flex; align-items:center; justify-content:center; font-size:10px; flex-shrink:0;"><i class="fas fa-file"></i></span>
                ملف
              </button>
            </div>
          </div>

          <button onclick="handleDevMsgActionClick('${senderJid}')" id="chat-send-btn" style="width:42px; height:42px; border-radius:50%; background:#25d366; border:none; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; flex-shrink:0; font-size:18px; box-shadow:0 2px 8px rgba(37,211,102,0.35); transition:all 0.2s;">
            <i class="fas fa-microphone" style="font-size:16px;"></i>
          </button>
        </div>

        <!-- Media Bar -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div id="devreply-media-preview-${senderJid}" style="display:none; flex:1; max-width:200px;">
            <div style="display:flex; align-items:center; gap:5px; padding:3px 6px; background:rgba(37,211,102,0.06); border:1px solid rgba(37,211,102,0.15); border-radius:6px;">
              <i id="devreply-media-icon-${senderJid}" class="fas fa-file" style="font-size:11px; color:#25d366; flex-shrink:0;"></i>
              <div style="flex:1; min-width:0; overflow:hidden; direction:ltr; text-align:left; font-size:9px;">
                <div id="devreply-media-name-${senderJid}" style="font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
              </div>
              <button type="button" onclick="clearDevReplyMedia('${senderJid}')" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:10px;"><i class="fas fa-times"></i></button>
            </div>
          </div>
        </div>
      </div>`;

    // Hover styles to show bubble delete buttons
    const bubbles = container.querySelectorAll('#chat-body-container > div');
    bubbles.forEach(b => {
      b.addEventListener('mouseenter', () => {
        const delBtn = b.querySelector('.delete-msg-btn');
        if (delBtn) delBtn.style.display = 'flex';
      });
      b.addEventListener('mouseleave', () => {
        const delBtn = b.querySelector('.delete-msg-btn');
        if (delBtn) delBtn.style.display = 'none';
      });
    });

    // Auto scroll to bottom
    const chatBody = document.getElementById('chat-body-container');
    if (chatBody) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }

  function handleChatInputKeyDown(event, senderJid) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendConversationReply(senderJid);
    }
  }

  async function sendConversationReply(senderJid) {
    const input = document.getElementById('chat-input-text');
    if (!input) return;
    const replyText = input.value.trim();
    const mediaFile = _devReplyFiles[senderJid];

    if (!replyText && !mediaFile) {
      showToast('⚠️ اكتب ردك أو أرفق ملفاً أولاً', 'error');
      return;
    }

    // Find the latest message for this sender to attach the reply
    const chats = window.devMessagesCache || [];
    const convMsgs = chats
      .filter(m => m.sender === senderJid)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // New conversation: no prior messages — fall back to /api/send-message directly
    if (convMsgs.length === 0) {
      const btn = document.getElementById('chat-send-btn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
      try {
        const platform = (_dmTargetPlatform || 'whatsapp');
        const number = senderJid;
        const body = { number, platform, message: replyText };
        if (mediaFile) {
          body.mediaBase64 = await fileToBase64(mediaFile);
          body.mediaType = mediaFile.type;
          body.mediaName = mediaFile.name;
          body.caption = replyText;
          body.ptt = _devReplyIsRecorded[senderJid] || false;
        }
        const res = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.ok) {
          showToast('✅ تم إرسال الرسالة بنجاح!', 'success');
          input.value = '';
          clearDevReplyMedia(senderJid);
          await loadDevMessages();
        } else {
          showToast('❌ ' + (data.error || 'فشل الإرسال'), 'error');
        }
      } catch(e) {
        showToast('❌ خطأ في الاتصال: ' + e.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i>'; }
      }
      return;
    }

    // Existing conversation — find the latest unanswered user message
    // Never target standalone dev reply rows (which have text = '') as the reply target
    const userMsgs = convMsgs.filter(m => m.text && m.text.trim() !== '');
    let targetMsg = userMsgs.find(m => !m.replied);
    if (!targetMsg) {
      targetMsg = userMsgs[userMsgs.length - 1];
    }
    if (!targetMsg) {
      showToast('⚠️ لا توجد رسالة مستخدم للرد عليها', 'error');
      return;
    }

    const btn = document.getElementById('chat-send-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
      const body = { id: targetMsg.id, replyText };
      if (mediaFile) {
        body.mediaBase64 = await fileToBase64(mediaFile);
        body.mediaType = mediaFile.type;
        body.mediaName = mediaFile.name;
        body.ptt = _devReplyIsRecorded[senderJid] || false;
      }

      const res = await fetch('/api/dev-messages/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ تم إرسال الرد بنجاح!', 'success');
        input.value = '';
        clearDevReplyMedia(senderJid);
        
        // Reload all dev messages, preserving active chat
        await loadDevMessages();
      } else {
        showToast('❌ ' + (data.error || 'فشل الإرسال'), 'error');
      }
    } catch(e) {
      showToast('❌ خطأ في الاتصال: ' + e.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
      }
    }
  }

  async function deleteDevMsg(id) {
    if (!await showConfirm('هل تريد حذف هذه الرسالة نهائياً؟')) return;
    try {
      const res = await fetch('/api/dev-messages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('🗑️ تم حذف الرسالة', 'success');
        await loadDevMessages();
      } else {
        showToast('❌ ' + (data.error || 'فشل الحذف'), 'error');
      }
    } catch(e) {
      showToast('❌ خطأ: ' + e.message, 'error');
    }
  }

  async function clearAllDevMessages() {
    if (!await showConfirm('هل تريد حذف جميع الرسائل الواردة نهائياً؟')) return;
    try {
      const res = await fetch('/api/dev-messages/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.ok) {
        showToast('🗑️ تم حذف جميع الرسائل', 'success');
        window.activeDevMsgJid = null;
        await loadDevMessages();
      } else {
        showToast('❌ ' + (data.error || 'فشل الحذف'), 'error');
      }
    } catch(e) {
      showToast('❌ خطأ: ' + e.message, 'error');
    }
  }

  // =================== LEADERBOARD ===================
  async function loadLeaderboard() {
    const waEl = document.getElementById('leaderboard-wa');
    const tgEl = document.getElementById('leaderboard-tg');
    const fbEl = document.getElementById('leaderboard-fb');
    const loading = `<div style="text-align:center;color:var(--text-muted);padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:8px;display:block;"></i>جاري التحميل...</div>`;
    if (waEl) waEl.innerHTML = loading;
    if (tgEl) tgEl.innerHTML = loading;
    if (fbEl) fbEl.innerHTML = loading;
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'فشل التحميل');
      const lb = data.leaderboard || {};

      function renderList(users, platform) {
        if (!users || users.length === 0) {
          return `<div style="text-align:center;color:var(--text-muted);padding:30px;"><i class="fas fa-inbox" style="font-size:30px;display:block;margin-bottom:8px;opacity:0.3;"></i>لا توجد بيانات بعد</div>`;
        }
        const medals = ['🥇','🥈','🥉'];
        return users.map((u, i) => {
          const medal = medals[i] || `<span style="color:var(--text-muted);font-weight:700;">#${i+1}</span>`;
          const name = escapeHtml(u.name || u.jid || u.id || 'مجهول');
          const count = u.count || 0;
          const safeName = name.replace(/'/g, "\\'");
          const userJid = (u.jid || u.id || '').replace(/'/g, "\\'");
          return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
            <span style="font-size:20px;min-width:28px;text-align:center;">${medal}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
              <div style="font-size:11px;color:var(--text-muted);font-family:monospace;">${u.jid || u.id || ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="font-size:13px;font-weight:700;color:var(--accent);background:rgba(56,189,248,0.1);padding:4px 10px;border-radius:20px;white-space:nowrap;">${count} رسالة</div>
              <button onclick="openProfanityMsgModal('${userJid}','${platform}','${safeName}')" style="padding:4px 9px;font-size:11px;border:1px solid rgba(99,179,237,0.4);background:rgba(99,179,237,0.08);color:#63b3ed;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="إرسال رسالة أو صورة">
                <i class="fas fa-paper-plane"></i> رسالة
              </button>
            </div>
          </div>`;
        }).join('');
      }

      if (waEl) waEl.innerHTML = renderList(lb.whatsapp, 'whatsapp');
      if (tgEl) tgEl.innerHTML = renderList(lb.telegram, 'telegram');
      if (fbEl) fbEl.innerHTML = renderList(lb.facebook, 'facebook');
    } catch(e) {
      const err = `<div style="color:var(--red);text-align:center;padding:20px;font-size:12px;"><i class="fas fa-exclamation-triangle"></i> خطأ: ${e.message}</div>`;
      if (waEl) waEl.innerHTML = err;
      if (tgEl) tgEl.innerHTML = err;
      if (fbEl) fbEl.innerHTML = err;
    }
  }

  // =================== BANNED USERS ===================
  async function loadBannedUsers() {
    const listEl = document.getElementById('banned-users-list');
    const countEl = document.getElementById('banned-count');
    if (!listEl) return;
    listEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:8px;"></i>جاري التحميل...</div>`;
    try {
      const res = await fetch('/api/banned');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'فشل التحميل');
      const banned = data.banned || [];
      if (countEl) countEl.textContent = `(${banned.length})`;
      if (banned.length === 0) {
        listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:40px;"><i class="fas fa-user-check" style="font-size:40px;margin-bottom:12px;display:block;opacity:0.3;"></i>لا يوجد أي مستخدم محظور حالياً.</div>`;
        return;
      }
      listEl.innerHTML = banned.map(b => {
        const jid = b.jid || b.id || b;
        const platform = b.platform || 'whatsapp';
        const platformLabel = { whatsapp: '🟢 واتساب', telegram: '✈️ تيليغرام', facebook: '🔵 فيسبوك' }[platform] || platform;
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-size:13px;font-weight:600;">${escapeHtml(b.name || jid)}</div>
            <div style="font-size:11px;color:var(--text-muted);font-family:monospace;">${jid} · ${platformLabel}</div>
          </div>
          <button class="btn btn-secondary" onclick="unbanUser('${escapeHtml(jid)}','${platform}')" style="padding:6px 14px;font-size:12px;border-color:rgba(104,211,145,0.4);color:#68d391;">
            <i class="fas fa-unlock"></i> رفع الحظر
          </button>
        </div>`;
      }).join('');
    } catch(e) {
      listEl.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px;font-size:12px;"><i class="fas fa-exclamation-triangle"></i> خطأ: ${e.message}</div>`;
    }
  }

  async function addManualBan() {
    const platform = document.getElementById('ban-platform').value;
    const number = document.getElementById('ban-number').value.trim();
    if (!number) { showToast('⚠️ أدخل الرقم أو الـ ID', 'error'); return; }
    try {
      const res = await fetch('/api/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jid: number, platform }) });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم حظر المستخدم', 'success'); document.getElementById('ban-number').value = ''; await loadBannedUsers(); }
      else showToast('❌ ' + (data.error || 'فشل الحظر'), 'error');
    } catch(e) { showToast('❌ خطأ: ' + e.message, 'error'); }
  }

  async function unbanUser(jid, platform) {
    try {
      const res = await fetch('/api/unban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jid, platform }) });
      const data = await res.json();
      if (data.ok) { showToast('✅ تم رفع الحظر', 'success'); await loadBannedUsers(); }
      else showToast('❌ ' + (data.error || 'فشل'), 'error');
    } catch(e) { showToast('❌ خطأ: ' + e.message, 'error'); }
  }

  // =================== VIOLATIONS COMPREHENSIVE SCANNER ===================
  let _violationsScanCache = [];
  async function performComprehensiveScan() {
    const listEl = document.getElementById('violations-scan-list');
    const countEl = document.getElementById('violations-scan-count');
    if (!listEl) return;
    listEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size:28px;margin-bottom:10px;display:block;"></i>جاري الفحص الشامل لقاعدة البيانات...</div>`;
    try {
      const [profRes, ibhRes] = await Promise.all([
        fetch('/api/profanity-logs'),
        fetch('/api/ibhaya-logs')
      ]);
      const profData = await profRes.json();
      const ibhData = await ibhRes.json();

      const profLogs = profData.logs || [];
      const ibhLogs = ibhData.logs || [];
      const bannedList = [...new Set([...(profData.banned || []), ...(ibhData.banned || [])])];

      const grouped = {};
      
      for (const log of profLogs) {
        const jid = log.jid;
        if (!grouped[jid]) {
          grouped[jid] = {
            jid: jid,
            name: log.name || 'مستخدم غير معروف',
            platform: log.platform || 'WA',
            profCount: 0,
            ibhCount: 0,
            badWords: new Set(),
            messages: [],
            warnings_left: log.warnings_left,
            timestamp: log.timestamp
          };
        }
        grouped[jid].profCount++;
        if (log.bad_word) grouped[jid].badWords.add(log.bad_word);
        grouped[jid].messages.push({ type: 'profanity', word: log.bad_word, text: log.message, ts: log.timestamp });
        if (new Date(log.timestamp) > new Date(grouped[jid].timestamp)) {
          grouped[jid].warnings_left = log.warnings_left;
          grouped[jid].timestamp = log.timestamp;
        }
      }

      for (const log of ibhLogs) {
        const jid = log.jid;
        if (!grouped[jid]) {
          grouped[jid] = {
            jid: jid,
            name: log.name || 'مستخدم غير معروف',
            platform: log.platform || 'WA',
            profCount: 0,
            ibhCount: 0,
            badWords: new Set(),
            messages: [],
            warnings_left: log.warnings_left,
            timestamp: log.timestamp
          };
        }
        grouped[jid].ibhCount++;
        if (log.bad_word) grouped[jid].badWords.add(log.bad_word);
        grouped[jid].messages.push({ type: 'ibhaya', word: log.bad_word, text: log.message, ts: log.timestamp });
        if (new Date(log.timestamp) > new Date(grouped[jid].timestamp)) {
          grouped[jid].warnings_left = log.warnings_left;
          grouped[jid].timestamp = log.timestamp;
        }
      }

      _violationsScanCache = Object.values(grouped).map(u => {
        u.isBanned = bannedList.includes(u.jid);
        u.badWordsList = Array.from(u.badWords);
        return u;
      });

      _violationsScanCache.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      filterScanResults();
    } catch(e) {
      listEl.innerHTML = `<div style="color:var(--red);text-align:center;padding:20px;font-size:12px;">خطأ في تشغيل الفحص: ${e.message}</div>`;
    }
  }

  function filterScanResults() {
    const filterType = (document.getElementById('violations-filter-type') || {}).value || 'all';
    const listEl = document.getElementById('violations-scan-list');
    const countEl = document.getElementById('violations-scan-count');
    if (!listEl) return;

    let filtered = _violationsScanCache;
    if (filterType === 'profanity') {
      filtered = _violationsScanCache.filter(function(u) { return u.profCount > 0; });
    } else if (filterType === 'ibhaya') {
      filtered = _violationsScanCache.filter(function(u) { return u.ibhCount > 0; });
    }

    if (countEl) countEl.textContent = '(' + filtered.length + ' مستخدم مخالف)';

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px;"><i class="fas fa-shield-alt" style="font-size:40px;margin-bottom:12px;display:block;opacity:0.3;"></i>لا توجد نتائج مطابقة للمرشح المحدد.</div>';
      return;
    }

    const platformIcon = { WA: '🟢', TG: '✈️', FB: '🔵' };
    const platformLabel = { WA: 'واتساب', TG: 'تيليغرام', FB: 'فيسبوك' };

    let rows = '';
    filtered.forEach(function(u) {
      const types = [];
      if (u.profCount > 0) types.push('<span style="color:#fc8181;background:rgba(252,129,129,0.1);padding:2px 6px;border-radius:4px;font-size:11px;">⚠️ كلام بذيء (' + u.profCount + ')</span>');
      if (u.ibhCount > 0) types.push('<span style="color:#e53e3e;background:rgba(229,62,62,0.1);padding:2px 6px;border-radius:4px;font-size:11px;">🚫 إباحية (' + u.ibhCount + ')</span>');

      const wordsBadge = u.badWordsList.map(function(w) {
        return '<code style="background:rgba(255,255,255,0.06);color:var(--text-main);padding:1px 5px;border-radius:4px;font-size:11px;margin-left:4px;">' + w + '</code>';
      }).join('');

      const ts = new Date(u.timestamp).toLocaleString('ar-MA');
      const safeName = (u.name || 'مستخدم').replace(/'/g, "\\'");
      const pkey = u.platform || 'WA';
      const isBannedSpan = u.isBanned
        ? '<span style="background:rgba(252,129,129,0.15);color:#fc8181;border:1px solid rgba(252,129,129,0.4);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">🚫 محظور</span>'
        : '<span style="background:rgba(104,211,145,0.12);color:#68d391;border:1px solid rgba(104,211,145,0.35);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">✅ نشط</span>';

      rows += '<tr style="border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'+
        '<td style="padding:10px 12px;white-space:nowrap;">' + (platformIcon[pkey] || '❓') + ' ' + (platformLabel[pkey] || pkey) + '</td>' +
        '<td style="padding:10px 12px;font-size:12px;">' +
          '<div style="font-weight:600;">' + (u.name || '—') + '</div>' +
          '<div style="color:var(--text-muted);font-size:10px;font-family:monospace;word-break:break-all;">' + u.jid + '</div>' +
        '</td>' +
        '<td style="padding:10px 12px;text-align:center;">' + isBannedSpan + '</td>' +
        '<td style="padding:10px 12px;white-space:nowrap;">' + types.join(' ') + '</td>' +
        '<td style="padding:10px 12px;">' + (wordsBadge || '—') + '</td>' +
        '<td style="padding:10px 12px;color:var(--text-muted);font-size:11px;white-space:nowrap;">' + ts + '</td>' +
        '<td style="padding:10px 12px;">' +
          '<button onclick="openProfanityMsgModal(\'' + u.jid + '\',\'' + pkey + '\',\'' + safeName + '\')" class="btn btn-primary" style="padding:5px 12px;font-size:11px;border:none;background:linear-gradient(135deg, #3182ce, #2b6cb0);color:#fff;border-radius:6px;cursor:pointer;font-family:Cairo,sans-serif;white-space:nowrap;" title="بدء محادثة مباشرة">' +
            '<i class="fas fa-comments"></i> تواصل فوري' +
          '</button>' +
        '</td>' +
        '</tr>';
    });

    listEl.innerHTML =
      '<div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
          '<thead>' +
            '<tr style="border-bottom:1px solid var(--border);">' +
              '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">المنصة</th>' +
              '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">المستخدم</th>' +
              '<th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">الحالة</th>' +
              '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">نوع المخالفات</th>' +
              '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;">الكلمات المكتشفة</th>' +
              '<th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:600;">آخر تحذير</th>' +
              '<th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:600;min-width:140px;">إجراءات</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  // =================== HELPERS ===================
  function showAlert(el, type, msg) {
    el.className = `alert alert-${type} show`;
    el.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${msg}`;
    if (type === 'success') setTimeout(() => el.classList.remove('show'), 5000);
  }

  let toastTimer;
  function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  // =================== MANAGE PAGE ===================


  function switchManageTab(tab) {
    manageTab = tab;
    localStorage.setItem('manage_tab', tab);
    document.querySelectorAll('.manage-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('mtab-' + tab).classList.add('active');
    document.querySelectorAll('.manage-panel').forEach(p => p.style.display = 'none');
    document.getElementById('mpanel-' + tab).style.display = 'block';
    if (tab === 'monitor') {
      startLogsPolling();
    } else {
      stopLogsPolling();
    }
  }

  function startLogsPolling() {
    stopLogsPolling();
    pollLogs();
    logsInterval = setInterval(pollLogs, 3000);
  }

  function stopLogsPolling() {
    if (logsInterval) {
      clearInterval(logsInterval);
      logsInterval = null;
    }
  }

  async function pollLogs() {
    try {
      const res = await apiFetch('/api/syslog');
      if (res && res.ok) {
        allLogs = res.logs || [];
        renderLogs();
      }
    } catch(e) {
      console.error('Error polling logs:', e);
    }
  }

  function clearLiveLogs() {
    allLogs = [];
    document.getElementById('live-logs-container').innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;font-family:Cairo,sans-serif;">تم مسح الشاشة. بانتظار سجلات جديدة...</div>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderLogs() {
    const filter = document.getElementById('log-filter').value;
    const container = document.getElementById('live-logs-container');
    if (!container) return;
    
    let filtered = allLogs;
    if (filter !== 'all') {
      filtered = allLogs.filter(l => l.level === filter);
    }
    
    if (filtered.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;font-family:Cairo,sans-serif;">لا توجد سجلات مطابقة للفيلتر</div>';
      return;
    }
    
    const colors = {
      error: '#fc8181',
      warn: '#f6e05e',
      info: '#63b3ed',
      log: '#e2e8f0'
    };
    
    container.innerHTML = filtered.map(l => {
      const timeStr = new Date(l.t).toLocaleTimeString('ar-EG', { hour12: false });
      const color = colors[l.level] || '#e2e8f0';
      const levelLabel = l.level.toUpperCase();
      return `<div style="display:flex;align-items:flex-start;gap:8px;border-bottom:1px solid rgba(255,255,255,0.03);padding-bottom:4px;margin-bottom:4px;word-break:break-all;white-space:pre-wrap;">
        <span style="color:var(--text-muted);white-space:nowrap;font-size:11px;">[${timeStr}]</span>
        <span style="color:${color};font-weight:bold;white-space:nowrap;font-size:11px;">${l.icon} [${levelLabel}]</span>
        <span style="color:${color};flex:1;">${escapeHtml(l.msg)}</span>
      </div>`;
    }).join('');
  }

  async function loadManagePage() {
    let statusRes = null;
    try {
      statusRes = await apiFetch('/api/status');
    } catch(e) {}

    if (manageData) {
      if (statusRes) manageData.status = statusRes;
      return renderManagePage(manageData);
    }
    document.getElementById('manage-loader').style.display = 'flex';
    document.getElementById('manage-content').style.display = 'none';
    try {
      const [cmdRes, usersRes, bannedRes] = await Promise.all([
        apiFetch('/api/commands'),
        apiFetch('/api/users'),
        apiFetch('/api/banned')
      ]);
      manageData = { cmd: cmdRes, users: usersRes, banned: bannedRes, status: statusRes };
      document.getElementById('manage-loader').style.display = 'none';
      document.getElementById('manage-content').style.display = 'block';
      renderManagePage(manageData);
    } catch(e) {
      document.getElementById('manage-loader').style.display = 'none';
      document.getElementById('manage-content').style.display = 'block';
      showToast('خطأ في تحميل البيانات', 'error');
    }
  }

  function renderManagePage(data) {
    if (data.status) {
      document.getElementById('mc-visits').textContent = data.status.visits || 0;
      document.getElementById('mc-impressions').textContent = data.status.impressions || 0;
    }
    renderCommandsPanel(data.cmd);
    renderNLCPanel(data.cmd);
    renderUsersManagePanel(data.users, data.banned);
    renderBannedPanel(data.banned);
    
    // Restore active sub-tab
    switchManageTab(manageTab);
  }

  const catInfo = {
    islamic: { icon: '🕌', label: 'إسلامي', color: '#f6e05e' },
    thmil:   { icon: '📥', label: 'تحميل',  color: '#25d366' },
    ai:      { icon: '🤖', label: 'ذكاء اصطناعي', color: '#9f7aea' },
    image:   { icon: '🖼', label: 'صور',    color: '#63b3ed' },
    tools:   { icon: '🛠', label: 'أدوات',  color: '#fc8181' },
    morocco: { icon: '🇲🇦', label: 'المغرب', color: '#f97316' },
    info:    { icon: 'ℹ️', label: 'معلومات', color: '#38bdf8' },
    admin:   { icon: '⚙️', label: 'إدارة',   color: '#a78bfa' },
  };

  function renderCommandsPanel(data) {
    if (!data || !data.ok) return;
    const cats = data.categories;
    let totalFiles = data.totalFiles, totalAliases = data.totalAliases;

    // update summary cards
    document.getElementById('mc-total-files').textContent = totalFiles;
    document.getElementById('mc-total-aliases').textContent = totalAliases;
    document.getElementById('mc-total-cats').textContent = Object.keys(cats).length;
    document.getElementById('mc-total-nlc').textContent = data.nlcList.length;

    // search filter
    const searchInput = document.getElementById('cmd-search');
    function renderList(filter = '') {
      let html = '';
      for (const [catKey, cat] of Object.entries(cats)) {
        const ci = catInfo[catKey] || { icon: '📌', label: catKey, color: '#ccc' };
        const filtered = cat.commands.filter(c =>
          !filter || c.aliases.some(a => a.includes(filter)) || c.file.includes(filter)
        );
        if (!filtered.length) continue;
        html += `<div style="margin-bottom:18px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <span style="font-size:18px;">${ci.icon}</span>
            <span style="font-weight:700;color:${ci.color};font-size:14px;">${ci.label}</span>
            <span style="background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:20px;font-size:11px;color:var(--text-muted);">${filtered.length} أمر</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;">
            ${filtered.map(c => `
              <div style="background:var(--bg);border-radius:10px;padding:10px 12px;border:1px solid var(--border);display:flex;align-items:flex-start;gap:10px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;direction:ltr;">${c.file}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    ${c.aliases.map(a => `<span style="background:rgba(99,179,237,0.1);color:var(--blue);padding:2px 7px;border-radius:6px;font-size:11px;direction:ltr;font-weight:600;">.${a}</span>`).join('')}
                  </div>
                </div>
                ${c.uses ? `<span style="background:rgba(37,211,102,0.15);color:var(--accent);padding:2px 7px;border-radius:6px;font-size:11px;white-space:nowrap;">${c.uses}×</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>`;
      }
      document.getElementById('commands-list').innerHTML = html || '<div style="color:var(--text-muted);text-align:center;padding:30px;">لا توجد نتائج</div>';
    }
    renderList();
    searchInput.oninput = () => renderList(searchInput.value.toLowerCase().trim());
  }

  function renderNLCPanel(data) {
    if (!data || !data.ok) return;
    const nlcList = data.nlcList;
    let html = nlcList.map(n => {
      const ci = catInfo[n.file.split('/')[0]] || { icon: '📌', color: '#ccc', label: n.file.split('/')[0] };
      return `<div style="background:var(--bg);border-radius:10px;padding:12px;border:1px solid var(--border);display:flex;align-items:flex-start;gap:10px;">
        <div style="font-size:20px;line-height:1;">${ci.icon}</div>
        <div style="flex:1;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;direction:ltr;">${n.file}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${n.aliases.map(a => `<span style="background:rgba(159,122,234,0.12);color:var(--purple);padding:2px 8px;border-radius:6px;font-size:12px;">${a}</span>`).join('')}
          </div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('nlc-list').innerHTML = html;
    document.getElementById('nlc-count-badge').textContent = nlcList.length + ' كلمة';
  }

  function renderUsersManagePanel(usersData, bannedData) {
    if (!usersData || !usersData.ok) return;
    const banned = (bannedData && bannedData.ok) ? bannedData.banned : [];
    const users = usersData.users || [];
    document.getElementById('um-total').textContent = users.length;
    document.getElementById('um-banned').textContent = banned.length;
    const wa = users.filter(u => u.platform === 'whatsapp' || (!u.platform && !u.jid?.startsWith('tg:') && !u.jid?.startsWith('fb:')));
    const tg = users.filter(u => u.platform === 'telegram' || u.jid?.startsWith('tg:'));
    const fb = users.filter(u => u.platform === 'facebook' || u.jid?.startsWith('fb:'));
    document.getElementById('um-wa').textContent = wa.length;
    document.getElementById('um-tg').textContent = tg.length;
    document.getElementById('um-fb').textContent = fb.length;
  }

  function renderBannedPanel(bannedData) {
    const banned = (bannedData && bannedData.ok) ? bannedData.banned : [];
    const container = document.getElementById('banned-list');
    if (!banned.length) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;"><i class="fas fa-shield-alt" style="font-size:30px;margin-bottom:8px;display:block;color:var(--accent);"></i>لا يوجد مستخدمون محظورون</div>';
      return;
    }
    container.innerHTML = banned.map(jid => `
      <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(252,129,129,0.05);border:1px solid rgba(252,129,129,0.2);border-radius:10px;padding:10px 14px;gap:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="fas fa-ban" style="color:var(--red);"></i>
          <span style="font-size:13px;direction:ltr;">${jid}</span>
        </div>
        <button onclick="unbanUser('${jid}')" style="background:rgba(37,211,102,0.1);border:1px solid rgba(37,211,102,0.3);color:var(--accent);padding:5px 12px;border-radius:7px;font-family:Cairo,sans-serif;font-size:12px;cursor:pointer;">
          <i class="fas fa-unlock"></i> رفع الحظر
        </button>
      </div>
    `).join('');
  }

  async function doBanUser() {
    const inp = document.getElementById('ban-input').value.trim();
    if (!inp) return showToast('أدخل رقم المستخدم', 'error');
    const jid = inp.includes('@') ? inp : inp + '@s.whatsapp.net';
    try {
      const r = await apiFetch('/api/ban', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ jid }) });
      if (r.ok) { showToast('✅ تم الحظر'); document.getElementById('ban-input').value = ''; manageData = null; loadManagePage(); }
      else showToast(r.error || 'خطأ', 'error');
    } catch(e) { showToast('خطأ في الاتصال', 'error'); }
  }

  async function unbanUser(jid) {
    try {
      const r = await apiFetch('/api/unban', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ jid }) });
      if (r.ok) { showToast('✅ تم رفع الحظر'); manageData = null; loadManagePage(); }
      else showToast(r.error || 'خطأ', 'error');
    } catch(e) { showToast('خطأ في الاتصال', 'error'); }
  }

  async function doQuickBroadcast() {
    const msg = document.getElementById('quick-bc-msg').value.trim();
    const plat = document.getElementById('quick-bc-plat').value;
    if (!msg) return showToast('أدخل الرسالة', 'error');
    const btn = document.getElementById('quick-bc-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    try {
      const r = await apiFetch('/api/broadcast', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ message: msg, platform: plat }) });
      if (r.ok) { showToast('✅ تم الإرسال بنجاح'); document.getElementById('quick-bc-msg').value = ''; }
      else showToast(r.error || 'خطأ', 'error');
    } catch(e) { showToast('خطأ في الاتصال', 'error'); }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال';
  }

  async function doRestart() {
    if (!await showConfirm('هل تريد إعادة تشغيل البوت؟')) return;
    try {
      await apiFetch('/api/restart', { method: 'POST' });
      showToast('🔄 جاري إعادة التشغيل...');
    } catch(e) { showToast('خطأ', 'error'); }
  }

  async function deleteAllUsers() {
    if (!await showConfirm('⚠️ هل أنت متأكد تماماً من رغبتك في حذف جميع المستخدمين؟ هذا الإجراء سيقوم بحذف كافة السجلات والمحادثات المخزنة نهائياً ولا يمكن التراجع عنه.')) return;
    try {
      const res = await apiFetch('/api/delete-all-users', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ تم حذف جميع المستخدمين بنجاح', 'success');
        manageData = null; // Clear cache
        loadManagePage();
      } else {
        showToast(data.error || 'فشل الحذف', 'error');
      }
    } catch(e) {
      showToast('خطأ في الاتصال للخادم', 'error');
    }
  }

  async function clearActivityLogs() {
    if (!await showConfirm('⚠️ هل أنت متأكد من رغبتك في مسح جميع سجلات النشاط والمحادثات لجميع المستخدمين؟ سيبقى المستخدمون مسجلين ولكن سيتم مسح تاريخ الرسائل.')) return;
    try {
      const res = await apiFetch('/api/clear-activity', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ تم مسح سجل النشاط بنجاح', 'success');
        if (document.getElementById('page-activity').classList.contains('active')) {
          loadActivity();
        }
        manageData = null; // Clear cache
        loadManagePage();
      } else {
        showToast(data.error || 'فشل مسح السجل', 'error');
      }
    } catch(e) {
      showToast('خطأ في الاتصال للخادم', 'error');
    }
  }

  // =================== PYTHON SCRIPTS PAGE JS ===================
  let scriptLogsInterval = null;
  let isScriptLogsPolling = false;
  let activeWebTempEmail = localStorage.getItem('web_tempmail_address') || '';

  async function loadScriptsPage() {
    // Restore cached email address
    const cachedAddress = localStorage.getItem('web_tempmail_address');
    if (cachedAddress) {
      activeWebTempEmail = cachedAddress;
      const input = document.getElementById('web-tempmail-address');
      if (input) input.value = activeWebTempEmail;
      checkWebTempMailInbox();
    }

    try {
      const res = await fetch('/api/scripts/status');
      const data = await res.json();
      if (data && data.ok) {
        updateScriptStatusUI(data);
      }
    } catch(e) {
      showToast('خطأ في تحميل حالة السكريبت', 'error');
    }
  }

  // =================== WEB TEMP MAIL CLIENT JS ===================
  async function generateWebTempMail() {
    try {
      const res = await fetch('/api/tempmail/generate');
      const data = await res.json();
      if (data && data.ok) {
        activeWebTempEmail = data.email;
        localStorage.setItem('web_tempmail_address', activeWebTempEmail);
        document.getElementById('web-tempmail-address').value = activeWebTempEmail;
        showToast('📧 تم توليد البريد الإلكتروني الجديد', 'success');
        
        // Reset viewer and check inbox
        document.getElementById('web-tempmail-viewer').innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:50px; font-family:Cairo,sans-serif;">اختر رسالة من القائمة لعرض تفاصيلها هنا.</div>`;
        checkWebTempMailInbox();
      } else {
        showToast('فشل في توليد البريد', 'error');
      }
    } catch(e) {
      showToast('خطأ في الاتصال بالخادم', 'error');
    }
  }

  function copyWebTempMail() {
    const address = document.getElementById('web-tempmail-address').value;
    if (!address) {
      showToast('⚠️ لا يوجد بريد إلكتروني لنسخه', 'error');
      return;
    }
    
    navigator.clipboard.writeText(address)
      .then(() => showToast('📋 تم نسخ البريد بنجاح!'))
      .catch(() => showToast('فشل النسخ', 'error'));
  }

  async function checkWebTempMailInbox() {
    const emailInput = document.getElementById('web-tempmail-address');
    const address = emailInput ? emailInput.value.trim() : activeWebTempEmail;
    
    if (!address) {
      showToast('⚠️ يرجى إنشاء بريد جديد أولاً', 'error');
      return;
    }

    const inboxList = document.getElementById('web-tempmail-inbox-list');
    inboxList.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:40px; font-family:Cairo,sans-serif;"><i class="fas fa-spinner fa-spin"></i> جاري تحديث الرسائل...</div>`;

    try {
      const res = await fetch(`/api/tempmail/messages?email=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data && data.ok) {
        const messages = data.messages || [];
        if (messages.length === 0) {
          inboxList.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:40px; font-family:Cairo,sans-serif;">📭 علبة الوارد فارغة. بانتظار رسائل جديدة...</div>`;
        } else {
          inboxList.innerHTML = messages.map(msg => {
            return `
              <div class="tempmail-item" onclick="showWebTempMailMessage('${msg.id}', this)">
                <div class="tempmail-item-header">
                  <span class="tempmail-item-from">${escapeHtml(msg.from)}</span>
                  <span>ID: ${msg.id}</span>
                </div>
                <div class="tempmail-item-subject">${escapeHtml(msg.subject || 'بدون موضوع')}</div>
              </div>
            `;
          }).join('');
        }
      } else {
        inboxList.innerHTML = `<div style="color:var(--red); text-align:center; padding:40px; font-family:Cairo,sans-serif;">❌ فشل تحديث الرسائل.</div>`;
      }
    } catch(e) {
      inboxList.innerHTML = `<div style="color:var(--red); text-align:center; padding:40px; font-family:Cairo,sans-serif;">❌ خطأ في الاتصال بالخادم.</div>`;
    }
  }

  async function showWebTempMailMessage(msgId, element) {
    document.querySelectorAll('.tempmail-item').forEach(item => item.classList.remove('active'));
    if (element) element.classList.add('active');

    const viewer = document.getElementById('web-tempmail-viewer');
    viewer.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:40px; font-family:Cairo,sans-serif;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الرسالة...</div>`;

    try {
      const address = document.getElementById('web-tempmail-address').value;
      const res = await fetch(`/api/tempmail/message?email=${encodeURIComponent(address)}&id=${msgId}`);
      const data = await res.json();
      
      if (data && data.ok && data.message) {
        const msg = data.message;
        let cleanedBody = 'لا توجد تفاصيل';
        if (msg.textBody) {
          cleanedBody = msg.textBody;
        } else if (msg.body) {
          if (typeof msg.body === 'object') {
            cleanedBody = msg.body.text || msg.body.html || 'لا توجد تفاصيل';
          } else {
            cleanedBody = msg.body;
          }
        }
        
        let displayDate = msg.date || '';
        try {
          if (msg.date) {
            displayDate = new Date(msg.date).toLocaleString('ar-MA');
          }
        } catch(e) {}
        
        viewer.innerHTML = `
          <div style="border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:12px; direction:rtl; text-align:right;">
            <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">
              <span><strong>من:</strong> ${escapeHtml(msg.from)}</span>
              <span><strong>التاريخ:</strong> ${escapeHtml(displayDate)}</span>
            </div>
            <div style="font-size:13px; font-weight:700; color:var(--accent); margin-top:6px;"><strong>الموضوع:</strong> ${escapeHtml(msg.subject || 'بدون موضوع')}</div>
          </div>
          <div style="font-size:12px; color:var(--text); white-space:pre-wrap; direction:ltr; text-align:left; background:rgba(0,0,0,0.3); padding:12px; border-radius:8px; font-family:monospace; max-height:180px; overflow-y:auto; line-height:1.5;">${escapeHtml(cleanedBody)}</div>
        `;
      } else {
        viewer.innerHTML = `<div style="color:var(--red); text-align:center; padding:40px; font-family:Cairo,sans-serif;">❌ فشل تحميل محتوى الرسالة.</div>`;
      }
    } catch(e) {
      viewer.innerHTML = `<div style="color:var(--red); text-align:center; padding:40px; font-family:Cairo,sans-serif;">❌ خطأ في الاتصال بالخادم.</div>`;
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateScriptStatusUI(data) {
    const badge = document.getElementById('script-status-badge');
    const startBtn = document.getElementById('btn-start-script');
    const stopBtn = document.getElementById('btn-stop-script');
    
    // Config fields
    if (data.config) {
      if (data.config.token && !document.getElementById('script-telegramToken').value) {
        document.getElementById('script-telegramToken').value = data.config.token;
      }
      if (data.config.ownerId && !document.getElementById('script-ownerId').value) {
        document.getElementById('script-ownerId').value = data.config.ownerId;
      }
    }

    if (data.running) {
      badge.textContent = 'نشط (PID: ' + data.pid + ')';
      badge.className = 'chip chip-green';
      startBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
      startScriptLogsPolling();
    } else {
      badge.textContent = 'متوقف';
      badge.className = 'chip chip-red';
      startBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
      stopScriptLogsPolling();
    }
  }

  async function toggleScript(action) {
    const token = document.getElementById('script-telegramToken').value.trim();
    const ownerId = document.getElementById('script-ownerId').value.trim();

    if (action === 'start') {
      if (!token) {
        showToast('يرجى إدخال توكن البوت أولاً', 'error');
        return;
      }
      if (!ownerId) {
        showToast('يرجى إدخال معرف المالك أولاً', 'error');
        return;
      }
    }

    try {
      const res = await fetch('/api/scripts/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token, ownerId })
      });
      const data = await res.json();
      if (data && data.ok) {
        showToast(action === 'start' ? '🚀 تم تشغيل السكريبت بنجاح' : '🛑 تم إيقاف السكريبت', 'success');
        updateScriptStatusUI(data);
        fetchScriptLogs();
      } else {
        showToast(data.error || 'فشل تنفيذ الإجراء', 'error');
      }
    } catch(e) {
      showToast('خطأ في الاتصال بالسيرفر', 'error');
    }
  }

  function startScriptLogsPolling() {
    if (isScriptLogsPolling) return;
    isScriptLogsPolling = true;
    fetchScriptLogs();
    scriptLogsInterval = setInterval(fetchScriptLogs, 3000);
  }

  function stopScriptLogsPolling() {
    isScriptLogsPolling = false;
    if (scriptLogsInterval) {
      clearInterval(scriptLogsInterval);
      scriptLogsInterval = null;
    }
  }

  async function fetchScriptLogs() {
    try {
      const res = await fetch('/api/scripts/logs');
      const data = await res.json();
      if (data && data.ok) {
        const container = document.getElementById('script-logs-container');
        const logs = data.logs || [];
        if (logs.length === 0) {
          container.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:50px; font-family:Cairo,sans-serif;">لا توجد سجلات حالية. قم بتشغيل السكريبت لبدء المراقبة.</div>`;
        } else {
          container.innerHTML = logs.map(line => {
            let color = '#a0aec0';
            if (line.includes('STDERR:') || line.includes('ERROR:')) color = '#fc8181';
            else if (line.includes('🚀') || line.includes('Spawning:')) color = '#68d391';
            else if (line.includes('🛑')) color = '#cbd5e0';
            const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div style="color: ${color}; white-space: pre-wrap; word-break: break-all;">${escaped}</div>`;
          }).join('');
          
          container.scrollTop = container.scrollHeight;
        }
      }
    } catch(e) {
      console.error('Error fetching script logs:', e);
    }
  }

  function clearLocalScriptLogs() {
    document.getElementById('script-logs-container').innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:50px; font-family:Cairo,sans-serif;">تم مسح الشاشة. بانتظار سجلات جديدة...</div>`;
  }

  // =================== SIDEBAR TOGGLE ===================
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    } else {
      sidebar.classList.add('open');
      overlay.classList.add('show');
    }
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 900) {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    }
  }

  // =================== INSTAGRAM HUNTER JS ===================
  let isInstaLogsPolling = false;
  let instaLogsInterval = null;
  let isInstaHitsPolling = false;
  let instaHitsInterval = null;

  async function loadInstaPage() {
    try {
      const res = await fetch('/api/insta/status');
      const data = await res.json();
      if (data && data.ok) {
        updateInstaStatusUI(data);
      }
    } catch(e) {
      showToast('خطأ في تحميل حالة سكريبت الصيد', 'error');
    }
  }

  function toggleInstaTelegramFields(enabled) {
    const group = document.getElementById('insta-telegram-config-group');
    if (group) {
      group.style.display = enabled ? 'block' : 'none';
    }
  }

  function updateInstaStatusUI(data) {
    const badge = document.getElementById('insta-status-badge');
    const startBtn = document.getElementById('btn-start-insta');
    const stopBtn = document.getElementById('btn-stop-insta');
    
    // Config fields
    if (data.config) {
      if (data.config.token && !document.getElementById('insta-telegramToken').value) {
        document.getElementById('insta-telegramToken').value = data.config.token;
      }
      if (data.config.ownerId && !document.getElementById('insta-ownerId').value) {
        document.getElementById('insta-ownerId').value = data.config.ownerId;
      }
    }

    if (data.sendTelegram !== undefined) {
      document.getElementById('insta-sendTelegram').checked = data.sendTelegram;
      toggleInstaTelegramFields(data.sendTelegram);
    }

    if (data.hits) {
      renderInstaHits(data.hits);
    }

    if (data.running) {
      badge.textContent = 'نشط (PID: ' + data.pid + ')';
      badge.className = 'chip chip-green';
      startBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
      startInstaLogsPolling();
      startInstaHitsPolling();
    } else {
      badge.textContent = 'متوقف';
      badge.className = 'chip chip-red';
      startBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
      stopInstaLogsPolling();
      stopInstaHitsPolling();
    }
  }

  async function toggleInstaHunter(action) {
    const sendTelegram = document.getElementById('insta-sendTelegram').checked;
    const token = document.getElementById('insta-telegramToken').value.trim();
    const ownerId = document.getElementById('insta-ownerId').value.trim();

    if (action === 'start') {
      if (sendTelegram) {
        if (!token) {
          showToast('يرجى إدخال توكن البوت أولاً', 'error');
          return;
        }
        if (!ownerId) {
          showToast('يرجى إدخال معرف المالك أولاً', 'error');
          return;
        }
      }
    }

    try {
      const res = await fetch('/api/insta/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, token, ownerId, sendTelegram })
      });
      const data = await res.json();
      if (data && data.ok) {
        showToast(action === 'start' ? '🚀 تم بدء عملية الصيد بنجاح' : '🛑 تم إيقاف عملية الصيد', 'success');
        updateInstaStatusUI(data);
        fetchInstaLogs();
        fetchInstaHits();
      } else {
        showToast(data.error || 'فشل تنفيذ الإجراء', 'error');
      }
    } catch(e) {
      showToast('خطأ في الاتصال بالسيرفر', 'error');
    }
  }

  function startInstaLogsPolling() {
    if (isInstaLogsPolling) return;
    isInstaLogsPolling = true;
    fetchInstaLogs();
    instaLogsInterval = setInterval(fetchInstaLogs, 3000);
  }

  function stopInstaLogsPolling() {
    isInstaLogsPolling = false;
    if (instaLogsInterval) {
      clearInterval(instaLogsInterval);
      instaLogsInterval = null;
    }
  }

  async function fetchInstaLogs() {
    try {
      const res = await fetch('/api/insta/logs');
      const data = await res.json();
      if (data && data.ok) {
        const container = document.getElementById('insta-logs-container');
        const logs = data.logs || [];
        if (logs.length === 0) {
          container.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:50px; font-family:Cairo,sans-serif;">لا توجد سجلات حالية. قم بالبدء لمراقبة الصيد.</div>`;
        } else {
          container.innerHTML = logs.map(line => {
            let color = '#a0aec0';
            if (line.includes('STDERR:') || line.includes('ERROR:')) color = '#fc8181';
            else if (line.includes('🚀') || line.includes('Spawning:')) color = '#68d391';
            else if (line.includes('🛑')) color = '#cbd5e0';
            else if (line.includes('📊')) color = '#f6ad55'; // Orange for stats
            const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div style="color: ${color}; white-space: pre-wrap; word-break: break-all;">${escaped}</div>`;
          }).join('');
          
          container.scrollTop = container.scrollHeight;
        }
      }
    } catch(e) {
      console.error('Error fetching insta logs:', e);
    }
  }

  function clearLocalInstaLogs() {
    document.getElementById('insta-logs-container').innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:50px; font-family:Cairo,sans-serif;">تم مسح الشاشة. بانتظار سجلات جديدة...</div>`;
  }

  async function fetchInstaHits() {
    try {
      const res = await fetch('/api/insta/status');
      const data = await res.json();
      if (data && data.ok && data.hits) {
        renderInstaHits(data.hits);
      }
    } catch(e) {
      console.error('Error fetching hits:', e);
    }
  }

  function renderInstaHits(hits) {
    const container = document.getElementById('insta-hits-container');
    if (!container) return;
    if (hits.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">بانتظار بدء الصيد للعثور على حسابات...</div>`;
      return;
    }

    container.innerHTML = hits.map(hit => {
      const textToCopy = `يوزر: ${hit.username}\nايميل: ${hit.email}\nرابط: https://www.instagram.com/${hit.username}\nمتابعين: ${hit.followers}\nبوستات: ${hit.posts}`;
      const safeCopyText = textToCopy.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
      return `
        <div class="card" style="padding:16px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:12px;margin-bottom:0;display:flex;flex-direction:column;gap:12px;text-align:right;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;width:100%;">
            <!-- Meta Stats & Actions -->
            <div style="display:flex;align-items:center;gap:8px;flex-direction:row-reverse;justify-content:flex-end;">
              <span style="font-size:15px;font-weight:700;color:var(--accent);">@${hit.username}</span>
              <span style="font-size:11px;color:var(--text-muted);">${new Date(hit.timestamp).toLocaleTimeString('ar-MA')}</span>
            </div>
            
            <div style="display:flex;gap:8px;align-items:center;">
              <a href="https://www.instagram.com/${hit.username}" target="_blank" class="btn btn-secondary" style="padding:5px 10px;font-size:11px;display:flex;align-items:center;gap:4px;">
                <i class="fas fa-external-link-alt"></i> فتح الرابط
              </a>
              <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${safeCopyText}').then(()=>showToast('✅ تم نسخ جميع البيانات للذاكرة','success'))" style="padding:5px 10px;font-size:11px;display:flex;align-items:center;gap:4px;">
                <i class="fas fa-copy"></i> نسخ التقرير كاملاً
              </button>
            </div>
          </div>

          <!-- Basic Info Badge -->
          <div style="font-size:11px;color:var(--text-muted);display:flex;gap:15px;flex-direction:row-reverse;justify-content:flex-end;margin-top:-4px;">
            <span>👤 الاسم: ${hit.fullName}</span>
            <span>📸 بوستات: ${hit.posts}</span>
            <span>👥 متابعين: ${hit.followers}</span>
          </div>

          <!-- Copyable Input Fields -->
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
            <!-- Combined user:email -->
            <div style="display:flex; align-items:center; gap:10px; direction:rtl;">
              <span style="font-size:12px; color:var(--text-primary); width:95px; flex-shrink:0; text-align:right;">اليوزر والإيميل:</span>
              <div style="display:flex; flex:1; background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:6px; overflow:hidden;">
                <input type="text" readonly value="${hit.username}:${hit.email}" style="background:transparent; border:none; color:#f472b6; font-size:12px; padding:6px 10px; flex:1; text-align:left; font-family:monospace; outline:none;" onclick="this.select()" />
                <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${hit.username}:${hit.email}').then(()=>showToast('✅ تم نسخ اليوزر والإيميل','success'))" style="border:none; border-radius:0; padding:6px 12px; background:rgba(255,255,255,0.05); font-size:11px; border-right:1px solid var(--border);">
                  <i class="fas fa-copy"></i> نسخ
                </button>
              </div>
            </div>

            <!-- Username & Email fields side-by-side -->
            <div style="display:flex; gap:12px; flex-wrap:wrap; width:100%;">
              <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:200px; direction:rtl;">
                <span style="font-size:12px; color:var(--text-primary); width:95px; flex-shrink:0; text-align:right;">اليوزر فقط:</span>
                <div style="display:flex; flex:1; background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:6px; overflow:hidden;">
                  <input type="text" readonly value="${hit.username}" style="background:transparent; border:none; color:var(--accent); font-size:12px; padding:6px 10px; flex:1; text-align:left; font-family:monospace; outline:none;" onclick="this.select()" />
                  <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${hit.username}').then(()=>showToast('✅ تم نسخ اليوزر','success'))" style="border:none; border-radius:0; padding:6px 10px; background:rgba(255,255,255,0.05); font-size:11px; border-right:1px solid var(--border);">
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
              </div>

              <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:200px; direction:rtl;">
                <span style="font-size:12px; color:var(--text-primary); width:95px; flex-shrink:0; text-align:right;">الإيميل فقط:</span>
                <div style="display:flex; flex:1; background:rgba(0,0,0,0.25); border:1px solid var(--border); border-radius:6px; overflow:hidden;">
                  <input type="text" readonly value="${hit.email}" style="background:transparent; border:none; color:var(--blue); font-size:12px; padding:6px 10px; flex:1; text-align:left; font-family:monospace; outline:none;" onclick="this.select()" />
                  <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${hit.email}').then(()=>showToast('✅ تم نسخ الإيميل','success'))" style="border:none; border-radius:0; padding:6px 10px; background:rgba(255,255,255,0.05); font-size:11px; border-right:1px solid var(--border);">
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function clearInstaHits() {
    if (!await showConfirm('هل أنت متأكد من مسح قائمة الحسابات المصطادة بالكامل؟')) return;
    try {
      const res = await fetch('/api/insta/hits/clear', { method: 'POST' });
      const data = await res.json();
      if (data && data.ok) {
        showToast('✅ تم مسح قائمة الحسابات المصطادة', 'success');
        fetchInstaHits();
      }
    } catch(e) {
      showToast('❌ فشل مسح القائمة', 'error');
    }
  }

  function startInstaHitsPolling() {
    if (isInstaHitsPolling) return;
    isInstaHitsPolling = true;
    fetchInstaHits();
    instaHitsInterval = setInterval(fetchInstaHits, 4000);
  }

  function stopInstaHitsPolling() {
    isInstaHitsPolling = false;
    if (instaHitsInterval) {
      clearInterval(instaHitsInterval);
      instaHitsInterval = null;
    }
  }

  // =================== CONTACTS PAGE ===================
  let _contacts = [];        // all contacts loaded from API
  let _contactFilter = 'all'; // current platform filter

  async function loadContacts() {
    const grid = document.getElementById('contacts-grid');
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size:28px;margin-bottom:12px;display:block;"></i>جاري التحميل...</div>`;
    document.getElementById('contacts-empty').style.display = 'none';
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error');
      _contacts = data.users || [];
      // Update stat counters
      document.getElementById('cnt-total').textContent = data.total || 0;
      document.getElementById('cnt-wa').textContent    = data.waCount || 0;
      document.getElementById('cnt-tg').textContent    = data.tgCount || 0;
      document.getElementById('cnt-fb').textContent    = data.fbCount || 0;
      renderContacts();
    } catch(e) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--red);"><i class="fas fa-exclamation-circle" style="font-size:28px;margin-bottom:10px;display:block;"></i>خطأ في تحميل جهات الاتصال</div>`;
    }
  }

  function setContactFilter(platform) {
    _contactFilter = platform;
    document.querySelectorAll('.contacts-filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('cbtn-' + platform);
    if (btn) btn.classList.add('active');
    renderContacts();
  }

  function renderContacts() {
    const grid    = document.getElementById('contacts-grid');
    const empty   = document.getElementById('contacts-empty');
    const query   = (document.getElementById('contacts-search')?.value || '').toLowerCase().trim();
    const sortBy  = document.getElementById('contacts-sort')?.value || 'name';

    let list = _contacts.filter(u => {
      if (_contactFilter !== 'all' && u.platform !== _contactFilter) return false;
      if (query) {
        const haystack = ((u.name || '') + ' ' + (u.id || '')).toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    // Sort
    if (sortBy === 'name') {
      list.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '', 'ar'));
    } else if (sortBy === 'platform') {
      list.sort((a, b) => (a.platform || '').localeCompare(b.platform || ''));
    } else if (sortBy === 'date') {
      list.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    }

    if (list.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    const platMeta = {
      whatsapp: { color: '#25d366', icon: 'fab fa-whatsapp',           bg: 'linear-gradient(135deg,#25d366,#128c7e)', label: 'WA'  },
      telegram: { color: '#38bdf8', icon: 'fab fa-telegram-plane',      bg: 'linear-gradient(135deg,#38bdf8,#0284c7)', label: 'TG'  },
      facebook: { color: '#0084ff', icon: 'fab fa-facebook-messenger',  bg: 'linear-gradient(135deg,#0084ff,#0044ff)', label: 'FB'  },
    };

    grid.innerHTML = list.map(u => {
      const meta        = platMeta[u.platform] || { color:'var(--accent)', icon:'fas fa-user', bg:'var(--accent)', label:'??' };
      const displayName = u.name || (u.platform === 'whatsapp' ? '+' + u.id : u.id);
      const subId       = u.name ? (u.platform === 'whatsapp' ? '+' : '') + u.id : '';
      const initials    = (u.name || u.id || '?').slice(0, 2).toUpperCase();
      const lastSeen    = u.lastSeen ? new Date(u.lastSeen).toLocaleDateString('ar-MA') : '—';
      const safeId      = (u.id || '').replace(/'/g, "\\'");
      const safeName    = displayName.replace(/'/g, "\\'").replace(/`/g, '\\`');
      const safeRawName = (u.name || '').replace(/'/g, "\\'").replace(/`/g, '\\`');

      // Build copy-all text: "Name | ID | Platform"
      const copyAllText = u.name
        ? `${u.name} | ${u.platform === 'whatsapp' ? '+' : ''}${u.id} | ${u.platform}`
        : `${u.platform === 'whatsapp' ? '+' : ''}${u.id} | ${u.platform}`;
      const safeCopyAll = copyAllText.replace(/'/g, "\\'").replace(/`/g, '\\`');

      return `
      <div class="card" style="padding:0;overflow:hidden;transition:transform .18s,box-shadow .18s;cursor:default;"
           onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.25)';"
           onmouseleave="this.style.transform='';this.style.boxShadow='';">
        <!-- Gradient banner -->
        <div style="height:56px;background:${meta.bg};opacity:0.85;"></div>
        <!-- Avatar -->
        <div style="display:flex;justify-content:center;margin-top:-28px;">
          <div style="width:56px;height:56px;border-radius:50%;background:${meta.bg};border:3px solid var(--bg-primary);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
            ${u.name ? initials : `<i class="${meta.icon}"></i>`}
          </div>
        </div>
        <!-- Info -->
        <div style="padding:10px 14px 14px;text-align:center;">
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${displayName}">${displayName}</div>
          ${subId ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;direction:ltr;">${subId}</div>` : ''}
          <div style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(${meta.color === '#25d366' ? '37,211,102' : meta.color === '#38bdf8' ? '56,189,248' : '0,132,255'},.12);color:${meta.color};">${meta.label}</span>
            <span style="font-size:10px;color:var(--text-muted);">آخر ظهور: ${lastSeen}</span>
          </div>
          <!-- Actions row 1: Copy buttons -->
          <div style="display:flex;gap:6px;margin-top:12px;">
            <button class="btn btn-primary" title="نسخ المعرف / الرقم" onclick="navigator.clipboard.writeText('${safeId}').then(()=>showToast('✅ تم نسخ المعرف','success'))" style="flex:1;padding:6px 4px;font-size:10px;background:rgba(99,179,237,0.08);border:1px solid rgba(99,179,237,0.2);color:var(--blue);">
              <i class="fas fa-hashtag"></i> ID
            </button>
            ${u.name ? `<button class="btn btn-primary" title="نسخ الاسم" onclick="navigator.clipboard.writeText('${safeRawName}').then(()=>showToast('✅ تم نسخ الاسم','success'))" style="flex:1;padding:6px 4px;font-size:10px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);color:var(--purple);">
              <i class="fas fa-user"></i> اسم
            </button>` : ''}
            <button class="btn btn-primary" title="نسخ كل المعلومات" onclick="navigator.clipboard.writeText(\`${safeCopyAll}\`).then(()=>showToast('✅ تم النسخ','success'))" style="flex:1;padding:6px 4px;font-size:10px;background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.2);color:var(--accent);">
              <i class="fas fa-copy"></i> نسخ
            </button>
          </div>
          <!-- Actions row 2: Message button -->
          <div style="margin-top:6px;">
            <button class="btn btn-primary" title="إرسال رسالة مباشرة" onclick="openDirectMessageModal('${safeId}','${u.platform}','${safeName}')" style="width:100%;padding:7px;font-size:11px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);color:var(--accent);">
              <i class="fas fa-paper-plane"></i> إرسال رسالة
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  async function contactsRefreshNames() {
    const btn = document.getElementById('btn-contacts-refresh');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الجلب...'; }
    try {
      const res = await fetch('/api/refresh-names', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ تم تحديث الأسماء بنجاح', 'success');
        await loadContacts();
      } else {
        showToast('❌ فشل جلب الأسماء: ' + (data.error || ''), 'error');
      }
    } catch(e) {
      showToast('❌ خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-id-badge"></i> جلب الأسماء'; }
    }
  }

  // Register Service Worker for PWA (installable app)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered successfully!', reg.scope))
        .catch((err) => console.error('Service Worker registration failed:', err));
    });
  }

  // PWA Install Banner Logic
  let deferredPrompt;
  const installBanner = document.getElementById('pwa-install-banner');
  const installBtn = document.getElementById('btn-pwa-install-act');
  const closeBtn = document.getElementById('btn-pwa-close-act');

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    if (localStorage.getItem('pwa-banner-dismissed') !== 'true') {
      setTimeout(() => {
        if (installBanner) installBanner.classList.add('show');
      }, 3000); // Show after 3 seconds of load
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // We've used the prompt, so we can't use it again
      deferredPrompt = null;
      // Hide the install banner
      if (installBanner) installBanner.classList.remove('show');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (installBanner) installBanner.classList.remove('show');
      // Remember dismissal so it doesn't prompt again during this session
      localStorage.setItem('pwa-banner-dismissed', 'true');
    });
  }

  window.addEventListener('appinstalled', (event) => {
    console.log('👍', 'appinstalled', event);
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    if (installBanner) installBanner.classList.remove('show');
  });

