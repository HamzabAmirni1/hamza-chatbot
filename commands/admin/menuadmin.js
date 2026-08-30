const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const senderNum = chatId.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    const isOwner = config.ownerNumber.some(n => n.replace(/[^0-9]/g, '') === senderNum);

    if (!isOwner) {
        return await sock.sendMessage(chatId, { text: "⚠️ هذا الأمر مخصص للمطور فقط." }, { quoted: msg });
    }

    const menuText = `⚙️ *قائمة تحكم الإدارة (Admin Menu)*

🛡️ *أوامر النظام:*
• *.stats* - إحصائيات الاستخدام والأخطاء
• *.broadcast <msg>* - إذاعة رسالة لكل المنصات
• *.anticall on/off* - تفعيل/تعطيل منع المكالمات
• *.seturl <url>* - تحديث رابط السيرفر يدوياً
• *.traffic* - مراقبة حركة الزيارات

📱 *أوامر التواصل:*
• *.fbpost <text>* - نشر بوست على صفحة فيسبوك
• *.autopost on/off* - النشر التلقائي للأخبار/التريند
• *.instaboost <link>* - زيادة التفاعل (تجريبي)

🤖 *أوامر الذكاء الاصطناعي:*
• *.expert <text>* - استشارة خبير الذكاء الاصطناعي

────────────────
⚔️ *حمزة اعمرني Bot*`;

    await sock.sendMessage(chatId, { text: menuText }, { quoted: msg });
};
