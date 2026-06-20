const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse, detectLanguage } = require('./ai');
const chalk = require('chalk');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { ALL_COMMANDS, NLC_KEYWORDS } = require('./commandMap');
const { db } = require('./supabase');
const { checkSubscriptionGate, getSubscriptionMessage, getWelcomeMessage } = require('./subscription');

// Save Telegram user to local file + Supabase (persists across restarts)
function saveTelegramUser(chatId) {
    try {
        const dbPath = path.join(__dirname, '..', 'data', 'tg_users.json');
        fs.ensureDirSync(path.dirname(dbPath));
        let users = [];
        if (fs.existsSync(dbPath)) {
            try { users = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch (e) { users = []; }
        }
        const id = chatId.toString();
        if (!users.includes(id)) {
            users.push(id);
            fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
        }
    } catch (e) { }
    // Also persist to Supabase ai_memory with tg: prefix
    try { db.upsertPlatformUser(`tg:${chatId}`); } catch (e) {}
}

function startTelegramBot(manualToken) {
    const token = manualToken || config.telegramToken;
    if (!token) {
        console.log(chalk.red('⚠️ Telegram Token not set. Skipping Telegram Bot.'));
        return;
    }

    const bot = new TelegramBot(token, { polling: true });
    global.telegramBot = bot;

    bot.getMe().then(me => {
        global.tgBotUsername = me.username;
        console.log(chalk.green(`🤖 Telegram Bot Username: @${me.username}`));
    }).catch(e => {
        console.error("Failed to get Telegram bot username:", e.message);
    });

    console.log(chalk.green('✅ Telegram Bot is running...'));

    // Helper to create a mock sock for commands
    function createMockSock(bot, msg, chatId) {
        const mockSock = {
            waUploadToServer: async () => ({ url: "" }),
            downloadMedia: async (targetMsg) => {
                try {
                    const message = targetMsg.reply_to_message || targetMsg.message || targetMsg;
                    let fileId;
                    if (message.photo) fileId = message.photo[message.photo.length - 1].file_id;
                    else if (message.video) fileId = message.video.file_id;
                    else if (message.document) fileId = message.document.file_id;
                    else if (message.audio) fileId = message.audio.file_id;
                    else if (message.voice) fileId = message.voice.file_id;
                    if (!fileId) return null;
                    const fileLink = await bot.getFileLink(fileId);
                    const resp = await axios.get(fileLink, { responseType: 'arraybuffer' });
                    return Buffer.from(resp.data);
                } catch (e) { return null; }
            },
            downloadMediaMessage: async (targetMsg) => await mockSock.downloadMedia(targetMsg),
            sendMessage: async (id, content, opts) => {
                // Remove default Markdown to avoid "can't parse entities" errors from AI responses
                let options = { ...(content.reply_markup ? { reply_markup: content.reply_markup } : {}) };
                if (content.text) return bot.sendMessage(id, content.text, options);
                if (content.image) {
                    const photoSource = content.image.url || content.image;
                    const isBuffer = Buffer.isBuffer(photoSource);
                    try {
                        return await bot.sendPhoto(id, photoSource, { caption: content.caption, ...options }, isBuffer ? { filename: 'image.jpg', contentType: 'image/jpeg' } : {});
                    } catch (e) {
                        if (content.image.url) {
                            const resp = await axios.get(content.image.url, { responseType: 'arraybuffer' });
                            return await bot.sendPhoto(id, Buffer.from(resp.data), { caption: content.caption, ...options }, { filename: 'image.jpg', contentType: 'image/jpeg' });
                        }
                    }
                }
                if (content.video) {
                    try { return await bot.sendVideo(id, content.video.url || content.video, { caption: content.caption, ...options }); }
                    catch (e) {
                        if (content.video.url) {
                            const resp = await axios.get(content.video.url, { responseType: 'arraybuffer' });
                            return await bot.sendVideo(id, Buffer.from(resp.data), { caption: content.caption, ...options });
                        }
                        throw e;
                    }
                }
                if (content.audio) {
                    // Build title from fileName (e.g. "T-Flow - BRM BRM.mp3" -> "T-Flow - BRM BRM")
                    const rawName = content.fileName || content.caption || 'audio';
                    const audioTitle = rawName.replace(/\.mp3$/i, '').trim();
                    const audioOptions = {
                        caption: content.caption || undefined,
                        title: audioTitle,
                        filename: rawName.endsWith('.mp3') ? rawName : `${audioTitle}.mp3`,
                        ...options
                    };
                    try { return await bot.sendAudio(id, content.audio.url || content.audio, audioOptions); }
                    catch (e) {
                        if (content.audio.url) {
                            const resp = await axios.get(content.audio.url, { responseType: 'arraybuffer' });
                            return await bot.sendAudio(id, Buffer.from(resp.data), audioOptions);
                        }
                        throw e;
                    }
                }
                if (content.document) {
                    try {
                        const docSource = content.document.url || content.document;
                        return await bot.sendDocument(id, docSource, { caption: content.caption, ...options });
                    } catch (e) {
                        if (content.document.url) {
                            const resp = await axios.get(content.document.url, { responseType: 'arraybuffer' });
                            return await bot.sendDocument(id, Buffer.from(resp.data), { caption: content.caption, ...options }, { filename: content.fileName || 'file' });
                        }
                        throw e;
                    }
                }
                if (content.react) return;
            },
            relayMessage: async (id, message, opts) => {
                // Fallback for Interactive Messages (WhatsApp Carousel/Buttons)
                try {
                    const interactive = message?.viewOnceMessage?.message?.interactiveMessage || message?.interactiveMessage;
                    if (interactive) {
                        const bodyText = interactive.body?.text || "";
                        const footerText = interactive.footer?.text || "";
                        const fullText = `${bodyText}\n\n_${footerText}_`.trim();
                        if (fullText) return bot.sendMessage(id, fullText); // No Markdown here either
                    }
                } catch (e) {
                    console.error('[Telegram Relay Error]:', e.message);
                }
            }
        };
        return mockSock;
    }

    // ===== MENU HELPER FUNCTIONS (defined here so available to both message & callback handlers) =====
    function sendTelegramMenu(bot, chatId, editMsgId, msg) {
        const cfg = require('../config');
        const menuText = `📋 *قائمة بوت ${cfg.botName}*\n━━━━━━━━━━━━━━━━\n\nاختر تصنيفاً لرؤية الأوامر:`;
        const mainKeyboard = {
            inline_keyboard: [
                [{ text: '🎨 AI صور', callback_data: 'menu_cat_images' }, { text: '🧠 AI ذكي', callback_data: 'menu_cat_ai' }],
                [{ text: '📥 تحميل', callback_data: 'menu_cat_download' }, { text: '🕋 إسلامي', callback_data: 'menu_cat_islamic' }],
                [{ text: '🛠️ أدوات', callback_data: 'menu_cat_tools' }, { text: '🛡️ إدارة', callback_data: 'menu_cat_admin' }],
                [{ text: '📸 Instagram', url: cfg.instagram }, { text: '💬 WhatsApp', url: cfg.officialChannel }],
                [{ text: '❌ إغلاق', callback_data: 'menu_close' }]
            ]
        };
        if (editMsgId) {
            return bot.editMessageText(menuText, {
                chat_id: chatId, message_id: editMsgId,
                parse_mode: 'Markdown', reply_markup: mainKeyboard
            }).catch(() => bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown', reply_markup: mainKeyboard }));
        }
        return bot.sendMessage(chatId, menuText, { parse_mode: 'Markdown', reply_markup: mainKeyboard });
    }

    function editToMainMenu(bot, chatId, msgId) {
        return sendTelegramMenu(bot, chatId, msgId, null);
    }

    const MENU_CATEGORIES = {
        images: {
            title: '🎨 أوامر توليد الصور',
            cmds: [
                [{ text: '.gen 🎨', callback_data: 'menu_cmd_gen' }, { text: '.imagine ✨', callback_data: 'menu_cmd_imagine' }],
                [{ text: '.draw 🖌️', callback_data: 'menu_cmd_draw' }, { text: '.deepimg 🤖', callback_data: 'menu_cmd_deepimg' }],
                [{ text: '.removebg 🗑️', callback_data: 'menu_cmd_removebg' }, { text: '.hd 📸', callback_data: 'menu_cmd_hd' }],
                [{ text: '.sketch ✏️', callback_data: 'menu_cmd_sketch' }, { text: '.wallpaper 🖼️', callback_data: 'menu_cmd_wallpaper' }],
                [{ text: '.blur 🌫️', callback_data: 'menu_cmd_blur' }, { text: '.colorize 🌈', callback_data: 'menu_cmd_colorize' }],
                [{ text: '🔙 رجوع', callback_data: 'menu_main' }, { text: '❌ إغلاق', callback_data: 'menu_close' }]
            ]
        },
        ai: {
            title: '🧠 أوامر الذكاء الاصطناعي',
            cmds: [
                [{ text: '.deepseek 🤖', callback_data: 'menu_cmd_deepseek' }, { text: '.gpt4o 💬', callback_data: 'menu_cmd_gpt4o' }],
                [{ text: '.analyze 📊', callback_data: 'menu_cmd_analyze' }, { text: '.vision 👁️', callback_data: 'menu_cmd_vision' }],
                [{ text: '.sd 🎨', callback_data: 'menu_cmd_sd' }, { text: '.txt2img 🖼️', callback_data: 'menu_cmd_txt2img' }],
                [{ text: '🔙 رجوع', callback_data: 'menu_main' }, { text: '❌ إغلاق', callback_data: 'menu_close' }]
            ]
        },
        download: {
            title: '📥 أوامر التحميل',
            cmds: [
                [{ text: '.play 🎵', callback_data: 'menu_cmd_play' }, { text: '.video 📹', callback_data: 'menu_cmd_video' }],
                [{ text: '.fb 📘', callback_data: 'menu_cmd_fb' }, { text: '.ig 📸', callback_data: 'menu_cmd_ig' }],
                [{ text: '.tiktok 🎬', callback_data: 'menu_cmd_tiktok' }, { text: '.ytmp4 📺', callback_data: 'menu_cmd_ytmp4' }],
                [{ text: '.lyrics 🎶', callback_data: 'menu_cmd_lyrics' }, { text: '.tomp3 🎧', callback_data: 'menu_cmd_tomp3' }],
                [{ text: '🔙 رجوع', callback_data: 'menu_main' }, { text: '❌ إغلاق', callback_data: 'menu_close' }]
            ]
        },
        islamic: {
            title: '🕋 الأوامر الإسلامية',
            cmds: [
                [{ text: '.quran 📖', callback_data: 'menu_cmd_quran' }, { text: '.quranmp3 🎙️', callback_data: 'menu_cmd_quranmp3' }],
                [{ text: '.ayah 📜', callback_data: 'menu_cmd_ayah' }, { text: '.tafsir 📚', callback_data: 'menu_cmd_tafsir' }],
                [{ text: '.dua 🤲', callback_data: 'menu_cmd_dua' }, { text: '.salat 🕌', callback_data: 'menu_cmd_salat' }],
                [{ text: '🔙 رجوع', callback_data: 'menu_main' }, { text: '❌ إغلاق', callback_data: 'menu_close' }]
            ]
        },
        tools: {
            title: '🛠️ الأدوات والمعلومات',
            cmds: [
                [{ text: '.ping 🏓', callback_data: 'menu_cmd_ping' }, { text: '.weather 🌦️', callback_data: 'menu_cmd_weather' }],
                [{ text: '.translate 🌐', callback_data: 'menu_cmd_translate' }, { text: '.tts 🔊', callback_data: 'menu_cmd_tts' }],
                [{ text: '.qr 📱', callback_data: 'menu_cmd_qr' }, { text: '.sticker 🖼️', callback_data: 'menu_cmd_sticker' }],
                [{ text: '.ss 🖥️', callback_data: 'menu_cmd_ss' }, { text: '.ocr 📄', callback_data: 'menu_cmd_ocr' }],
                [{ text: '.mega 📦', callback_data: 'menu_cmd_mega' }, { text: '.owner 👤', callback_data: 'menu_cmd_owner' }],
                [{ text: '🔙 رجوع', callback_data: 'menu_main' }, { text: '❌ إغلاق', callback_data: 'menu_close' }]
            ]
        },
        admin: {
            title: '🛡️ أوامر الإدارة (المجموعات)',
            cmds: [
                [{ text: '.kick 🚫', callback_data: 'menu_cmd_kick' }, { text: '.ban 🔨', callback_data: 'menu_cmd_ban' }],
                [{ text: '.promote ⭐', callback_data: 'menu_cmd_promote' }, { text: '.tagall 📢', callback_data: 'menu_cmd_tagall' }],
                [{ text: '.antilink 🔗', callback_data: 'menu_cmd_antilink' }],
                [{ text: '🔙 رجوع', callback_data: 'menu_main' }, { text: '❌ إغلاق', callback_data: 'menu_close' }]
            ]
        }
    };

    function showMenuCategory(bot, chatId, msgId, cat) {
        const category = MENU_CATEGORIES[cat];
        if (!category) return editToMainMenu(bot, chatId, msgId);
        return bot.editMessageText(`${category.title}\n━━━━━━━━━━━━━━━━\n\nاختر أمراً لتنفيذه أو اضغط *رجوع* للقائمة الرئيسية:`, {
            chat_id: chatId, message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: category.cmds }
        }).catch(() => {});
    }
    // ===== END MENU HELPER FUNCTIONS =====

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id.toString();
        const userId = msg.from.id;
        const text = msg.text || msg.caption || "";

        msg.key = { fromMe: false, id: msg.message_id.toString(), remoteJid: chatId };
        msg.pushName = msg.from.first_name;

        if (msg.from.is_bot) return;

        // Check if user is banned
        try {
            const bannedPath = path.join(__dirname, '..', 'data', 'banned.json');
            let bannedUsers = [];
            if (fs.existsSync(bannedPath)) {
                bannedUsers = JSON.parse(fs.readFileSync(bannedPath, 'utf8') || '[]');
            }
            if (bannedUsers.includes(`tg:${chatId}`) || bannedUsers.includes(chatId)) {
                console.log(chalk.red(`[Telegram] Banned user tried to message: ${chatId}`));
                return;
            }
        } catch (_) {}

        // Track Telegram user
        saveTelegramUser(chatId);

        // Activity log for dashboard
        try {
            global._activityLog = global._activityLog || [];
            const preview = text ? (text.length > 60 ? text.substring(0, 60) + '...' : text) : '[Media]';
            global._activityLog.unshift({
                time: new Date().toISOString(),
                platform: 'telegram',
                user: msg.from.first_name || chatId,
                message: preview
            });
            if (global._activityLog.length > 50) global._activityLog.length = 50;
        } catch (_) {}

        // Skip AI processing for non-text messages unless they are commands
        const isCommand = text.startsWith('.') || text.startsWith('/');
        if (!text && !msg.photo && !msg.video) return;

        console.log(chalk.cyan(`[Telegram] Message from ${msg.from.first_name}: ${text || '[Media]'}`));

        const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

        if (isGroup) {
            // If it's a group, only reply to messages if:
            // 1. It starts with a command prefix (. or /)
            // 2. OR it mentions the bot username
            // 3. OR it's a reply to the bot's own message
            // 4. OR group chatbot auto-reply is explicitly enabled
            const botUsername = global.tgBotUsername || "";
            const isPrefixed = text.startsWith('.') || text.startsWith('/');
            const isMentioned = botUsername && text.includes(`@${botUsername}`);
            const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot;
            
            if (config.enableGroupChatbot !== 'true' && !isPrefixed && !isMentioned && !isReplyToBot) {
                return; // Skip normal chatter in Telegram groups
            }
        }

        const isAdmin = isGroup ? await checkTGAdmin(bot, chatId, userId) : true;

        // Automatic Media Analysis (Photo/Video)
        if ((msg.photo || msg.video) && !isCommand) {
            try {
                const analyze = require('../commands/ai/analyze');
                const mockSock = createMockSock(bot, msg, chatId);
                const buffer = await mockSock.downloadMedia(msg);
                if (buffer) {
                    await analyze(mockSock, chatId, msg, (text || "").split(" "), { isTelegram: true, buffer, isVideo: !!msg.video, caption: text }, detectLanguage(text));
                    return;
                }
            } catch (e) {
                console.error('[Telegram Media Error]:', e.message);
            }
        }

        // Anti-Link logic
        if (isGroup && !isAdmin && text.match(/chat.whatsapp.com|t.me|facebook.com|http/i)) {
            const settings = getGroupSettings(chatId);
            if (settings.antilink) {
                try {
                    await bot.deleteMessage(chatId, msg.message_id);
                    return bot.sendMessage(chatId, `⚠️ *تم حذف الرابط!* الروابط ممنوعة في هذه المجموعة.\n👤 @${msg.from.username || msg.from.first_name}`, { parse_mode: 'Markdown' });
                } catch (e) { }
            }
        }

        // ===== SUBSCRIPTION GATE REMOVED =====
        // Was blocking all users after Koyeb restarts (ephemeral filesystem wipes subscribed_users.json)
        // Social links are shown in /start instead
        // ===== END =====

        if (text.startsWith('/start')) {
            return bot.sendMessage(chatId, `✨ *مرحباً بك يا ${msg.from.first_name}!* ✨\n\nأنا بوت *حمزة اعمرني* المطور، أعمل بالذكاء الاصطناعي.\n\n🤖 يمكنني الإجابة على أسئلتك، رسم الصور، وتحميل الفيديوهات.\n\n📋 اضغط على زر *القائمة* لرؤية جميع الأوامر.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        [{ text: '📋 القائمة' }, { text: '🤖 AI Chat' }],
                        [{ text: '📥 تحميل' }, { text: '🕋 إسلامي' }],
                        [{ text: '🛠️ أدوات' }, { text: '📞 تواصل معنا' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }

        // Handle persistent keyboard shortcuts
        if (text === '📋 القائمة') {
            return sendTelegramMenu(bot, chatId, null, msg);
        }
        if (text === '📞 تواصل معنا') {
            const config = require('../config');
            return bot.sendMessage(chatId, `📞 *تواصل مع المطور:*\n\n👤 Telegram: @hamzaamirni\n📸 Instagram: ${config.instagram}\n📘 Facebook: ${config.facebookPage}\n🎥 YouTube: ${config.youtube}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💬 Telegram', url: 'https://t.me/hamzaamirni' }, { text: '📸 Instagram', url: config.instagram }],
                        [{ text: '📘 Facebook', url: config.facebookPage }, { text: '🎥 YouTube', url: config.youtube }]
                    ]
                }
            });
        }
        if (text === '🤖 AI Chat') {
            return bot.sendMessage(chatId, `🧠 *أوامر الذكاء الاصطناعي:*\n\n.deepseek - DeepSeek AI\n.gpt4o - ChatGPT 4o\n.analyze - تحليل الصور\n.vision - رؤية الصور\n.gen - توليد صورة\n.imagine - إبداع صورة\n.draw - رسم صورة`, { parse_mode: 'Markdown' });
        }
        if (text === '📥 تحميل') {
            return bot.sendMessage(chatId, `📥 *أوامر التحميل:*\n\n.play - تشغيل أغنية\n.video - تحميل فيديو\n.fb - تحميل من Facebook\n.ig - تحميل من Instagram\n.tiktok - تحميل من TikTok\n.ytmp4 - تحميل من YouTube\n.lyrics - كلمات الأغنية`, { parse_mode: 'Markdown' });
        }
        if (text === '🕋 إسلامي') {
            return bot.sendMessage(chatId, `🕋 *الأوامر الإسلامية:*\n\n.quran - آية قرآنية\n.quranmp3 - صوت قرآن\n.ayah - آية عشوائية\n.tafsir - تفسير آية\n.dua - دعاء\n.salat on/off - مواقيت الصلاة`, { parse_mode: 'Markdown' });
        }
        if (text === '🛠️ أدوات') {
            return bot.sendMessage(chatId, `🛠️ *أدوات متنوعة:*\n\n.ping - اختبار الاتصال\n.weather - الطقس\n.translate - ترجمة\n.qr - QR Code\n.tts - نص إلى صوت\n.sticker - ملصق\n.ss - لقطة شاشة`, { parse_mode: 'Markdown' });
        }

        try {
            const body = text;
            const lowerBody = body.toLowerCase().trim();
            const cmdMatch = body.match(/^[\.\/]([a-zA-Z0-9\u0600-\u06FF]+)(\s+.*|$)/i);

            let commandHandled = false;

            if (cmdMatch) {
                const command = cmdMatch[1].toLowerCase();
                const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);

                // Use unified command map (same as WhatsApp & Facebook)
                const allCmds = ALL_COMMANDS;

                // Internal Admin/Group Handlers
                if (["kick", "ban", "promote", "tagall", "antilink"].includes(command)) {
                    if (!isAdmin) return bot.sendMessage(chatId, "⚠️ هذا الأمر للمشرفين فقط.");
                    if (command === "kick" || command === "ban") {
                        const targetId = msg.reply_to_message?.from?.id;
                        if (!targetId) return bot.sendMessage(chatId, "⚠️ يرجى الرد على رسالة الشخص المراد طرده/حضره.");
                        try {
                            if (command === "kick") await bot.unbanChatMember(chatId, targetId); // TGs kick is unban after ban
                            else await bot.banChatMember(chatId, targetId);
                            return bot.sendMessage(chatId, `✅ تم التنفيذ بنجاح.`);
                        } catch (e) { return bot.sendMessage(chatId, `❌ فشل التنفيذ. تأكد أنني مشرف.`); }
                    }
                    if (command === "promote") {
                        const targetId = msg.reply_to_message?.from?.id;
                        if (!targetId) return bot.sendMessage(chatId, "⚠️ يرجى الرد على الشخص المراد ترقيته.");
                        try {
                            await bot.promoteChatMember(chatId, targetId, { can_manage_chat: true, can_post_messages: true });
                            return bot.sendMessage(chatId, `✅ تمت الترقية بنجاح.`);
                        } catch (e) { return bot.sendMessage(chatId, `❌ فشل الترقية.`); }
                    }
                    if (command === "tagall") {
                        try {
                            const admins = await bot.getChatAdministrators(chatId);
                            let tag = `📢 *تنبيه للجميع:*\n\n${args.join(' ') || 'تنبيه'}\n\n`;
                            admins.forEach(ad => { if (ad.user.username) tag += `@${ad.user.username} `; });
                            return bot.sendMessage(chatId, tag, { parse_mode: 'Markdown' });
                        } catch (e) { }
                    }
                    if (command === "antilink") {
                        const settings = getGroupSettings(chatId);
                        settings.antilink = args[0] === "on";
                        saveGroupSettings(chatId, settings);
                        return bot.sendMessage(chatId, `✅ تم ${settings.antilink ? 'تفعيل' : 'تعطيل'} نظام منع الروابط.`);
                    }
                    commandHandled = true;
                }

                if (allCmds[command]) {
                    try {
                        const cmdFile = require(`../commands/${allCmds[command]}`);
                        const mockSock = createMockSock(bot, msg, chatId);
                        const helpers = { isTelegram: true, command: command };
                        await cmdFile(mockSock, chatId, msg, args, helpers, detectLanguage(text));
                        commandHandled = true;
                        if (global.trackCommand) global.trackCommand(command, 'telegram');
                    } catch (err) {
                        console.error('[Telegram Command Error]:', err.message);
                    }
                }
            }

            if (!commandHandled && text) {
                // Use unified NLC map (same as WhatsApp & Facebook)
                const nlcKeywords = NLC_KEYWORDS;

                for (const [key, path] of Object.entries(nlcKeywords)) {
                    // Use word boundaries for NLC to avoid matching inside other commands
                    if (new RegExp(`(\\b|\\s|^)(${key})(\\b|\\s|$)`, "i").test(lowerBody)) {
                        try {
                            const rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                            const cmdFile = require(`../commands/${path}`);
                            const mockSock = createMockSock(bot, msg, chatId);
                            const helpers = { isTelegram: true, command: path.split('/').pop() };
                            await cmdFile(mockSock, chatId, msg, rest, helpers, detectLanguage(text));
                            commandHandled = true;
                            if (global.trackCommand) global.trackCommand(path.split('/').pop(), 'telegram');
                            break;
                        } catch (e) { }
                    }
                }
            }

            if (commandHandled || !text) return;

            // If chatbot is disabled globally, skip AI chat responses (read fresh config every time)
            if (require('../config').enableChatbot === 'false') return;

            // Follow-up on recent image
            const context = await getContext(chatId);
            const isRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
            if (isRecentImg && text.length > 2 && !text.startsWith(".")) {
                try {
                    const analyze = require('../commands/ai/analyze');
                    const mockSock = createMockSock(bot, msg, chatId);
                    await analyze(mockSock, chatId, msg, text.split(" "), { buffer: context.lastImage.buffer, mime: context.lastImage.mime, caption: text }, detectLanguage(text));
                    return;
                } catch (e) { }
            }

            // AI Race — Pollinations first (fastest + best Arabic), then fallbacks
            console.log(chalk.cyan(`[TG AI] Racing for: "${text.substring(0,30)}" from ${chatId}`));
            const aiPromises = [
                getPollinationsResponse(chatId, text),
                getStableAIResponse(chatId, text),
            ];
            if (config.geminiApiKey) aiPromises.push(getGeminiResponse(chatId, text));
            if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(chatId, text));
            aiPromises.push(getAutoGPTResponse(chatId, text));

            let reply = null;
            let isRealReply = false;
            try {
                const racePromise = Promise.any(aiPromises.map(p => p.then(res => {
                    if (!res || res.trim().startsWith('<!doctype') || res.includes('<html')) throw new Error('bad');
                    return res;
                })));
                reply = await Promise.race([racePromise, new Promise((_, reject) => setTimeout(() => reject(), 20000))]);
                isRealReply = true;
                console.log(chalk.green(`[TG AI] Got response (${reply?.length} chars)`));
            } catch (e) {
                console.log(chalk.yellow(`[TG AI] Race failed. Trying stable fallback...`));
                // Final fallback — try stable one more time
                reply = await getStableAIResponse(chatId, text);
                if (reply && !reply.trim().startsWith('<')) {
                    isRealReply = true;
                    console.log(chalk.green(`[TG AI] Stable fallback succeeded`));
                } else {
                    console.log(chalk.red(`[TG AI] ALL providers failed for: ${text.substring(0, 50)}`));
                    await db.logError('ai_telegram', `All AI models failed for: ${text.substring(0, 100)}`, 'TG').catch(() => {});
                    reply = `🤖 *بوت حمزة اعمرني*\n\nأنا هنا! خدمات الذكاء الاصطناعي بطيئة قليلاً الآن.\n\nجرب:\n• /menu لرؤية الأوامر\n• .ping للتحقق\n• .weather للطقس`;
                    isRealReply = false;
                }
            }

            if (reply) {
                if (isRealReply) await addToHistory(chatId, 'user', text);

                let botReplyText = reply;
                let extractedCommand = null;

                const cmdMatchAI = reply.match(/\[COMMAND:\s*(\.[a-zA-Z0-9\u0600-\u06FF\-]+.*?)]/i);
                if (cmdMatchAI) {
                    extractedCommand = cmdMatchAI[1].trim();
                    botReplyText = reply.replace(cmdMatchAI[0], '').trim();
                }

                if (botReplyText && isRealReply) {
                    await addToHistory(chatId, 'assistant', botReplyText);
                } else if (extractedCommand) {
                    await addToHistory(chatId, 'assistant', '[تم تنفيذ الأداة بنجاح]');
                }

                if (botReplyText) {
                    try {
                        await bot.sendMessage(chatId, botReplyText, {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[{ text: '👤 المطور', url: 'https://t.me/hamzaamirni' }]]
                            }
                        });
                    } catch (markdownErr) {
                        await bot.sendMessage(chatId, botReplyText, {
                            reply_markup: {
                                inline_keyboard: [[{ text: '👤 المطور', url: 'https://t.me/hamzaamirni' }]]
                            }
                        });
                    }
                }

                if (extractedCommand) {
                    const cmdMatch = extractedCommand.match(/^[\.]?([a-zA-Z0-9\u0600-\u06FF\-]+)(\s+.*|$)/i);
                    if (cmdMatch) {
                        const command = cmdMatch[1].toLowerCase();
                        const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);
                        const allCmds = ALL_COMMANDS;
                        if (allCmds[command]) {
                            try {
                                const cmdFile = require(`../commands/${allCmds[command]}`);
                                const mockSock = createMockSock(bot, msg, chatId);
                                await cmdFile(mockSock, chatId, msg, args, { isTelegram: true, command: command }, detectLanguage(text));
                                if (global.trackCommand) global.trackCommand(command, 'telegram');
                            } catch (err) { console.error("[Telegram] AI Command Execution Error:", err); }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Telegram] Error:', error.message);
            await db.logError('telegram_handler', error.message, 'TG').catch(() => {});
        }
    });

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id.toString();
        const data = query.data;
        const msgId = query.message.message_id;

        try {
            // ===== MENU NAVIGATION SYSTEM =====
            if (data === 'menu_main') {
                await bot.answerCallbackQuery(query.id);
                return editToMainMenu(bot, chatId, msgId);
            }

            if (data === 'menu_close') {
                await bot.answerCallbackQuery(query.id, { text: '✅ تم إغلاق القائمة' });
                try {
                    return await bot.editMessageText('📋 *اضغط /start للبدء أو اكتب أمراً*', {
                        chat_id: chatId,
                        message_id: msgId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[{ text: '📋 فتح القائمة', callback_data: 'menu_main' }]]
                        }
                    });
                } catch (e) { }
                return;
            }

            if (data.startsWith('menu_cat_')) {
                const cat = data.replace('menu_cat_', '');
                await bot.answerCallbackQuery(query.id);
                return showMenuCategory(bot, chatId, msgId, cat, query.from.first_name);
            }

            if (data.startsWith('menu_cmd_')) {
                const cmd = data.replace('menu_cmd_', '');
                await bot.answerCallbackQuery(query.id, { text: `⚡ جاري تنفيذ ${cmd}...` });
                // Run the command
                const dummyMsg = { ...query.message, from: query.from, text: `.${cmd}`, key: { fromMe: false, id: query.message.message_id.toString(), remoteJid: chatId }, pushName: query.from.first_name };
                const { ALL_COMMANDS } = require('./commandMap');
                const allCmds = ALL_COMMANDS;
                if (allCmds[cmd]) {
                    try {
                        const cmdFile = require(`../commands/${allCmds[cmd]}`);
                        const mockSock = createMockSock(bot, dummyMsg, chatId);
                        await cmdFile(mockSock, chatId, dummyMsg, [], { isTelegram: true, command: cmd }, 'ar');
                        if (global.trackCommand) global.trackCommand(cmd, 'telegram');
                    } catch (err) {
                        await bot.sendMessage(chatId, `❌ حدث خطأ أثناء تنفيذ الأمر: ${err.message}`);
                    }
                }
                // Collapse menu back to just button
                try {
                    await bot.editMessageReplyMarkup({
                        inline_keyboard: [[{ text: '📋 فتح القائمة', callback_data: 'menu_main' }]]
                    }, { chat_id: chatId, message_id: msgId });
                } catch (e) { }
                return;
            }

            // Default: treat as command text
            await bot.answerCallbackQuery(query.id);
            const dummyMsg = { ...query.message, from: query.from, text: query.data, key: { fromMe: false, id: query.message.message_id.toString(), remoteJid: chatId }, pushName: query.from.first_name };
            bot.emit('message', dummyMsg);

        } catch (e) {
            console.error('[Telegram] Callback error:', e.message);
            try { await bot.answerCallbackQuery(query.id, { text: '❌ خطأ' }); } catch (_) { }
        }
    });

    bot.on('new_chat_members', async (msg) => {
        const chatId = msg.chat.id;
        const newMembers = msg.new_chat_members;
        for (const member of newMembers) {
            if (member.id === (await bot.getMe()).id) {
                await bot.sendMessage(chatId, "✅ شكراً لإضافتي! أنا بوت *حمزة اعمرني*. استعمل .menu لرؤية الأوامر.", { parse_mode: 'Markdown' });
            } else {
                await bot.sendMessage(chatId, `✨ *أهلاً بك يا ${member.first_name} في المجموعة!* ✨\n\nنرجو منك الالتزام بالقواعد.`, { parse_mode: 'Markdown' });
            }
        }
    });

    bot.on('left_chat_member', async (msg) => {
        const chatId = msg.chat.id;
        const member = msg.left_chat_member;
        await bot.sendMessage(chatId, `👋 وداعاً يا ${member.first_name}، نتمنى لك التوفيق.`, { parse_mode: 'Markdown' });
    });

    bot.on('polling_error', (e) => { if (!e.message.includes('EFATAL')) return; console.error('[Telegram] Polling error:', e.message); });
}

