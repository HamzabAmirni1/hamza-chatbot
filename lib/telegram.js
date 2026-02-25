const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse } = require('./ai');
const chalk = require('chalk');

function startTelegramBot() {
    if (!config.telegramToken) {
        console.log(chalk.red('⚠️ Telegram Token not set. Skipping Telegram Bot.'));
        return;
    }

    const bot = new TelegramBot(config.telegramToken, { polling: true });

    console.log(chalk.green('✅ Telegram Bot is running...'));

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
            // If the bot is not admin in the channel, this will fail. 
            // We proceed anyway to avoid blocking users if bot config is wrong, 
            // but ideally bot should be admin.
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
                    "owner": "info/owner", "ping": "tools/ping", "status": "tools/ping"
                };

                if (allCmds[command]) {
                    try {
                        const cmdFile = require(`../commands/${allCmds[command]}`);
                        // Create a mock 'sock' to reuse existing commands
                        const mockSock = {
                            sendMessage: async (id, content, opts) => {
                                if (content.text) return bot.sendMessage(id, content.text, { parse_mode: 'Markdown' });
                                if (content.image) return bot.sendPhoto(id, content.image.url, { caption: content.caption });
                                if (content.video) return bot.sendVideo(id, content.video.url, { caption: content.caption });
                                if (content.react) return; // Telegram doesn't have same reactions API easily
                            }
                        };
                        await cmdFile(mockSock, chatId, msg, args, {}, "ar");
                        commandHandled = true;
                    } catch (err) {
                        console.error('[Telegram Command Error]:', err.message);
                    }
                }
            }

            // 2. Natural Language Commands (Detect keywords without dot)
            if (!commandHandled && !body.startsWith(".") && !body.startsWith("/")) {
                const nlcKeywords = {
                    "قرآن|quran|سورة|sura|القرآن": "islamic/quran",
                    "دعاء|dua|اذكار|ad3iya": "islamic/ad3iya",
                    "صورة|رسم|draw|imagine|art": "image/draw",
                    "قائمة|menu|help": "info/menu"
                };

                for (const [key, path] of Object.entries(nlcKeywords)) {
                    if (new RegExp(`(${key})`, "i").test(lowerBody)) {
                        try {
                            const rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                            const cmdFile = require(`../commands/${path}`);
                            const mockSock = {
                                sendMessage: async (id, content, opts) => {
                                    if (content.text) return bot.sendMessage(id, content.text, { parse_mode: 'Markdown' });
                                    if (content.image) return bot.sendPhoto(id, content.image.url, { caption: content.caption });
                                    if (content.video) return bot.sendVideo(id, content.video.url, { caption: content.caption });
                                }
                            };
                            await cmdFile(mockSock, chatId, msg, rest, {}, "ar");
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
                            { text: '👤 المطور', url: 'https://t.me/hamza_amirni' }
                        ]]
                    }
                });
            }
        } catch (error) {
            console.error(chalk.red('[Telegram] Error:'), error.message);
        }
    });

    bot.on('polling_error', (error) => {
        if (!error.message.includes('EFATAL')) {
            // Silence minor polling errors
        } else {
            console.error(chalk.red('[Telegram] Polling error:'), error.message);
        }
    });
}

module.exports = { startTelegramBot };
