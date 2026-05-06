/**
 * commands/admin/fbpost.js
 * 📘 نشر على صفحة الفيسبوك + Auto-Poster مجدول - للمالك فقط
 *
 * أوامر فورية:
 *  .fbpost [نص]              — نشر بوست نصي فوري
 *  .fbpost [نص] + رد على صورة — نشر صورة + نص فوراً
 *  .fbpost status            — معلومات الصفحة + حالة الـ schedule
 *
 * أوامر Auto-Post:
 *  .fbpost auto [HH:MM] [prompt]  — تفعيل Auto-Post يومي
 *  .fbpost auto off               — إيقاف Auto-Post
 *  .fbpost auto prompt [نص]       — تغيير الـ prompt فقط
 *  .fbpost auto time [HH:MM]      — تغيير الوقت فقط
 *  .fbpost auto test              — تجربة فورية للنشر التلقائي
 *  .fbpost auto noimg             — تفعيل بدون صورة
 */

const axios = require('axios');
const FormData = require('form-data');
const config = require('../../config');
const {
    getSchedule, setScheduleEnabled, setScheduleTime,
    setSchedulePrompt, runAutoPost, saveSchedule
} = require('../../lib/fbScheduler');

// ─── Owner Check ──────────────────────────────────────────────────────────────
function isOwner(sender) {
    const num = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    return config.ownerNumber.some(o => o.replace(/[^0-9]/g, '') === num);
}

function getPageId() {
    return process.env.FB_PAGE_ID || config.fbPageId || 'me';
}

// ─── Facebook API Helpers ─────────────────────────────────────────────────────
async function postTextToPage(message) {
    const res = await axios.post(
        `https://graph.facebook.com/v19.0/${getPageId()}/feed`,
        { message, access_token: config.fbPageAccessToken },
        { timeout: 15000 }
    );
    return res.data;
}

