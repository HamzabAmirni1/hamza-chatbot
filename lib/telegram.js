const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse, detectLanguage } = require('./ai');
const chalk = require('chalk');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { ALL_COMMANDS, NLC_KEYWORDS, isQuestionOrInquiry, handleAutoDownload } = require('./commandMap');
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

async function isUserSubscribedToChannel(bot, userId) {
    try {
        const tgChannelLink = config.telegram || 'https://t.me/hamzaamirni';
        const channelUsername = '@' + tgChannelLink.split('/').pop().trim();
        const member = await bot.getChatMember(channelUsername, userId);
        const status = member.status;
        return status === 'creator' || status === 'administrator' || status === 'member' || status === 'restricted';
    } catch (e) {
        const msg = e.message || '';
        if (msg.includes('chat not found') || msg.includes('Forbidden') || msg.includes('member of')) {
            console.warn(chalk.yellow(`[Telegram Subscription Warning] Failed to check membership. Make sure the bot is an Admin in the channel. Error: ${msg}`));
            return true;
        }
        return false;
    }
}

function startTelegramBot(manualToken) {
    const token = manualToken || config.telegramToken;
    if (!token) {
        console.log(chalk.red('⚠️ Telegram Token not set. Skipping Telegram Bot.'));
        return;
    }

    // ✅ Guard: if this token is already polling, skip to avoid conflict
    global.telegramBots = global.telegramBots || {};
    if (global.telegramBots[token]) {
        console.log(chalk.yellow(`[Telegram] Bot with token ${token.substring(0,8)}... is already running. Skipping duplicate start.`));
        return;
    }

    let bot;
    try {
        bot = new TelegramBot(token, { polling: { interval: 1000, autoStart: true, params: { timeout: 10 } } });
    } catch (e) {
        console.error(chalk.red(`[Telegram] Failed to create bot instance: ${e.message}`));
        return;
    }

    global.telegramBot = bot;
    global.telegramBots[token] = bot;

    // Handle polling errors gracefully — don’t crash the process
    bot.on('polling_error', (err) => {
        const msg = err.message || '';
        if (msg.includes('409') || msg.includes('Conflict')) {
            // 409 = rolling deploy overlap: old instance still running.
            // Stop this poller and retry after 35s when old instance should be dead.
            console.warn(chalk.yellow(`[Telegram] Polling conflict (409) for ${token.substring(0,8)}... — will retry in 35s after old instance stops.`));
            bot.stopPolling().catch(() => {});
            delete global.telegramBots[token];
            if (global.telegramBot === bot) global.telegramBot = null;
            // Schedule restart
            setTimeout(() => {
                console.log(chalk.blue(`[Telegram] Retrying start for ${token.substring(0,8)}...`));
                startTelegramBot(token);
            }, 35000);
        } else if (msg.includes('ETELEGRAM') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) {
            // Transient network error — log only, polling auto-retries
            console.warn(chalk.yellow(`[Telegram] Polling network error (will retry): ${msg}`));
        } else {
            console.error(chalk.red(`[Telegram] Polling error: ${msg}`));
        }
    });

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

                        // Handle Carousel Cards (e.g. .menu)
                        const cards = interactive.carouselMessage?.cards || [];
                        if (cards.length > 0) {
                            for (const card of cards) {
                                const cardTitle = card.header?.title || "";
                                const cardBody = card.body?.text || "";
                                const cardText = [cardTitle ? `*${cardTitle}*` : "", cardBody, footerText ? `_${footerText}_` : ""].filter(Boolean).join("\n\n");
                                const btns = (card.nativeFlowMessage?.buttons || []).map(b => {
                                    try {
                                        const p = JSON.parse(b.buttonParamsJson || '{}');
                                        return b.name === 'cta_url'
                                            ? [{ text: p.display_text || "🔗 Link", url: p.url }]
                                            : [{ text: p.display_text || "↩️", callback_data: p.id }];
                                    } catch { return []; }
                                }).filter(r => r.length);
                                await bot.sendMessage(id, cardText || bodyText || "—", {
                                    parse_mode: 'Markdown',
                                    ...(btns.length ? { reply_markup: { inline_keyboard: btns } } : {})
                                });
                            }
                            return;
                        }

                        // Handle simple interactive with buttons (non-carousel)
                        const btns = (interactive.nativeFlowMessage?.buttons || []).map(b => {
                            try {
                                const p = JSON.parse(b.buttonParamsJson || '{}');
                                return b.name === 'cta_url'
                                    ? [{ text: p.display_text || "🔗", url: p.url }]
                                    : [{ text: p.display_text || "↩️", callback_data: p.id }];
                            } catch { return []; }
                        }).filter(r => r.length);

                        const fullText = [bodyText, footerText ? `_${footerText}_` : ""].filter(Boolean).join("\n\n");
                        if (fullText || btns.length) {
                            return bot.sendMessage(id, fullText || "—", {
                                parse_mode: 'Markdown',
                                ...(btns.length ? { reply_markup: { inline_keyboard: btns } } : {})
                            });
                        }
                    }
                } catch (e) {
                    console.error('[Telegram Relay Error]:', e.message);
                }
            }
        };
        return mockSock;
    }

    // ===== MENU HELPER FUNCTIONS =====
    // The persistent bottom keyboard - ALWAYS keep this visible
    const PERSISTENT_KEYBOARD = {
        keyboard: [
            [{ text: '📋 القائمة' }, { text: '🤖 AI ذكي' }],
            [{ text: '📥 تحميل' }, { text: '🕋 إسلامي' }],
            [{ text: '🛠️ أدوات' }, { text: '📞 تواصل' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        persistent: true
    };

    function getMainInlineKeyboard() {
        const cfg = require('../config');
        return {
            inline_keyboard: [
                [{ text: '🤖 AI ذكي', callback_data: 'menu_cat_ai' }, { text: '🎨 AI صور', callback_data: 'menu_cat_images' }],
                [{ text: '📥 تحميل', callback_data: 'menu_cat_download' }, { text: '🕋 إسلامي', callback_data: 'menu_cat_islamic' }],
                [{ text: '🛠️ أدوات', callback_data: 'menu_cat_tools' }, { text: '🇲🇦 المغرب', callback_data: 'menu_cat_morocco' }],
                [{ text: 'ℹ️ معلومات', callback_data: 'menu_cat_info' }, { text: '📋 كل الأوامر', callback_data: 'menu_all' }],
                [{ text: '📸 Instagram', url: cfg.instagram }, { text: '💬 WhatsApp Channel', url: cfg.officialChannel }],
                [{ text: '❌ إغلاق', callback_data: 'menu_close' }]
            ]
        };
    }

    function sendTelegramMenu(bot, chatId, editMsgId, msg) {
        const cfg = require('../config');
        const menuText = `📋 *قائمة بوت ${cfg.botName}*\n━━━━━━━━━━━━━━━━\n\nاختر تصنيفاً لرؤية الأوامر:`;
        const mainKeyboard = getMainInlineKeyboard();

        if (editMsgId) {
            // Edit existing message in-place
            return bot.editMessageText(menuText, {
                chat_id: chatId,
                message_id: editMsgId,
                parse_mode: 'Markdown',
                reply_markup: mainKeyboard
            }).catch(() => {
                // If edit fails (message too old), send new
                return bot.sendMessage(chatId, menuText, {
                    parse_mode: 'Markdown',
                    reply_markup: mainKeyboard
                });
            });
        }
        // New menu message
        return bot.sendMessage(chatId, menuText, {
            parse_mode: 'Markdown',
            reply_markup: mainKeyboard
        });
    }

    function editToMainMenu(bot, chatId, msgId) {
        return sendTelegramMenu(bot, chatId, msgId, null);
    }

    const NAV = [[{ text: '🔙 رجوع للقائمة', callback_data: 'menu_main' }, { text: '❌ إغلاق', callback_data: 'menu_close' }]];

    const MENU_CATEGORIES = {
        ai: {
            title: '🤖 AI ذكي | Smart AI',
            text: '🤖 *AI ذكي — Smart AI*\n━━━━━━━━━━━━━━━━\n\n• `.gpt4o` — محادثة ذكاء اصطناعي\n• `.deepseek` — DeepSeek AI\n• `.analyze` — تحليل صورة بالذكاء\n• `.vision` — وصف صورة\n• `.expert` — وضع الخبير / Brainstorm\n• `.chat` — محادثة عامة',
            cmds: [
                [{ text: '.gpt4o 💬', callback_data: 'menu_cmd_gpt4o' }, { text: '.deepseek 🧠', callback_data: 'menu_cmd_deepseek' }],
                [{ text: '.analyze 📊', callback_data: 'menu_cmd_analyze' }, { text: '.vision 👁️', callback_data: 'menu_cmd_vision' }],
                [{ text: '.expert 🎯', callback_data: 'menu_cmd_expert' }],
                ...NAV
            ]
        },
        images: {
            title: '🎨 AI صور | AI Images',
            text: '🎨 *AI صور — AI Images*\n━━━━━━━━━━━━━━━━\n\n• `.gen` — توليد صورة بـ AI\n• `.colorize` — تلوين صورة',
            cmds: [
                [{ text: '.gen 🎨', callback_data: 'menu_cmd_gen' }, { text: '.colorize 🌈', callback_data: 'menu_cmd_colorize' }],
                ...NAV
            ]
        },
        download: {
            title: '📥 تحميل | Download',
            text: '📥 *تحميل — Download*\n━━━━━━━━━━━━━━━━\n\n• `.play` — تحميل أغنية MP3\n• `.video` — تحميل فيديو عام\n• `.ytdl / .ytmp4` — يوتيوب فيديو\n• `.yta / .ytv` — يوتيوب صوت / فيديو\n• `.fb` — تحميل فيسبوك\n• `.ig` — تحميل إنستغرام\n• `.tiktok` — تحميل تيكتوك\n• `.pinterest` — تحميل بينترست\n• `.spotify` — Spotify إلى MP3\n• `.twitter` — تحميل تويتر - X\n• `.apk` — تحميل تطبيق APK\n• `.gdrive` — تحميل Google Drive',
            cmds: [
                [{ text: '.play 🎵', callback_data: 'menu_cmd_play' }, { text: '.video 📹', callback_data: 'menu_cmd_video' }],
                [{ text: '.ytdl 📺', callback_data: 'menu_cmd_ytdl' }, { text: '.ytmp4 🎬', callback_data: 'menu_cmd_ytmp4' }],
                [{ text: '.fb 📘', callback_data: 'menu_cmd_fb' }, { text: '.ig 📸', callback_data: 'menu_cmd_ig' }],
                [{ text: '.tiktok 🎵', callback_data: 'menu_cmd_tiktok' }, { text: '.pinterest 📌', callback_data: 'menu_cmd_pinterest' }],
                [{ text: '.spotify 🎧', callback_data: 'menu_cmd_spotify' }, { text: '.twitter 🐦', callback_data: 'menu_cmd_twitter' }],
                [{ text: '.apk 📦', callback_data: 'menu_cmd_apk' }, { text: '.gdrive 📂', callback_data: 'menu_cmd_gdrive' }],
                ...NAV
            ]
        },
        islamic: {
            title: '🕋 إسلامي | Islamic',
            text: '🕋 *إسلامي — Islamic*\n━━━━━━━━━━━━━━━━\n\n• `.salat` — أوقات الصلاة\n• `.quran` — قراءة القرآن\n• `.quranmp3` — استماع القرآن\n• `.qdl` — تحميل سورة MP3\n• `.qurancard` — بطاقة قرآنية\n• `.ayah` — آية عشوائية\n• `.tafsir` — تفسير آية\n• `.dua / .ad3iya` — أدعية وأذكار\n• `.ramadan` — حزمة رمضان\n• `.khatm` — تتبع الختمة',
            cmds: [
                [{ text: '.salat 🕌', callback_data: 'menu_cmd_salat' }, { text: '.quran 📖', callback_data: 'menu_cmd_quran' }],
                [{ text: '.quranmp3 🎙️', callback_data: 'menu_cmd_quranmp3' }, { text: '.qdl ⬇️', callback_data: 'menu_cmd_qdl' }],
                [{ text: '.ayah 📜', callback_data: 'menu_cmd_ayah' }, { text: '.tafsir 📚', callback_data: 'menu_cmd_tafsir' }],
                [{ text: '.dua 🤲', callback_data: 'menu_cmd_dua' }, { text: '.ramadan 🌙', callback_data: 'menu_cmd_ramadan' }],
                [{ text: '.khatm 📗', callback_data: 'menu_cmd_khatm' }, { text: '.qurancard 🎴', callback_data: 'menu_cmd_qurancard' }],
                ...NAV
            ]
        },
        tools: {
            title: '🛠️ أدوات | Tools',
            text: '🛠️ *أدوات — Tools*\n━━━━━━━━━━━━━━━━\n\n• `.ping` — سرعة الاستجابة\n• `.weather` — الطقس\n• `.sticker / .s` — صورة إلى ملصق\n• `.tomp3` — فيديو إلى MP3\n• `.img2pdf` — صور إلى PDF\n• `.toimg` — ملصق إلى صورة\n• `.tts` — نص إلى صوت\n• `.qr` — توليد QR Code\n• `.ocr` — استخراج نص من صورة\n• `.style` — تزيين النصوص\n• `.igfollowers` — رشق متابعين IG',
            cmds: [
                [{ text: '.ping 🏓', callback_data: 'menu_cmd_ping' }, { text: '.weather 🌦️', callback_data: 'menu_cmd_weather' }],
                [{ text: '.sticker 🖼️', callback_data: 'menu_cmd_sticker' }, { text: '.tomp3 🎧', callback_data: 'menu_cmd_tomp3' }],
                [{ text: '.img2pdf 📄', callback_data: 'menu_cmd_img2pdf' }, { text: '.toimg 🖼️', callback_data: 'menu_cmd_toimg' }],
                [{ text: '.tts 🔊', callback_data: 'menu_cmd_tts' }, { text: '.qr 📱', callback_data: 'menu_cmd_qr' }],
                [{ text: '.ocr 📄', callback_data: 'menu_cmd_ocr' }, { text: '.style 🔤', callback_data: 'menu_cmd_style' }],
                [{ text: '.igfollowers 👥', callback_data: 'menu_cmd_igfollowers' }],
                ...NAV
            ]
        },
        morocco: {
            title: '🇲🇦 المغرب | Morocco',
            text: '🇲🇦 *المغرب — Morocco*\n━━━━━━━━━━━━━━━━\n\n• `.alloschool` — دروس وفروض المغرب\n• `.hespress` — أخبار هسبريس\n• `.alwadifa` — طلبات التوظيف\n• `.aljazeera` — أخبار الجزيرة\n• `.price` — سعر منتج\n• `.wc` — نتائج وجدول كأس العالم 2026 مباشر',
            cmds: [
                [{ text: '.alloschool 📚', callback_data: 'menu_cmd_alloschool' }, { text: '.hespress 📰', callback_data: 'menu_cmd_hespress' }],
                [{ text: '.alwadifa 💼', callback_data: 'menu_cmd_alwadifa' }, { text: '.aljazeera 📡', callback_data: 'menu_cmd_aljazeera' }],
                [{ text: '.price 💰', callback_data: 'menu_cmd_price' }, { text: '.wc 🏆', callback_data: 'menu_cmd_wc' }],
                ...NAV
            ]
        },
        info: {
            title: 'ℹ️ معلومات | Info',
            text: 'ℹ️ *معلومات — Info*\n━━━━━━━━━━━━━━━━\n\n• `.menu / .help` — عرض القائمة\n• `.socials` — روابط التواصل\n• `.owner` — التواصل مع المطور\n• `.mega` — أتمتة كاملة\n• `.msgtodev` — رسالة للمطور\n• `.stats` — إحصائيات البوت\n• `.ping` — سرعة الاستجابة',
            cmds: [
                [{ text: '.socials 🌐', callback_data: 'menu_cmd_socials' }, { text: '.owner 👤', callback_data: 'menu_cmd_owner' }],
                [{ text: '.mega 📦', callback_data: 'menu_cmd_mega' }, { text: '.msgtodev 📬', callback_data: 'menu_cmd_msgtodev' }],
                [{ text: '.stats 📊', callback_data: 'menu_cmd_stats' }, { text: '.ping 🏓', callback_data: 'menu_cmd_ping' }],
                ...NAV
            ]
        }
    };

    function showMenuCategory(bot, chatId, msgId, cat) {
        const category = MENU_CATEGORIES[cat];
        if (!category) return editToMainMenu(bot, chatId, msgId);
        const text = category.text || `${category.title}\n━━━━━━━━━━━━━━━━\n\nاختر أمراً لتنفيذه:`;
        return bot.editMessageText(text, {
            chat_id: chatId, message_id: msgId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: category.cmds }
        }).catch(() => {});
    }
    // ===== END MENU HELPER FUNCTIONS =====

    bot.on('message', async (msg) => {
        // Check if this Telegram bot is paused
        if (global.pausedBots?.telegram?.[token]) {
            return;
        }

        const chatId = msg.chat.id.toString();
        const userId = msg.from.id;
        const text = msg.text || msg.caption || "";

        msg.key = { fromMe: false, id: msg.message_id.toString(), remoteJid: chatId };
        msg.pushName = msg.from.first_name;

        if (msg.from.is_bot) return;

        // Check if user is banned
        try {
            if (global.bannedUsersCache && (global.bannedUsersCache.includes(`tg:${chatId}`) || global.bannedUsersCache.includes(chatId))) {
                console.log(chalk.red(`[Telegram] Banned user tried to message: ${chatId}`));
                return;
            }
        } catch (_) {}


        // Track Telegram user
        saveTelegramUser(chatId);

        if (msg.from.first_name) {
            global.tgNames = global.tgNames || {};
            const cleanId = userId.toString();
            const fullName = `${msg.from.first_name} ${msg.from.last_name || ''}`.trim();
            if (global.tgNames[cleanId] !== fullName) {
                global.tgNames[cleanId] = fullName;
                db.saveUserNames('telegram', global.tgNames).catch(() => {});
            }
        }

        if (msg.chat.type === 'private') {
            const subscribed = await isUserSubscribedToChannel(bot, userId);
            if (!subscribed) {
                const tgChannelLink = config.telegram || 'https://t.me/hamzaamirni';
                await bot.sendMessage(chatId, 
                    `⚠️ *عذراً! يجب عليك الاشتراك في قناتنا على تيليجرام أولاً لاستخدام البوت:*\n\n` +
                    `👉 ${tgChannelLink}\n\n` +
                    `بعد الاشتراك، أرسل أي رسالة وسيبدأ البوت في العمل تلقائياً! ✅`, 
                    { parse_mode: 'Markdown', disable_web_page_preview: false }
                );
                return;
            }
        }

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

        // Check for profanity / bad language
        if (text && !isCommand && !isAdmin) {
            const { scanMessage, handleProfanity } = require('./profanity');
            const matchedBadWord = scanMessage(text);
            if (matchedBadWord) {
                await handleProfanity('TG', chatId.toString(), msg.from?.first_name || 'مستخدم', text, matchedBadWord, bot, msg);
                return;
            }
        }

        // Increment message count for leaderboard
        if (text) {
            const { incrementUser } = require('./leaderboard');
            incrementUser('telegram', 'tg:' + chatId, msg.from?.first_name || 'مستخدم');
        }


        // Photo/Video received → silently save to context history; do NOT auto-analyze or reply
        if ((msg.photo || msg.video) && !isCommand) {
            try {
                const mockSock = createMockSock(bot, msg, chatId);
                const buffer = await mockSock.downloadMedia(msg);
                if (buffer && msg.photo) {
                    try { await addToHistory('tg:' + chatId, "user", text || "[Image]", { buffer, mime: 'image/jpeg' }); } catch (e) {}
                }
            } catch (e) {
                console.error('[Telegram Media Save Error]:', e.message);
            }
            return; // Stop here — no auto-reply for media
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
            return bot.sendMessage(chatId, `✨ *أهلاً بك يا ${msg.from.first_name || 'صديقي'}!*\n\n🤖 أنا بوت *حمزة اعمرني* — مدعوم بالذكاء الاصطناعي\n\n• 💬 تحدث معي مباشرة\n• 📋 اضغط *القائمة* لجميع الأوامر\n• 🎨 توليد صور بـ AI\n• 📥 تحميل فيديوهات\n• 🕋 قرآن وأذكار`, {
                parse_mode: 'Markdown',
                reply_markup: PERSISTENT_KEYBOARD
            });
        }

        // Handle persistent keyboard shortcuts
        if (text === '📋 القائمة') {
            return sendTelegramMenu(bot, chatId, null, msg);
        }
        if (text === '📞 تواصل') {
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
        if (text === '🔍 بحث') {
            return bot.sendMessage(chatId, `🔍 *ابحث عن أمر:*\n\nاكتب اسم الأمر مع نقطة مثل:\n• *.ping* - اختبار الاتصال\n• *.weather المدينة* - الطقس\n• *.translate النص* - ترجمة\n• *.gen وصف الصورة* - توليد صورة\n• *.menu* - عرض جميع الأوامر`, { parse_mode: 'Markdown' });
        }
        if (text === '📥 تحميل') {
            return bot.sendMessage(chatId, `📥 *أوامر التحميل:*\n\n.play 🎵 - تشغيل أغنية\n.video 📹 - تحميل فيديو\n.fb 📘 - فيسبوك\n.ig 📸 - إنستغرام\n.tiktok 🎬 - تيك توك\n.ytmp4 📺 - يوتيوب\n.gdrive 📂 - جوجل درايف`, { parse_mode: 'Markdown' });
        }
        if (text === '🕋 إسلامي') {
            return bot.sendMessage(chatId, `🕋 *الأوامر الإسلامية:*\n\n.quran 📖 - آية قرآنية\n.quranmp3 🎙️ - صوت قرآن\n.ayah 📜 - آية عشوائية\n.tafsir 📚 - تفسير\n.dua 🤲 - دعاء\n.salat 🕌 - مواقيت الصلاة`, { parse_mode: 'Markdown' });
        }
        if (text === '🛠️ أدوات') {
            return bot.sendMessage(chatId, `🛠️ *أدوات متنوعة:*\n\n.ping 🏓 - اختبار الاتصال\n.weather 🌦️ - الطقس\n.translate 🌐 - ترجمة\n.qr 📱 - QR Code\n.tts 🔊 - نص إلى صوت\n.sticker 🖼️ - ملصق\n.ss 🖥️ - لقطة شاشة\n.msgtodev 📬 - إرسال رسالة للمطور`, { parse_mode: 'Markdown' });
        }

        try {
            const body = text;
            const lowerBody = body.toLowerCase().trim();
            const cmdMatch = body.match(/^[\.\/]\s*([a-zA-Z0-9\u0600-\u06FF\-_]+)(\s+.*|$)/i);

            let commandHandled = false;

            // Image Edit / Enhance Auto Routing (matching WhatsApp)
            const nanoKeywords = "nano|edit|adel|3adil|sawb|qad|badel|ghayir|ghayar|tahwil|convert|photoshop|ps|tadil|modify|change|عدل|تعديل|غير|تغيير|بدل|تبديل|صاوب|قاد|تحويل|حول|رد|دير|اضف|أضف|زيد";
            const enhanceKeywords = "hd|enhance|upscale|removebg|bg|background|وضح|تصفية|جودة|وضوح|خلفية|حيد-الخلفية";
            const colorizeKeywords = "colorize|color|لون|تلوين";
            const ghibliKeywords = "ghibli|anime-art|جيبلي|أنمي-فني";
            const allAIPrefixRegex = new RegExp(`^([\\.!])?\\s*(${nanoKeywords}|${enhanceKeywords}|${colorizeKeywords}|${ghibliKeywords})(\\s+.*|$)`, "i");
            const aiMatch = body ? body.match(allAIPrefixRegex) : null;

            if (aiMatch) {
                const prefix = aiMatch[1];
                const keyword = aiMatch[2].toLowerCase();
                const rest = (aiMatch[3] || "").trim();
                
                const context = await getContext('tg:' + chatId);
                const hasRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
                const isPhoto = msg.photo || msg.reply_to_message?.photo || msg.document || msg.reply_to_message?.document;

                if (prefix || isPhoto || hasRecentImg) {
                    let aiType = "nano";
                    if (new RegExp(`^(${enhanceKeywords})$`, "i").test(keyword)) {
                        aiType = "enhance";
                        if (keyword.includes("bg") || keyword.includes("background") || keyword.includes("خلفية")) aiType = "remove-bg";
                        if (keyword.includes("upscale") || keyword.includes("جودة")) aiType = "upscale";
                    } else if (new RegExp(`^(${colorizeKeywords})$`, "i").test(keyword)) aiType = "colorize";
                    else if (new RegExp(`^(${ghibliKeywords})$`, "i").test(keyword)) aiType = "ghibli";

                    try {
                        const editCmd = require('../commands/image/edit');
                        const mockSock = createMockSock(bot, msg, chatId);
                        await editCmd(mockSock, chatId, msg, [], { aiType, aiPrompt: rest }, detectLanguage(body));
                        commandHandled = true;
                    } catch (err) {
                        console.error("[Telegram AI Edit Auto-Route Error]:", err.message);
                    }
                }
            }

            if (commandHandled) return;

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
                        await db.logError(command, err.message, 'TG').catch(() => {});
                    }
                }
            }

            if (!commandHandled && text && !isQuestionOrInquiry(text)) {
                // Use unified NLC map (same as WhatsApp & Facebook)
                const nlcKeywords = NLC_KEYWORDS;

                for (const [key, path] of Object.entries(nlcKeywords)) {
                    // Use word boundaries for NLC to avoid matching inside other commands
                    if (new RegExp(`(^|\\s)(${key})(\\s|$)`, "i").test(lowerBody)) {
                        try {
                            const rest = lowerBody.replace(new RegExp(`.*(${key})`, "i"), "").trim().split(" ").filter(a => a);
                            const cmdFile = require(`../commands/${path}`);
                            const mockSock = createMockSock(bot, msg, chatId);
                            const helpers = { isTelegram: true, command: path.split('/').pop() };
                            await cmdFile(mockSock, chatId, msg, rest, helpers, detectLanguage(text));
                            commandHandled = true;
                            if (global.trackCommand) global.trackCommand(path.split('/').pop(), 'telegram');
                            break;
                        } catch (e) {
                            console.error('[Telegram NLC Error]:', e.message);
                            await db.logError(path.split('/').pop(), e.message, 'TG').catch(() => {});
                        }
                    }
                }
            }

            if (commandHandled || !text) return;

            // If chatbot is disabled globally, skip AI chat responses (read fresh config every time)
            if (require('../config').enableChatbot === 'false') return;

            // Follow-up on recent image
            const context = await getContext('tg:' + chatId);
            const isRecentImg = context.lastImage && Date.now() - context.lastImage.timestamp < 5 * 60 * 1000;
            if (isRecentImg && text.length > 2 && !text.startsWith(".")) {
                try {
                    const analyze = require('../commands/ai/analyze');
                    const mockSock = createMockSock(bot, msg, chatId);
                    await analyze(mockSock, chatId, msg, text.split(" "), { buffer: context.lastImage.buffer, mime: context.lastImage.mime, caption: text }, detectLanguage(text));
                    return;
                } catch (e) { }
            }

            // Auto-download social media links before falling through to AI chat
            if (text && !commandHandled) {
                const mockSockDL = createMockSock(bot, msg, chatId);
                const downloaded = await handleAutoDownload(text, mockSockDL, chatId, msg, { isTelegram: true });
                if (downloaded) return;
            }

            // AI Race — Pollinations first (fastest + best Arabic), then fallbacks
            console.log(chalk.cyan(`[TG AI] Racing for: "${text.substring(0,30)}" from ${chatId}`));
            const tgJid = 'tg:' + chatId;
            const aiPromises = [
                getPollinationsResponse(tgJid, text),
                getStableAIResponse(tgJid, text),
            ];
            if (config.geminiApiKey) aiPromises.push(getGeminiResponse(tgJid, text));
            if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(tgJid, text));
            aiPromises.push(getAutoGPTResponse(tgJid, text));

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
                reply = await getStableAIResponse(tgJid, text);
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
                if (isRealReply) await addToHistory(tgJid, 'user', text);

                let botReplyText = reply;
                let extractedCommand = null;

                const cmdMatchAI = reply.match(/\[COMMAND:\s*(\.[a-zA-Z0-9\u0600-\u06FF\-_]+.*?)]/i);
                if (cmdMatchAI) {
                    extractedCommand = cmdMatchAI[1].trim();
                    botReplyText = reply.replace(cmdMatchAI[0], '').trim();
                }

                if (botReplyText && isRealReply) {
                    await addToHistory(tgJid, 'assistant', botReplyText);
                } else if (extractedCommand) {
                    await addToHistory(tgJid, 'assistant', '[تم تنفيذ الأداة بنجاح]');
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
                    const cmdMatch = extractedCommand.match(/^[\.]?\s*([a-zA-Z0-9\u0600-\u06FF\-_]+)(\s+.*|$)/i);
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
                            } catch (err) {
                                console.error("[Telegram] AI Command Execution Error:", err);
                                await db.logError(command, err.message, 'TG').catch(() => {});
                            }
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

            if (data === 'menu_all') {
                await bot.answerCallbackQuery(query.id);
                const cfg = require('../config');
                const allText = Object.values(MENU_CATEGORIES).map(c => c.text || c.title).join('\n\n━━━━━━━━━━━━━━━━\n\n');
                await bot.sendMessage(chatId, allText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع للقائمة', callback_data: 'menu_main' }]] } });
                return;
            }

            if (data.startsWith('menu_cat_')) {
                const cat = data.replace('menu_cat_', '');
                await bot.answerCallbackQuery(query.id);
                return showMenuCategory(bot, chatId, msgId, cat, query.from.first_name);
            }

            if (data.startsWith('menu_cmd_')) {
                const cmd = data.replace('menu_cmd_', '');
                await bot.answerCallbackQuery(query.id, { text: `⚡ جاري تنفيذ .${cmd}...` });

                // First: collapse the menu to just a re-open button so user knows it's running
                try {
                    await bot.editMessageReplyMarkup({
                        inline_keyboard: [[{ text: `⏳ جاري تنفيذ .${cmd}...`, callback_data: 'menu_main' }]]
                    }, { chat_id: chatId, message_id: msgId });
                } catch (e) { }

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
                        await bot.sendMessage(chatId, `❌ خطأ في تنفيذ .${cmd}: ${err.message}`);
                        await db.logError(cmd, err.message, 'TG').catch(() => {});
                    }
                } else {
                    await bot.sendMessage(chatId, `⚠️ الأمر *.${cmd}* غير متاح حالياً.`, { parse_mode: 'Markdown' });
                }

                // Restore menu button after command runs
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
