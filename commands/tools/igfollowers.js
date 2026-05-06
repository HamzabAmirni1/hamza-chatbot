const axios = require('axios');
const chalk = require('chalk');
const config = require('../../config');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const senderId = msg.key?.participant || msg.key?.remoteJid || chatId;
    const isOwner = config.ownerNumber.some(n => n.replace(/[^0-9]/g, '') === senderId.replace(/[^0-9]/g, ''));

    if (!isOwner) {
        return await sock.sendMessage(chatId, { text: "⚠️ هذا الأمر خاص بالمطور فقط لضمان سلامة الحسابات." }, { quoted: msg });
    }

    const username = args[0];
    if (!username) {
        return await sock.sendMessage(chatId, { 
            text: `📊 *رشق متابعين إنستغرام (نسخة تجريبية)*\n\nالمرجو إرسال اسم المستخدم.\nمثال: \`.igfollowers hamza_amirni_01\`\n\n⚠️ ملاحظة: هذه الميزة تستخدم سيرفرات مجانية وقد لا تعمل دائماً. للرشق الحقيقي وبكميات كبيرة، يرجى ربط API لموقع SMM.` 
        }, { quoted: msg });
    }

    const cleanUser = username.replace('@', '');
    await sock.sendMessage(chatId, { text: `🚀 جاري محاولة إرسال متابعين إلى \`@${cleanUser}\`...\nيرجى الانتظار، العملية قد تستغرق دقيقة.` }, { quoted: msg });

    const apis = [
        `https://api.vreden.my.id/api/social/ig/followers?username=${cleanUser}&apikey=vreden`,
        `https://api.siputzx.my.id/api/social/ig/followers?username=${cleanUser}`,
        `https://api.ryzendesu.vip/api/social/ig/followers?username=${cleanUser}`,
        `https://api.shizuhub.xyz/api/tools/ig-followers?username=${cleanUser}`,
        `https://skizo.tech/api/instagram/followers?username=${cleanUser}&apikey=skizo`,
        `https://api.betabotz.org/api/tools/ig-followers?username=${cleanUser}&apikey=beta`
    ];

    let success = false;
    let responseMsg = "";

        try {
            console.log(chalk.cyan(`[IG-Boost] Trying API: ${api}`));
            const { data } = await axios.get(api, { 
                timeout: 20000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Origin': 'https://vreden.my.id',
                    'Referer': 'https://vreden.my.id/'
                }
            });
            if (data.status === true || data.success === true || data.status === 200 || (typeof data.result === 'string' && data.result.toLowerCase().includes("success"))) {
                success = true;
                responseMsg = data.result || data.message || data.data?.message || "تم إرسال المتابعين بنجاح (كمية تجريبية).";
                break;
            }
        } catch (e) {
            console.log(chalk.yellow(`[IG-Boost] API Failed: ${api} - ${e.message}`));
        }
    }

    if (success) {
        return await sock.sendMessage(chatId, { 
            text: `✅ *تمت العملية بنجاح!*\n\n👤 الحساب: @${cleanUser}\n📝 النتيجة: ${responseMsg}\n\n💡 قد يستغرق ظهور المتابعين في حسابك من 5 إلى 30 دقيقة. لا تنسى متابعة @hamza_amirni_01` 
        }, { quoted: msg });
    } else {
        // Fallback simulation or instructions
        return await sock.sendMessage(chatId, { 
            text: `❌ *عذراً، السيرفرات المجانية مضغوطة حالياً.*\n\n💡 يمكنك استخدام هذه المواقع يدوياً للحصول على متابعين مجانيين:\n1. poprey.com (10 Free)\n2. famoid.com (Free Trial)\n3. mrpopular.net (Free Tools)\n\nأو يمكنك طلب ربط SMM Panel خاصة بك في البوت!` 
        }, { quoted: msg });
    }
};