async function postPhotoToPage(imageBuffer, caption) {
    const form = new FormData();
    form.append('source', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    form.append('caption', caption || '');
    form.append('access_token', config.fbPageAccessToken);
    const res = await axios.post(
        `https://graph.facebook.com/v19.0/${getPageId()}/photos`,
        form,
        { headers: form.getHeaders(), timeout: 30000 }
    );
    return res.data;
}

async function postPhotoUrlToPage(imageUrl, caption) {
    const res = await axios.post(
        `https://graph.facebook.com/v19.0/${getPageId()}/photos`,
        { url: imageUrl, caption: caption || '', access_token: config.fbPageAccessToken },
        { timeout: 15000 }
    );
    return res.data;
}

async function getPageInfo() {
    const res = await axios.get(
        `https://graph.facebook.com/v19.0/${getPageId()}?fields=name,fan_count,link,category&access_token=${config.fbPageAccessToken}`,
        { timeout: 10000 }
    );
    return res.data;
}

// ─── Main Command ─────────────────────────────────────────────────────────────
module.exports = async (sock, chatId, msg, args) => {
    const sender = msg.key?.remoteJid || chatId;

    if (!isOwner(sender)) {
        return sock.sendMessage(chatId, { text: '❌ هذا الأمر للمالك فقط.' }, { quoted: msg });
    }

    if (!config.fbPageAccessToken) {
        return sock.sendMessage(chatId, {
            text: '❌ *fbPageAccessToken* غير مُعيَّن في الإعدادات.'
        }, { quoted: msg });
    }

    const sub = (args[0] || '').toLowerCase();

    // ════════════════════════════════════════════════════════
    // .fbpost auto — Auto-Post Scheduler Commands
    // ════════════════════════════════════════════════════════
    if (sub === 'auto' || sub === 'جدول' || sub === 'schedule') {
        const autoSub = (args[1] || '').toLowerCase();

        // .fbpost auto off — disable
        if (autoSub === 'off' || autoSub === 'stop' || autoSub === 'وقف') {
            setScheduleEnabled(false);
            return sock.sendMessage(chatId, {
                text:
                    `🔴 *تم إيقاف Auto-Post الفيسبوك.*\n\n` +
                    `لإعادة التفعيل: *.fbpost auto [HH:MM] [prompt]*\n\n` +
                    `⚔️ _${config.botName}_`
            }, { quoted: msg });
        }

        // .fbpost auto test — run now
        if (autoSub === 'test' || autoSub === 'جرب' || autoSub === 'now') {
            const sch = getSchedule();
            if (!sch.prompt) {
                return sock.sendMessage(chatId, {
                    text: `❌ لا يوجد prompt مُعيَّن بعد.\n\nاستخدم: *.fbpost auto [وقت] [موضوع البوست]*`
                }, { quoted: msg });
            }
            await sock.sendMessage(chatId, {
                text: `⏳ *جاري توليد ونشر البوست التجريبي...*\n📝 Prompt: _${sch.prompt}_`
            }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });
            const result = await runAutoPost(sock, sender);
            await sock.sendMessage(chatId, { react: { text: result.success ? '✅' : '❌', key: msg.key } });
            return;
        }

        // .fbpost auto prompt [new prompt]
        if (autoSub === 'prompt' || autoSub === 'موضوع') {
            const newPrompt = args.slice(2).join(' ').trim();
            if (!newPrompt) {
                return sock.sendMessage(chatId, {
                    text: `❌ المثال: *.fbpost auto prompt نصائح رمضانية يومية*`
                }, { quoted: msg });
            }
            const sch = getSchedule();
            setSchedulePrompt(newPrompt, sch.withImage !== false);
            return sock.sendMessage(chatId, {
                text: `✅ *تم تحديث الموضوع!*\n\n📝 *الموضوع الجديد:* ${newPrompt}\n🕐 *الوقت:* ${sch.time}\n\n⚔️ _${config.botName}_`
            }, { quoted: msg });
        }

        // .fbpost auto time [HH:MM]
        if (autoSub === 'time' || autoSub === 'وقت') {
            const newTime = args[2] || '';
            if (!/^\d{2}:\d{2}$/.test(newTime)) {
                return sock.sendMessage(chatId, {
                    text: `❌ صيغة الوقت غير صحيحة.\n\nالمثال: *.fbpost auto time 09:00*`
                }, { quoted: msg });
            }
            setScheduleTime(newTime);
            const sch = getSchedule();
            return sock.sendMessage(chatId, {
                text: `✅ *تم تحديث وقت النشر!*\n\n🕐 *الوقت الجديد:* ${newTime}\n📝 *الموضوع:* ${sch.prompt || '(غير مُعيَّن)'}\n\n⚔️ _${config.botName}_`
            }, { quoted: msg });
        }

        // .fbpost auto noimg — disable image generation
        if (autoSub === 'noimg' || autoSub === 'بدون-صورة') {
            const sch = getSchedule();
            sch.withImage = false;
            saveSchedule(sch);
            return sock.sendMessage(chatId, {
                text: `✅ سيتم النشر *بدون صورة* من الآن.\n\nلإعادة الصورة: *.fbpost auto img*`
            }, { quoted: msg });
        }

        // .fbpost auto img — enable image
        if (autoSub === 'img' || autoSub === 'بصورة') {
            const sch = getSchedule();
            sch.withImage = true;
            saveSchedule(sch);
            return sock.sendMessage(chatId, {
                text: `✅ سيتم توليد *صورة تلقائية* مع كل بوست.\n\n⚔️ _${config.botName}_`
            }, { quoted: msg });
        }

        // .fbpost auto [HH:MM] [prompt...] — setup full schedule
        const timeArg = args[1] || '';
        const promptArg = args.slice(2).join(' ').trim();

        if (/^\d{2}:\d{2}$/.test(timeArg) && promptArg) {
            // Set time + prompt + enable
            const sch = getSchedule();
            sch.time = timeArg;
            sch.prompt = promptArg;
            sch.enabled = true;
            sch.withImage = sch.withImage !== false;
            saveSchedule(sch);

            return sock.sendMessage(chatId, {
                text:
                    `✅ *Auto-Post الفيسبوك مُفعَّل!* 📘🎉\n\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `🕐 *الوقت:* كل يوم الساعة ${timeArg}\n` +
                    `📝 *الموضوع:* ${promptArg}\n` +
                    `🖼️ *صورة AI:* ${sch.withImage ? '✅ مُفعَّلة' : '❌ معطّلة'}\n` +
                    `━━━━━━━━━━━━━━━━━━\n\n` +
                    `💡 *أوامر إضافية:*\n` +
                    `  • *.fbpost auto test* — تجربة فورية\n` +
                    `  • *.fbpost auto off* — إيقاف\n` +
                    `  • *.fbpost auto prompt [موضوع]* — تغيير الموضوع\n` +
                    `  • *.fbpost auto time [HH:MM]* — تغيير الوقت\n` +
                    `  • *.fbpost auto noimg* — بدون صورة\n\n` +
                    `⚔️ _${config.botName}_`
            }, { quoted: msg });
        }

        // .fbpost auto — show status and help
        const sch = getSchedule();
        return sock.sendMessage(chatId, {
            text:
                `📘 *Auto-Post الفيسبوك* 📘\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🔘 *الحالة:* ${sch.enabled ? '🟢 مُفعَّل' : '🔴 موقوف'}\n` +
                `🕐 *وقت النشر:* ${sch.time || 'غير مُعيَّن'}\n` +
                `📝 *الموضوع:* ${sch.prompt || 'غير مُعيَّن'}\n` +
                `🖼️ *صورة AI:* ${sch.withImage !== false ? '✅ مُفعَّلة' : '❌ معطّلة'}\n` +
                `📅 *آخر نشر:* ${sch.lastPosted || 'لم يُنشر بعد'}\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `⚙️ *لتفعيل Auto-Post:*\n` +
                `*.fbpost auto 09:00 نصائح إسلامية يومية*\n` +
                `*.fbpost auto 14:00 اقتباسات تحفيزية*\n` +
                `*.fbpost auto 20:00 طرائف ونوادر مغربية*\n\n` +
                `⚔️ _${config.botName}_`
        }, { quoted: msg });
    }

    // ════════════════════════════════════════════════════════
    // .fbpost status — Page info + schedule status
    // ════════════════════════════════════════════════════════
    if (sub === 'status' || sub === 'info' || sub === 'معلومات') {
        try {
            await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });
            const [info, sch] = await Promise.all([getPageInfo(), getSchedule()]);

            const text =
                `📘 *صفحة الفيسبوك* 📘\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `📌 *الاسم:* ${info.name || 'غير متاح'}\n` +
                `👥 *المعجبون:* ${(info.fan_count || 0).toLocaleString()}\n` +
                `🏷️ *التصنيف:* ${info.category || 'غير متاح'}\n` +
                `🔗 ${info.link || 'غير متاح'}\n\n` +
                `📸 *Auto-Post:*\n` +
                `  🔘 ${sch.enabled ? '🟢 مُفعَّل' : '🔴 موقوف'}\n` +
                `  🕐 الوقت: ${sch.time || 'غير مُعيَّن'}\n` +
                `  📝 الموضوع: ${sch.prompt ? sch.prompt.substring(0, 60) + '...' : 'غير مُعيَّن'}\n` +
                `  📅 آخر نشر: ${sch.lastPosted || 'لم يُنشر بعد'}\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `⚔️ _${config.botName}_`;

            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
            return sock.sendMessage(chatId, { text }, { quoted: msg });
        } catch (e) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return sock.sendMessage(chatId, {
                text: `❌ فشل جلب معلومات الصفحة.\n\n${e.response?.data?.error?.message || e.message}`
            }, { quoted: msg });
        }
    }

    // ════════════════════════════════════════════════════════
    // .fbpost [نص] — Immediate manual post
    // ════════════════════════════════════════════════════════
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasQuotedImage = quotedMsg && quotedMsg.imageMessage;
    const caption = args.join(' ').trim();

    if (!caption && !hasQuotedImage) {
        const sch = getSchedule();
        return sock.sendMessage(chatId, {
            text:
                `📘 *نشر على صفحة الفيسبوك* 📘\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `📝 *بوست نصي فوري:*\n` +
                `  .fbpost [نص البوست]\n\n` +
                `🖼️ *بوست صورة + نص:*\n` +
                `  رُد على صورة + *.fbpost [وصف]*\n\n` +
                `🤖 *Auto-Post يومي:*\n` +
                `  *.fbpost auto [HH:MM] [موضوع]*\n` +
                `  مثال: *.fbpost auto 09:00 نصائح إسلامية*\n\n` +
                `📊 *حالة الصفحة والجدول:*\n` +
                `  *.fbpost status*\n\n` +
                `⚙️ *حالة Auto-Post:* ${sch.enabled ? '🟢 مُفعَّل (' + sch.time + ')' : '🔴 موقوف'}\n\n` +
                `⚔️ _${config.botName}_`
        }, { quoted: msg });
    }

    // Post with image (reply to image)
    if (hasQuotedImage) {
        try {
            await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });
            await sock.sendMessage(chatId, { text: '📤 *جاري رفع الصورة ونشر البوست...*' }, { quoted: msg });

            let result;
            const imgMsg = quotedMsg.imageMessage;

            // Try downloading via Baileys
            try {
                const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                const pino = require('pino');
                const imageBuffer = await downloadMediaMessage(
                    { key: msg.key, message: quotedMsg },
                    'buffer', {},
                    { logger: pino({ level: 'silent' }) }
                );
                if (imageBuffer) {
                    result = await postPhotoToPage(imageBuffer, caption);
                }
            } catch (e) { }

            // Fallback: post via URL
            if (!result && imgMsg?.url) {
                result = await postPhotoUrlToPage(imgMsg.url, caption);
            }

            if (!result) throw new Error('فشل تحميل الصورة من الرسالة.');

            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
            return sock.sendMessage(chatId, {
                text:
                    `✅ *تم نشر البوست بنجاح!* 📘🎉\n\n` +
                    `🖼️ *النوع:* صورة + نص\n` +
                    `📝 *الوصف:* ${caption || '(بدون وصف)'}\n` +
                    `🆔 *Post ID:* ${result.id || 'N/A'}\n\n` +
                    `⚔️ _${config.botName}_`
            }, { quoted: msg });
        } catch (e) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
            return sock.sendMessage(chatId, {
                text: `❌ *فشل نشر البوست!*\n\n⚠️ ${e.response?.data?.error?.message || e.message}`
            }, { quoted: msg });
        }
    }

    // Post text only
    try {
        await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });
        await sock.sendMessage(chatId, { text: '📤 *جاري نشر البوست...*' }, { quoted: msg });

        const result = await postTextToPage(caption);

        await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
        return sock.sendMessage(chatId, {
            text:
                `✅ *تم نشر البوست بنجاح!* 📘🎉\n\n` +
                `📝 *النوع:* نص\n` +
                `💬 *المحتوى:* ${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}\n` +
                `🆔 *Post ID:* ${result.id || 'N/A'}\n\n` +
                `⚔️ _${config.botName}_`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        return sock.sendMessage(chatId, {
            text:
                `❌ *فشل نشر البوست!*\n\n` +
                `⚠️ ${e.response?.data?.error?.message || e.message}\n\n` +
                `💡 *تأكد من:*\n` +
                `  • Page Access Token صالح\n` +
                `  • الصلاحيات: *pages_manage_posts*`
        }, { quoted: msg });
    }
};
