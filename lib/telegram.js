const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse } = require('./ai');
const chalk = require('chalk');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// Save Telegram user to DB
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
}

function startTelegramBot() {
    if (!config.telegramToken) {
        console.log(chalk.red('⚠️ Telegram Token not set. Skipping Telegram Bot.'));
        return;
    }

    const bot = new TelegramBot(config.telegramToken, { polling: true });

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
                let options = { parse_mode: 'Markdown', ...(content.reply_markup ? { reply_markup: content.reply_markup } : {}) };
                if (content.text) return bot.sendMessage(id, content.text, options);
                if (content.image) {
                    const photoSource = content.image.url || content.image;
                    try { return await bot.sendPhoto(id, photoSource, { caption: content.caption, ...options }); }
                    catch (e) {
                        if (content.image.url) {
                            const resp = await axios.get(content.image.url, { responseType: 'arraybuffer' });
                            return await bot.sendPhoto(id, Buffer.from(resp.data), { caption: content.caption, ...options });
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
                    try { return await bot.sendAudio(id, content.audio.url || content.audio, { caption: content.caption, ...options }); }
                    catch (e) {
                        if (content.audio.url) {
                            const resp = await axios.get(content.audio.url, { responseType: 'arraybuffer' });
                            return await bot.sendAudio(id, Buffer.from(resp.data), { caption: content.caption, ...options });
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
                        if (fullText) return bot.sendMessage(id, fullText, { parse_mode: 'Markdown' });
                    }
                } catch (e) {
                    console.error('[Telegram Relay Error]:', e.message);
                }
            }
        };
        return mockSock;
    }

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id.toString();
        const userId = msg.from.id;
        const text = msg.text || "";

        msg.key = { fromMe: false, id: msg.message_id.toString(), remoteJid: chatId };
        msg.pushName = msg.from.first_name;

        if (msg.from.is_bot) return;

        // Track Telegram user
        saveTelegramUser(chatId);

        // Skip AI processing for non-text messages unless they are commands
        const isCommand = text.startsWith('.') || text.startsWith('/');
        if (!text && !msg.photo && !msg.video) return;

        console.log(chalk.cyan(`[Telegram] Message from ${msg.from.first_name}: ${text || '[Media]'}`));

        const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
        const isAdmin = isGroup ? await checkTGAdmin(bot, chatId, userId) : true;

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

        // Force Subscribe
        const channelId = '@hamzapro11';
        try {
            const member = await bot.getChatMember(channelId, userId);
            if (member.status === 'left' || member.status === 'kicked') {
                return bot.sendMessage(chatId, `⚠️ *يجب عليك الاشتراك في قناة المطور لتتمكن من استخدام البوت.*\n\n📌 القناة: ${channelId}\n\nبعد الاشتراك، أرسل /start لتفعيل البوت.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '➕ اِشترك الآن', url: 'https://t.me/hamzapro11' }]]
                    }
                });
            }
        } catch (e) { }

        if (text.startsWith('/start')) {
            return bot.sendMessage(chatId, `✨ *مرحباً بك يا ${msg.from.first_name}!* ✨\n\nأنا بوت *حمزة اعمرني* المطور، أعمل بالذكاء الاصطناعي.\n\n🤖 يمكنني الإجابة على أسئلتك، رسم الصور، وتحميل الفيديوهات.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '📢 تابع جديدنا', url: 'https://t.me/hamzapro11' }]]
                }
            });
        }

        try {
            const body = text;
            const lowerBody = body.toLowerCase().trim();
            const cmdMatch = body.match(/^[\.\/]([a-zA-Z0-9]+)(\s+.*|$)/i);

            let commandHandled = false;

            if (cmdMatch) {
                const command = cmdMatch[1].toLowerCase();
                const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);

                const allCmds = {
                    "salat": "islamic/salat", "sala": "islamic/salat", "prayer": "islamic/salat", "صلاة": "islamic/salat", "أوقات-الصلاة": "islamic/salat", "أوقات": "islamic/salat", "الصلاة": "islamic/salat",
                    "yts": "thmil/yts", "video": "thmil/video", "vid": "thmil/video", "فيديو": "thmil/video",
                    "play": "thmil/play", "song": "thmil/play", "أغنية": "thmil/play",
                    "fb": "thmil/fb", "facebook": "thmil/fb", "فيسبوك": "thmil/fb",
                    "ig": "thmil/ig", "instagram": "thmil/ig", "إنستغرام": "thmil/ig",
                    "tiktok": "thmil/tiktok", "تيكتوك": "thmil/tiktok",
                    "ytmp4": "thmil/ytmp4", "ytmp4v2": "thmil/ytmp4v2", "ytdl": "thmil/ytdl",
                    "menu": "info/menu", "help": "info/menu", "قائمة": "info/menu",
                    "owner": "info/owner", "ping": "tools/ping", "status": "tools/ping",
                    "nano": "image/nano", "nanobanana": "image/nanobanana", "imgedit": "image/nanobanana",
                    "gen": "image/gen", "generate": "image/gen", "imagine": "image/imagine", "photo": "image/gen", "image": "image/gen", "img": "image/gen", "تخيل": "image/gen", "ارسم": "image/gen", "صورة": "image/gen",
                    "deepimg": "image/deepimg", "deepimage": "image/deepimg", "deepseek": "ai/deepseek",
                    "nanobanana": "image/nanobanana", "airbrush": "image/airbrush", "removebg": "image/pixa-removebg",
                    "analyze": "ai/analyze", "vision": "ai/analyze",
                    "googleimg": "image/googleimg", "gimage": "image/googleimg",
                    "deepimg": "image/deepimg", "deepimage": "image/deepimg",
                    "devmsg": "admin/broadcast", "broadcast": "admin/broadcast",
                    "devmsgwa": "admin/broadcast", "devmsgtg": "admin/broadcast", "devmsgfb": "admin/broadcast", "devmsgtous": "admin/broadcast", "devmsgall": "admin/broadcast",
                    "weather": "tools/weather", "wether": "tools/weather", "طقس": "tools/weather", "الطقس": "tools/weather",
                    "tomp3": "tools/tomp3", "img2video": "ai/img2video", "i2v": "ai/img2video",
                    "upscale": "image/upscale", "hd": "image/upscale", "colorize": "image/colorize",
                    "sketch": "image/sketch", "blur": "tools/blur", "brat": "image/brat", "toimg": "tools/toimg",
                    "quran": "islamic/quran", "dua": "islamic/ad3iya", "اذكار": "islamic/ad3iya", "دعاء": "islamic/ad3iya", "ad3iya30": "islamic/ad3iya30",
                    "ramadan": "islamic/ramadan", "رمضان": "islamic/ramadan", "khatm": "islamic/khatm", "ختمة": "islamic/khatm",
                    "ayah": "islamic/ayah", "آية": "islamic/ayah", "اية": "islamic/ayah", "قرآن": "islamic/quran",
                    "sورة": "islamic/quran", "continue": "islamic/continue", "tafsir": "islamic/tafsir", "تفسير": "islamic/tafsir",
                    "quranread": "islamic/quranread", "quranmp3": "islamic/quranmp3", "qdl": "islamic/qdl", "quransura": "islamic/quransura", "quransurah": "islamic/quransurah", "qurancard": "islamic/qurancard", "quranpdf": "islamic/quranpdf",
                    "aivideo": "ai/aivideo", "veo": "ai/aivideo", "text2video": "ai/aivideo",
                    "grokvideo": "ai/grokvideo", "grok": "ai/grokvideo", "video-ai": "ai/grokvideo",
                    "ytdl": "thmil/ytdl", "pinterest": "thmil/pinterest", "pin": "thmil/pinterest",
                    "lyrics": "thmil/lyrics", "miramuse": "ai/miramuse", "gpt4o": "ai/chat", "gpt4": "ai/chat",
                    "gimg": "image/gimg", "deepimg": "image/deepimg",
                    "kick": "tg_admin", "ban": "tg_admin", "promote": "tg_admin", "tagall": "tg_admin", "antilink": "tg_admin"
                };

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
                        await cmdFile(mockSock, chatId, msg, args, helpers, "ar");
                        commandHandled = true;
                    } catch (err) {
                        console.error('[Telegram Command Error]:', err.message);
                    }
                }
            }

            if (!commandHandled && text) {
                const nlcKeywords = {
                    "قرآن|quran|سورة|sura|القرآن": "islamic/quran",
                    "صلاة|salat|prayer|أوقات": "islamic/salat",
                    "رمضان|ramadan": "islamic/ramadan",
                    "تعديل|نانو|edit|nano": "image/nano",
                    "gen|generate|توليد|photo|image|img|تخيل|ارسم|صورة": "image/gen",
                    "دعاء|dua|اذكار|ad3iya": "islamic/ad3iya",
                    "طقس|weather|wether|الطقس": "tools/weather",
                    "فيديو-صورة|img2video": "ai/img2video",
                    "يوتيوب|تحميل|ytdl|youtube": "thmil/ytdl",
                    "انستقرام|instagram|ig": "thmil/ig",
                    "فيسبوك|facebook|fb": "thmil/fb",
                    "تيكتوك|tiktok": "thmil/tiktok",
                    "tomp3|mp3": "tools/tomp3",
                    "aivideo": "ai/aivideo",
                    "قائمة|menu|help": "info/menu"
                };

                for (const [key, path] of Object.entries(nlcKeywords)) {
                    if (new RegExp(`(${key})`, "i").test(lowerBody)) {
                        try {
                            const rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                            const cmdFile = require(`../commands/${path}`);
                            const mockSock = createMockSock(bot, msg, chatId);
                            const helpers = { isTelegram: true, command: path.split('/').pop() };
                            await cmdFile(mockSock, chatId, msg, rest, helpers, "ar");
                            commandHandled = true;
                            break;
                        } catch (e) { }
                    }
                }
            }

            if (commandHandled || !text) return;

            // AI Fallback
            const aiPromises = [];
            if (config.geminiApiKey) aiPromises.push(getGeminiResponse(chatId, text));
            if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(chatId, text));
            aiPromises.push(getLuminAIResponse(chatId, text));
            aiPromises.push(getBlackboxResponse(chatId, text));
            aiPromises.push(getStableAIResponse(chatId, text));

            let reply;
            try {
                const racePromise = Promise.any(aiPromises.map(p => p.then(res => { if (!res) throw new Error(); return res; })));
                reply = await Promise.race([racePromise, new Promise((_, reject) => setTimeout(() => reject(), 15000))]);
            } catch (e) {
                reply = await getStableAIResponse(chatId, text) || "⚠️ الخادم مشغول حالياً.";
            }

            if (reply) {
                addToHistory(chatId, 'user', text);
                addToHistory(chatId, 'assistant', reply);
                await bot.sendMessage(chatId, reply, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '👤 المطور', url: 'https://t.me/hamzaamirni' }]]
                    }
                });
            }
        } catch (error) {
            console.error('[Telegram] Error:', error.message);
        }
    });

    bot.on('callback_query', async (query) => {
        const dummyMsg = { ...query.message, from: query.from, text: query.data };
        await bot.answerCallbackQuery(query.id);
        bot.emit('message', dummyMsg);
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
