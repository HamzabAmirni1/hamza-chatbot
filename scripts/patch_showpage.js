const fs = require('fs');
let content = fs.readFileSync('public/index.html', 'utf8');

const marker = '// Call page-specific data loaders and wait for them to finish rendering';
const endMarker = 'if (!isInitialLoad) {';

const markerIdx = content.indexOf(marker);
const endIdx = content.indexOf(endMarker);

if (markerIdx === -1 || endIdx === -1) {
  console.error('Markers not found!');
  process.exit(1);
}

const before = content.substring(0, markerIdx + marker.length);
const after = content.substring(endIdx);

const newLoaders = `
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

    `;

fs.writeFileSync('public/index.html', before + newLoaders + after, 'utf8');
console.log('✅ showPage updated successfully via robust search!');
