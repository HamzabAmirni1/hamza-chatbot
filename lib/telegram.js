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
            // Processing logic...
            const aiPromises = [];
            if (config.geminiApiKey) aiPromises.push(getGeminiResponse(chatId, text));
            if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(chatId, text));

            aiPromises.push(getLuminAIResponse(chatId, text));
            aiPromises.push(getAIDEVResponse(chatId, text));
            aiPromises.push(getPollinationsResponse(chatId, text));
            aiPromises.push(getBlackboxResponse(chatId, text));
            aiPromises.push(getStableAIResponse(chatId, text));
            aiPromises.push(getAutoGPTResponse(chatId, text));

            let reply;
            try {
                const racePromise = Promise.any(aiPromises.map(p => p.then(res => {
                    if (!res) throw new Error("No response");
                    return res;
                })));
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000));
                reply = await Promise.race([racePromise, timeoutPromise]);
            } catch (e) {
                reply = await getStableAIResponse(chatId, text) || await getBlackboxResponse(chatId, text) || "عذراً، حدث خطأ في معالجة طلبك.";
            }

            if (reply) {
                addToHistory(chatId, 'user', text);
                addToHistory(chatId, 'assistant', reply);
                await bot.sendMessage(chatId, reply);
            }
        } catch (error) {
            console.error(chalk.red('[Telegram] Error:'), error.message);
        }
    });

    bot.on('polling_error', (error) => {
        if (error.message.includes('EFATAL')) {
            console.error(chalk.red('[Telegram] Polling error:'), error.message);
        }
    });
}

module.exports = { startTelegramBot };