// --- TG HELPERS ---

async function checkTGAdmin(bot, chatId, userId) {
    try {
        const admins = await bot.getChatAdministrators(chatId);
        return admins.some(a => a.user.id === userId);
    } catch (e) { return false; }
}

function getGroupSettings(chatId) {
    const dbPath = path.join(__dirname, '..', 'data', 'tg_groups.json');
    try {
        if (!fs.existsSync(dbPath)) return { antilink: false };
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        return data[chatId] || { antilink: false };
    } catch (e) { return { antilink: false }; }
}

function saveGroupSettings(chatId, settings) {
    const dbPath = path.join(__dirname, '..', 'data', 'tg_groups.json');
    try {
        let data = {};
        if (fs.existsSync(dbPath)) data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        data[chatId] = settings;
        fs.ensureDirSync(path.dirname(dbPath));
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (e) { }
}

async function sendTelegramPrayerReminder(chatId, message) {
    if (!config.telegramToken) return;
    try {
        const TelegramBot = require('node-telegram-bot-api');
        // Use a simple direct API call to avoid creating a second polling instance
        await require('axios').post(
            `https://api.telegram.org/bot${config.telegramToken}/sendMessage`,
            {
                chat_id: chatId,
                text: message.replace(/\*/g, '').replace(/_/g, ''),
                parse_mode: 'HTML',
                disable_notification: false
            },
            { timeout: 10000 }
        );
    } catch (e) {
        // Silently fail per user
    }
}

module.exports = { startTelegramBot, sendTelegramPrayerReminder };
