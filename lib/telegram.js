const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse } = require('./ai');
const chalk = require('chalk');
const axios = require('axios');

function startTelegramBot() {
    if (!config.telegramToken) {
        console.log(chalk.red('⚠️ Telegram Token not set. Skipping Telegram Bot.'));
        return;
    }

    const bot = new TelegramBot(config.telegramToken, { polling: true });

    console.log(chalk.green('✅ Telegram Bot is running...'));

    // Helper to create a mock sock for commands
    function createMockSock(bot, msg, chatId) {
        return {
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

                if (content.react) return;
            }
        };
    }

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id.toString();
        const userId = msg.from.id;
        const text = msg.text;

        if (!text || msg.from.is_bot) return;

        console.log(chalk.cyan(`[Telegram] Message from ${msg.from.first_name}: ${text}`));

        // --- FORCE SUBSCRIBE LOGIC ---
        const channelId = '@hamzapro11';
        try {
            const member = await bot.getChatMember(channelId, userId);
            if (member.status === 'left' || member.status === 'kicked') {
                return bot.sendMessage(chatId, `⚠️ *يجب عليك الاشتراك في قناة المطور لتتمكن من استخدام البوت.*\n\n📌 القناة: ${channelId}\n\nبعد الاشتراك، أرسل /start لتفعيل البوت.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '➕ اِشترك الآن', url: 'https://t.me/hamzapro11' }
                        ]]
                    }
                });
            }
        } catch (e) {
            console.log(chalk.yellow(`[Telegram] Check Sub Error: ${e.message}`));
        }

        if (text.startsWith('/start')) {
            return bot.sendMessage(chatId, `✨ *مرحباً بك يا ${msg.from.first_name}!* ✨\n\nأنا بوت *حمزة اعمرني* المطور، أعمل بالذكاء الاصطناعي.\n\n🤖 يمكنني الإجابة على أسئلتك، رسم الصور، وتحميل الفيديوهات.\n\n📍 اِشترك في قناتي للمزيد: https://t.me/hamzapro11`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📢 تابع جديدنا', url: 'https://t.me/hamzapro11' }
                    ]]
                }
            });
        }

        try {
            const body = text;
            const lowerBody = body.toLowerCase().trim();
            const cmdMatch = body.match(/^[\.\/]([a-zA-Z0-9]+)(\s+.*|$)/i);

            let commandHandled = false;

            // 1. Check for Dot/Slash Commands
            if (cmdMatch) {
                const command = cmdMatch[1].toLowerCase();
                const args = (cmdMatch[2] || "").trim().split(" ").filter(a => a);

                const allCmds = {
                    "yts": "thmil/yts", "video": "thmil/video", "vid": "thmil/video", "فيديو": "thmil/video",
                    "play": "thmil/play", "song": "thmil/play", "أغنية": "thmil/play",
                    "fb": "thmil/fb", "facebook": "thmil/fb", "فيسبوك": "thmil/fb",
                    "ig": "thmil/ig", "instagram": "thmil/ig", "إنستغرام": "thmil/ig",
                    "tiktok": "thmil/tiktok", "تيكتوك": "thmil/tiktok",
                    "draw": "image/draw", "صورة": "image/draw", "رسم": "image/draw",
                    "imagine": "ai/imagine", "ai-image": "ai/ai-image",
                    "menu": "info/menu", "help": "info/menu", "قائمة": "info/menu",
                    "owner": "info/owner", "ping": "tools/ping", "status": "tools/ping",
                    "nano": "image/nano", "nanobanana": "image/nano", "imgedit": "image/imgeditai"
                };

                if (allCmds[command]) {
                    try {
                        const cmdFile = require(`../commands/${allCmds[command]}`);
                        const mockSock = createMockSock(bot, msg, chatId);
                        await cmdFile(mockSock, chatId, msg, args, { isTelegram: true }, "ar");
                        commandHandled = true;
                    } catch (err) {
                        console.error('[Telegram Command Error]:', err.message);
                    }
                }
            }

            // 2. Natural Language Commands
            if (!commandHandled && !body.startsWith(".") && !body.startsWith("/")) {
                const nlcKeywords = {
                    "قرآن|quran|سورة|sura|القرآن": "islamic/quran",
                    "تعديل|نانو|edit|nano": "image/nano",
                    "دعاء|dua|اذكار|ad3iya": "islamic/ad3iya",
                    "صورة|رسم|draw|imagine|art": "image/draw",
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

            if (commandHandled) return;

            // 3. Fallback to AI
            const aiPromises = [];
            if (config.geminiApiKey) aiPromises.push(getGeminiResponse(chatId, text));
            if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(chatId, text));

            aiPromises.push(getLuminAIResponse(chatId, text));
            aiPromises.push(getAIDEVResponse(chatId, text));
            aiPromises.push(getBlackboxResponse(chatId, text));
            aiPromises.push(getStableAIResponse(chatId, text));
            aiPromises.push(getAutoGPTResponse(chatId, text));

            let reply;
            try {
                const racePromise = Promise.any(aiPromises.map(p => p.then(res => {
                    if (!res) throw new Error("No response");
                    return res;
                })));
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000));
                reply = await Promise.race([racePromise, timeoutPromise]);
            } catch (e) {
                reply = await getStableAIResponse(chatId, text) || "⚠️ الخادم مشغول حالياً، يرجى المحاولة لاحقاً.";
            }

            if (reply) {
                addToHistory(chatId, 'user', text);
                addToHistory(chatId, 'assistant', reply);

                await bot.sendMessage(chatId, reply, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '📢 القناة الرسمية', url: 'https://t.me/hamzapro11' },
                            { text: '👤 المطور', url: 'https://t.me/hamzaamirni' }
                        ]]
                    }
                });
            }
        } catch (error) {
            console.error(chalk.red('[Telegram] Error:'), error.message);
        }
    });

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id.toString();
        const text = query.data;
        const dummyMsg = {
            ...query.message,
            from: query.from,
            text: text
        };
        await bot.answerCallbackQuery(query.id);
        bot.emit('message', dummyMsg);
    });

    bot.on('polling_error', (error) => {
        if (!error.message.includes('EFATAL')) { }
        else { console.error(chalk.red('[Telegram] Polling error:'), error.message); }
    });
}

module.exports = { startTelegramBot };
