const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

const OLD = `    } catch (err) {\r
      console.error('[Init] فشل التحميل:', err);\r
      if (err && (String(err).includes('401') || String(err).includes('Unauthorized'))) {\r
        localStorage.removeItem('auth_token');\r
        showLoginOverlay();\r
      } else {\r
        showToast('⚠️ فشل تحميل بعض البيانات — أعد تحميل الصفحة', 'error');\r
      }\r
    } finally {`;

const NEW = `    } catch (err) {\r
      console.error('[Init] فشل التحميل:', err);\r
      fetch('/api/log-client-error', {\r
        method: 'POST',\r
        headers: { 'Content-Type': 'application/json' },\r
        body: JSON.stringify({\r
          message: err ? err.message : 'Unknown',\r
          stack: err ? err.stack : '',\r
          url: window.location.href\r
        })\r
      }).catch(() => {});\r
      if (err && (String(err).includes('401') || String(err).includes('Unauthorized'))) {\r
        localStorage.removeItem('auth_token');\r
        showLoginOverlay();\r
      } else {\r
        showToast('⚠️ فشل تحميل بعض البيانات — أعد تحميل الصفحة', 'error');\r
      }\r
    } finally {`;

if (!content.includes(OLD)) {
  console.log('CRLF not found. Trying LF...');
  const OLD_LF = OLD.replace(/\r\n/g, '\n');
  const NEW_LF = NEW.replace(/\r\n/g, '\n');
  if (content.includes(OLD_LF)) {
    fs.writeFileSync('public/index.html', content.replace(OLD_LF, NEW_LF), 'utf8');
    console.log('✅ Updated with LF!');
  } else {
    console.error('OLD not found!');
  }
} else {
  fs.writeFileSync('public/index.html', content.replace(OLD, NEW), 'utf8');
  console.log('✅ Updated with CRLF!');
}
