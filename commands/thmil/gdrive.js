const axios = require('axios');
const mimeMap = {
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'text/plain': 'txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.android.package-archive': 'apk',
    'application/json': 'json',
};

const getExtension = (mime) => {
    if (!mime) return null;
    const cleanMime = mime.split(';')[0].trim().toLowerCase();
    return mimeMap[cleanMime] || null;
};

module.exports = async (sock, chatId, msg, args, helpers) => {
    const query = args.join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, { 
            text: '💡 *طريقة الاستخدام:*\n\n.gdrive [رابط ملف جوجل درايف]\n\n*أمثلة:*\n.gdrive https://drive.google.com/file/d/1A2B3C.../view\n.gdrive https://docs.google.com/document/d/1A2B3C.../edit' 
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    // Extract File ID
    const driveRegex = /folders\/([a-zA-Z0-9_-]{25,})|file\/d\/([a-zA-Z0-9_-]{25,})|\/d\/([a-zA-Z0-9_-]{25,})|id=([a-zA-Z0-9_-]{25,})/;
    const match = query.match(driveRegex);

    if (!match) {
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
        return sock.sendMessage(chatId, { 
            text: '❌ *رابط جوجل درايف غير صحيح أو غير مدعوم.*' 
        }, { quoted: msg });
    }

    // Check if it's a folder link
    if (query.includes('/folders/')) {
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
        return sock.sendMessage(chatId, { 
            text: '⚠️ *تنزيل المجلدات (Folders) بالكامل غير مدعوم حالياً. يرجى توفير رابط لملف فردي.*' 
        }, { quoted: msg });
    }

    const fileId = match[1] || match[2] || match[3] || match[4];
    
    try {
        let downloadUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
        let fileName = `gdrive_file_${fileId.substring(0, 6)}`;
        let mimetype = 'application/octet-stream';
        let isGoogleDoc = false;

        // Check if it is a Google Doc/Sheet/Slide edit URL
        if (query.includes('docs.google.com/document')) {
            downloadUrl = `https://docs.google.com/document/d/${fileId}/export?format=pdf`;
            fileName = `document_${fileId.substring(0, 6)}.pdf`;
            mimetype = 'application/pdf';
            isGoogleDoc = true;
        } else if (query.includes('docs.google.com/spreadsheets')) {
            downloadUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
            fileName = `spreadsheet_${fileId.substring(0, 6)}.xlsx`;
            mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            isGoogleDoc = true;
        } else if (query.includes('docs.google.com/presentation')) {
            downloadUrl = `https://docs.google.com/presentation/d/${fileId}/export?format=pdf`;
            fileName = `presentation_${fileId.substring(0, 6)}.pdf`;
            mimetype = 'application/pdf';
            isGoogleDoc = true;
        }

        await sock.sendMessage(chatId, { 
            text: `🔍 *جاري فحص الملف وجلب المعلومات من Google Drive...*` 
        }, { quoted: msg });

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        if (!isGoogleDoc) {
            // First request to check if it's a virus warning screen or to get the direct token
            const initRes = await axios.get(downloadUrl, {
                headers,
                timeout: 20000
            });

            // Handle virus warning confirmation
            if (typeof initRes.data === 'string' && initRes.data.includes('confirm=')) {
                const confirmMatch = initRes.data.match(/confirm=([a-zA-Z0-9_]+)/);
                if (confirmMatch) {
                    downloadUrl = `https://docs.google.com/uc?export=download&confirm=${confirmMatch[1]}&id=${fileId}`;
                }
            }
        }

        // Get file details (headers)
        const response = await axios.get(downloadUrl, {
            responseType: 'stream',
            headers,
            timeout: 20000
        });

        // Parse content type and file name from headers
        const contentType = response.headers['content-type'];
        if (contentType && !contentType.includes('text/html')) {
            mimetype = contentType;
        }

        const disposition = response.headers['content-disposition'];
        if (disposition) {
            const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/i);
            if (filenameMatch) {
                fileName = filenameMatch[1];
            } else {
                const filenameStarMatch = disposition.match(/filename\*=UTF-8''([^";\n]+)/i);
                if (filenameStarMatch) {
                    fileName = decodeURIComponent(filenameStarMatch[1]);
                }
            }
        } else if (!isGoogleDoc) {
            // If no filename is provided, try to guess the extension from mimetype
            const ext = getExtension(mimetype);
            if (ext) fileName += `.${ext}`;
        }

        const contentLength = response.headers['content-length'];
        const sizeMb = contentLength ? (parseInt(contentLength) / (1024 * 1024)).toFixed(2) : null;
        
        if (sizeMb && parseFloat(sizeMb) > 100) {
            await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
            return sock.sendMessage(chatId, {
                text: `⚠️ *الملف كبير جداً (${sizeMb} MB).* الحد الأقصى المسموح به للتنزيل هو *100 MB* لتجنب إجهاد الخادم.`
            }, { quoted: msg });
        }

        const infoText = `📊 *تفاصيل الملف:*
        
📁 *الاسم:* ${fileName}
💡 *النوع:* ${mimetype}
⚖️ *الحجم:* ${sizeMb ? `${sizeMb} MB` : 'غير معروف (جاري التحميل مباشر)'}

📥 *جاري تنزيل الملف وإرساله لك، المرجو الانتظار...*`;

        await sock.sendMessage(chatId, { text: infoText }, { quoted: msg });

        // Stream download into buffer to prevent raw file size issues
        const chunks = [];
        let downloadedSize = 0;

        await new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (downloadedSize > 100 * 1024 * 1024) { // Absolute 100MB cap
                    response.data.destroy();
                    reject(new Error('الملف يتجاوز الحد المسموح به (100MB)'));
                }
                chunks.push(chunk);
            });
            response.data.on('end', () => resolve());
            response.data.on('error', (err) => reject(err));
        });

        const fileBuffer = Buffer.concat(chunks);

        // Send to user
        await sock.sendMessage(chatId, {
            document: fileBuffer,
            fileName: fileName,
            mimetype: mimetype,
            caption: `✅ *تم تحميل الملف بنجاح من Google Drive!*\n\n🤖 Hamza Bot`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error('[Google Drive Downloader Error]:', e.message);
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
        return sock.sendMessage(chatId, { 
            text: `❌ *فشل تحميل الملف.*\n\n*السبب المحتمل:*\n- الملف ليس عاماً (Public) ويحتاج إلى إذن للوصول.\n- تجاوز الحد المسموح به لحجم الملف (100 MB).\n- تفاصيل الخطأ: ${e.message}`
        }, { quoted: msg });
    }
};
