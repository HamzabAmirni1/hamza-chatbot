const { db } = require('../../lib/supabase');
const chalk = require('chalk');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    try {
        const text = args.join(" ").trim();
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: "⚠️ *المرجو كتابة الرسالة بعد الأمر.*\nمثال: `.msgtodev السلام عليكم، لدي اقتراح...`" 
            }, { quoted: msg });
        }

        // Platform detection
        let platform = 'whatsapp';
        if (helpers && helpers.isTelegram) {
            platform = 'telegram';
        } else if (helpers && helpers.isFacebook) {
            platform = 'facebook';
        } else if (chatId && !chatId.includes('@')) {
            if (/^\d+$/.test(chatId)) {
                platform = chatId.length >= 15 ? 'facebook' : 'telegram';
            } else if (chatId.startsWith('-')) {
                platform = 'telegram';
            }
        }

        const senderId = chatId.replace('@s.whatsapp.net', '');
        const senderName = msg.pushName 
            || (msg.from && (msg.from.first_name || msg.from.username)) 
            || 'مستخدم غير معروف';

        const newMsg = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
            sender: senderId,
            senderName: senderName,
            platform: platform,
            text: text,
            timestamp: new Date().toISOString()
        };

        // Save directly to the dedicated dev_messages table in Supabase
        const saved = await db.saveDevMessage(newMsg);
        if (!saved) throw new Error('فشل الحفظ في قاعدة البيانات');

        // 🔔 Push real-time notification to dashboard
        if (global.pushNotification) {
            global.pushNotification('new_devmsg', {
                id: newMsg.id,
                sender: newMsg.sender,
                senderName: newMsg.senderName,
                platform: newMsg.platform,
                preview: text.length > 80 ? text.substring(0, 80) + '...' : text
            });
        }

        const replyText = `✅ *تم إرسال رسالتك إلى المطور بنجاح!*\n\n📝 *الرسالة المرسلة:* "${text}"\n\nسوف يقوم المطور بقراءتها والرد عليك مباشرة هنا في أقرب وقت. شكراً لتواصلك.`;
        await sock.sendMessage(chatId, { text: replyText }, { quoted: msg });

        console.log(chalk.green(`[msgtodev] ✅ Saved to DB from ${senderName} (${senderId}) on ${platform}`));

    } catch (e) {
        console.error("[msgtodev Error]:", e.message);
        await sock.sendMessage(chatId, { text: "❌ فشل إرسال الرسالة، يرجى المحاولة مرة أخرى لاحقاً." }, { quoted: msg });
    }
};
