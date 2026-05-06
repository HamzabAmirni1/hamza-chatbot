const axios = require('axios');

module.exports = async (sock, chatId, msg, args, helpers) => {
    const query = args.join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, { 
            text: '💡 *طريقة الاستخدام:*\n\n.github https://github.com/user/repo\nأو\n.github user/repo' 
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });

    let user, repo;

    // Check if it's a link
    if (query.includes('github.com')) {
        const match = query.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/\s]+)/);
        if (match) {
            user = match[1];
            repo = match[2];
        }
    } else if (query.includes('/')) {
        const parts = query.split('/');
        user = parts[0];
        repo = parts[1];
    }

    if (!user || !repo) {
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
        return sock.sendMessage(chatId, { 
            text: '❌ *الرابط أو اسم المستودع غير صحيح!*\n\nمثال:\n.github facebook/react\nأو\n.github https://github.com/facebook/react' 
        }, { quoted: msg });
    }

    // Remove trailing .git or random queries if present
    repo = repo.split('?')[0].replace(/\.git$/, '');

    try {
        await sock.sendMessage(chatId, { 
            text: `🔍 *جاري البحث عن المستودع...*\n👤 ${user}\n📁 ${repo}` 
        }, { quoted: msg });

        // Get repo details using GitHub API
        const res = await axios.get(`https://api.github.com/repos/${user}/${repo}`);
        const data = res.data;

        const defaultBranch = data.default_branch;
        const zipUrl = `https://github.com/${user}/${repo}/archive/refs/heads/${defaultBranch}.zip`;
        const sizeMb = (data.size / 1024).toFixed(2); // GitHub returns size in KB
        
        // Let's create an informative caption
        let infoMessage = `📦 *معلومات المستودع (GitHub)* 📦\n\n`;
        infoMessage += `📌 *الاسم:* ${data.name}\n`;
        if (data.description) infoMessage += `📝 *الوصف:* ${data.description}\n`;
        infoMessage += `🌟 *النجوم:* ${data.stargazers_count} ⭐\n`;
        infoMessage += `🍴 *الفروق (Forks):* ${data.forks_count} 🍴\n`;
        infoMessage += `🌿 *الفرع (Branch):* ${defaultBranch}\n`;
        infoMessage += `💻 *اللغة:* ${data.language || 'غير محدد'}\n`;
        infoMessage += `⚖️ *الحجم تقريباً:* ${sizeMb} MB\n\n`;
        infoMessage += `📥 *جاري التنزيل، المرجو الانتظار قليلاً...*`;

        await sock.sendMessage(chatId, { text: infoMessage }, { quoted: msg });

        // Download document using WhatsApp's direct url download capability
        await sock.sendMessage(chatId, {
            document: { url: zipUrl },
            fileName: `${data.name}-${defaultBranch}.zip`,
            mimetype: 'application/zip',
            caption: `✅ تم التنزيل بنجاح!\n\n🤖 Hamza Bot`
        }, { quoted: msg });

        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (error) {
        console.error('GitHub command error:', error);
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
        
        if (error.response && error.response.status === 404) {
            return sock.sendMessage(chatId, { 
                text: '❌ *المستودع غير موجود أو أنه خاص (Private).*' 
            }, { quoted: msg });
        }
        
        if (error.response && error.response.status === 403) {
            return sock.sendMessage(chatId, { 
                text: '❌ *تم تجاوز الحد المسموح به لطلبات GitHub API. المرجو المحاولة لاحقاً.*' 
            }, { quoted: msg });
        }

        return sock.sendMessage(chatId, { 
            text: '❌ *حدث خطأ أثناء الاتصال بـ GitHub أو تنزيل المستودع لأن حجمه قد يكون كبيراً جداً.*' 
        }, { quoted: msg });
    }
};
