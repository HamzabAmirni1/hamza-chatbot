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
                    // Check if it's a quoted message (reply)
                    const message = targetMsg.reply_to_message || targetMsg.message || targetMsg;
                    let fileId;

                    if (message.photo) {
                        fileId = message.photo[message.photo.length - 1].file_id;
                    } else if (message.video) {
                        fileId = message.video.file_id;
                    } else if (message.document) {
                        fileId = message.document.file_id;
                    } else if (message.audio) {
                        fileId = message.audio.file_id;
                    } else if (message.voice) {
                        fileId = message.voice.file_id;
                    }

                    if (!fileId) return null;

                    const fileLink = await bot.getFileLink(fileId);
                    const resp = await axios.get(fileLink, { responseType: 'arraybuffer' });
                    return Buffer.from(resp.data);
                } catch (e) {
                    console.error('[Telegram Download Error]:', e.message);
                    return null;
                }
            },
            downloadMediaMessage: async (targetMsg) => {
                return await mockSock.downloadMedia(targetMsg);
            },
            sendMessage: async (id, content, opts) => {
                let options = { parse_mode: 'Markdown', ...(content.reply_markup ? { reply_markup: content.reply_markup } : {}) };

                if (content.text) return bot.sendMessage(id, content.text, options);

                if (content.image) {
                    try {
                        const photoSource = content.image.url || content.image;
                        return await bot.sendPhoto(id, photoSource, { caption: content.caption, ...options });
                    } catch (e) {
                        if (content.image.url) {
                            try {
                                const resp = await axios.get(content.image.url, { responseType: 'arraybuffer' });
                                return await bot.sendPhoto(id, Buffer.from(resp.data), { caption: content.caption, ...options });
                            } catch (err) {
                                return bot.sendMessage(id, "⚠️ فشل إرسال الصورة.", options);
                            }
                        }
                    }
                }

                if (content.video) {
                    try {
                        return await bot.sendVideo(id, content.video.url || content.video, { caption: content.caption, ...options });
                    } catch (e) {
                        return bot.sendMessage(id, "⚠️ فشل إرسال الفيديو.", options);
                    }
                }

                if (content.audio) {
                    try {
                        return await bot.sendAudio(id, content.audio.url || content.audio, { caption: content.caption, ...options });
                    } catch (e) {
                        return bot.sendMessage(id, "⚠️ فشل إرسال الصوت.", options);
                    }
                }

                if (content.document) {
                    try {
                        return await bot.sendDocument(id, content.document.url || content.document, { caption: content.caption, ...options });
                    } catch (e) {
                        return bot.sendMessage(id, "⚠️ فشل إرسال الملف.", options);
                    }
                }

                if (content.edit) {
                    try {
                        let msgId = content.edit.id || content.edit.key?.id;
                        return await bot.editMessageText(content.text, { chat_id: id, message_id: msgId, ...options });
                    } catch (e) { }
                }

                if (content.react) return;
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
                    "yts": "thmil/yts", "video": "thmil/video", "vid": "thmil/video", "فيديو": "thmil/video",
                    "play": "thmil/play", "song": "thmil/play", "أغنية": "thmil/play",
                    "fb": "thmil/fb", "facebook": "thmil/fb", "فيسبوك": "thmil/fb",
                    "ig": "thmil/ig", "instagram": "thmil/ig", "إنستغرام": "thmil/ig",
                    "tiktok": "thmil/tiktok", "تيكتوك": "thmil/tiktok",
                    "menu": "info/menu", "help": "info/menu", "قائمة": "info/menu",
                    "owner": "info/owner", "ping": "tools/ping", "status": "tools/ping",
                    "nano": "image/nano", "nanobanana": "image/nano", "imgedit": "image/imgeditai",
                    "gen": "image/gen", "generate": "image/gen", "photo": "image/gen", "image": "image/gen", "img": "image/gen", "تخيل": "image/gen", "ارسم": "image/gen", "صورة": "image/gen",
                    "wallpaper": "image/wallpaper", "4kwallpaper": "image/wallpaper",
                    "googleimg": "image/googleimg", "gimage": "image/googleimg",
                    "deepimg": "image/deepimg", "deepimage": "image/deepimg",
                    "devmsg": "admin/broadcast", "broadcast": "admin/broadcast",
                    "devmsgwa": "admin/broadcast", "devmsgtg": "admin/broadcast", "devmsgfb": "admin/broadcast", "devmsgtous": "admin/broadcast", "devmsgall": "admin/broadcast",
                    "weather": "tools/weather", "wether": "tools/weather", "طقس": "tools/weather", "الطقس": "tools/weather",
                    "tomp3": "tools/tomp3", "img2video": "ai/img2video", "i2v": "ai/img2video",
                    "upscale": "image/upscale", "hd": "image/upscale", "colorize": "image/colorize",
                    "sketch": "image/sketch", "blur": "tools/blur", "brat": "image/brat", "toimg": "tools/toimg",
                    "quran": "islamic/quran", "dua": "islamic/ad3iya", "اذكار": "islamic/ad3iya", "دعاء": "islamic/ad3iya",
                    "aivideo": "ai/aivideo", "veo": "ai/aivideo", "text2video": "ai/aivideo",
                    "grokvideo": "ai/grokvideo", "grok": "ai/grokvideo", "video-ai": "ai/grokvideo",
                    "ytdl": "thmil/ytdl", "pinterest": "thmil/pinterest", "pin": "thmil/pinterest",
                    "lyrics": "thmil/lyrics", "miramuse": "ai/miramuse", "gpt4o": "ai/chat", "gpt4": "ai/chat",
                    "gimg": "image/gimg", "deepimg": "image/deepimg"
                };

                if (allCmds[command]) {
                    try {
                        const cmdFile = require(`../commands/${allCmds[command]}`);
                        const mockSock = createMockSock(bot, msg, chatId);
                        await cmdFile(mockSock, chatId, msg, args, { isTelegram: true, command: command }, "ar");
                        commandHandled = true;
                    } catch (err) {
                        console.error('[Telegram Command Error]:', err.message);
                    }
                }
            }

            if (!commandHandled && text) {
                const nlcKeywords = {
                    "قرآن|quran|سورة|sura|القرآن": "islamic/quran",
                    "تعديل|نانو|edit|nano": "image/nano",
                    "gen|generate|توليد|photo|image|img|تخيل|ارسم|صورة": "image/gen",
                    "دعاء|dua|اذكار|ad3iya": "islamic/ad3iya",
                    "طقس|weather|wether|الطقس": "tools/weather",
                    "فيديو-صورة|img2video": "ai/img2video",
                    "يوتيوب|تحميل|ytdl|youtube": "thmil/ytdl",
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
                            await cmdFile(mockSock, chatId, msg, rest, { isTelegram: true }, "ar");
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

    bot.on('polling_error', (e) => { if (!e.message.includes('EFATAL')) return; console.error('[Telegram] Polling error:', e.message); });
}

module.exports = { startTelegramBot };
