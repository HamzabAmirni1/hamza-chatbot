const { getAutoGPTResponse } = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const task = args.join(" ");
    if (!task) return await sock.sendMessage(chatId, { text: "⚠️ أرجو كتابة المشكلة أو المهمة التي تريد فريق الخبراء التفكير بها." });

    const prompt = `أنت تمثل 'فريق خبراء' (AI Brainstorming Team).
    المهمة المطلوبة: "${task}"
    
    قم بتقسيم التفكير لـ 3 شخصيات:
    1. المخطط الاستراتيجي (The Strategist): يضع خطة العمل والخطوات.
    2. الخبير التقني (The Tech Expert): يذكر الأدوات والبرمجيات اللازمة.
    3. الناقد (The Critic): يرى العيوب والمخاطر.
    
    ثم قدم خلاصة نهائية للحل الأمثل بالدارجة المغربية بأسلوب ذكي.`;

    await sock.sendMessage(chatId, { react: { text: "🧠", key: msg.key } });
    await sock.sendMessage(chatId, { text: `🧠 *جاري استدعاء فريق الخبراء للتفكير في:* _${task}_` }, { quoted: msg });

    try {
        const response = await getAutoGPTResponse(chatId, prompt);
        await sock.sendMessage(chatId, { text: response }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(chatId, { text: "❌ خطأ في تشغيل فريق الخبراء." }, { quoted: msg });
    }
};
