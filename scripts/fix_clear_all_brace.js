const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Find the target area around clearAllDevMessages and HELPERS
const target = `    } catch(e) {
      showToast('❌ خطأ: ' + e.message, 'error');
    }
  // =================== HELPERS ===================`;

const targetCRLF = `    } catch(e) {\r\n      showToast('❌ خطأ: ' + e.message, 'error');\r\n    }\r\n  // =================== HELPERS ===================`;

if (content.includes(target)) {
  content = content.replace(target, `    } catch(e) {\n      showToast('❌ خطأ: ' + e.message, 'error');\n    }\n  }\n\n  // =================== HELPERS ===================`);
  console.log('✅ Replaced using LF');
} else if (content.includes(targetCRLF)) {
  content = content.replace(targetCRLF, `    } catch(e) {\r\n      showToast('❌ خطأ: ' + e.message, 'error');\r\n    }\r\n  }\r\n\r\n  // =================== HELPERS ===================`);
  console.log('✅ Replaced using CRLF');
} else {
  // Let's do a more generic replacement
  const helperIndex = content.indexOf('// =================== HELPERS ===================');
  if (helperIndex !== -1) {
    const beforeHelper = content.substring(0, helperIndex);
    const afterHelper = content.substring(helperIndex);
    // Find the last '}' in beforeHelper
    const lastBrace = beforeHelper.lastIndexOf('}');
    // Check if we need to insert another '}'
    // Let's print the last 100 characters before the HELPERS comment
    console.log('Context before HELPERS:', JSON.stringify(content.substring(helperIndex - 100, helperIndex)));
    
    // We will insert '}\n\n  ' right before '// =================== HELPERS' if it's missing
    content = beforeHelper + '}\n\n  ' + afterHelper;
    console.log('✅ Replaced using index insertion');
  } else {
    console.error('❌ Could not find HELPERS marker!');
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
