const yts = require('yt-search');
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const settings = require('../../config');
const { t } = require('../../lib/language');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const isTelegram = helpers && helpers.isTelegram;
    const query = args.join(' ');

    if (!query) {
        return await sock.sendMessage(chatId, {
            text: t('yts.usage', { prefix: settings.prefix, botName: settings.botName }, userLang)
        }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "🔍", key: msg.key } });

    try {
        const searchResults = await yts(query);
        const videos = searchResults.videos.slice(0, 10);

        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, { text: t('yts.no_result', {}, userLang) }, { quoted: msg });
        }

        if (isTelegram || (helpers && helpers.isFacebook)) {
            // Telegram/Facebook implementation (Plain text + buttons/No buttons fallback)
            let responseText = `📺 *YouTube Search Results* 📺\n\n📌 Results for: *${query}*\n\n`;
            let buttons = [];

            for (let i = 0; i < Math.min(videos.length, 6); i++) {
                const v = videos[i];
                responseText += `${i + 1}. *${v.title}*\n⏱️ *Duration:* ${v.timestamp}\n👀 *Views:* ${v.views}\n\n`;

                if (isTelegram) {
                    buttons.push([
                        { text: `${i + 1} 📹 Video`, callback_data: `.video ${v.url}` },
                        { text: `${i + 1} 🎵 Audio`, callback_data: `.play ${v.url}` }
                    ]);
                }
            }

            if (isTelegram) {
                return await sock.sendMessage(chatId, {
                    text: responseText,
                    reply_markup: { inline_keyboard: buttons }
                });
            } else {
                // Facebook - just text
                return await sock.sendMessage(chatId, { text: responseText });
            }
        }

        // WhatsApp implementation (Carousel)
        async function createHeaderImage(url) {
            try {
                const { imageMessage } = await generateWAMessageContent({ image: { url } }, { upload: sock.waUploadToServer });
                return imageMessage;
            } catch (e) {
                const fallback = 'https://ui-avatars.com/api/?name=YouTube&background=FF0000&color=FFFFFF&size=512';
                const { imageMessage } = await generateWAMessageContent({ image: { url: fallback } }, { upload: sock.waUploadToServer });
                return imageMessage;
            }
        }

        const L_LIB = t('yts.library_title', {}, userLang) || '📺 *YouTube Search*';
        const L_RESULTS = t('yts.results_for', { query }, userLang) || `Results for: *${query}*`;
        const L_VIDEO = 'Video 📹';
        const L_AUDIO = 'Audio 🎵';

        let cards = [];
        for (let v of videos) {
            const imageMessage = await createHeaderImage(v.thumbnail);

            cards.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `🎬 *${v.title}*\n⏱️ *Duration:* ${v.timestamp}\n👀 *Views:* ${v.views}\n📅 *Uploaded:* ${v.ago}`
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: v.author.name,
                    hasMediaAttachment: true,
                    imageMessage
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [
                        {
                            "name": "quick_reply",
                            "buttonParamsJson": JSON.stringify({ display_text: L_VIDEO, id: `.video ${v.url}` })
                        },
                        {
                            "name": "quick_reply",
                            "buttonParamsJson": JSON.stringify({ display_text: L_AUDIO, id: `.play ${v.url}` })
                        }
                    ]
                })
            });
        }

        const botMsg = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({ text: `${L_LIB}\n\n${L_RESULTS}` }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: `🤖 ${settings.botName}` }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
                    })
                }
            }
        }, { quoted: msg });

        await sock.relayMessage(chatId, botMsg.message, { messageId: botMsg.key.id });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error('Error in yts:', e);
        await sock.sendMessage(chatId, { text: t('common.error', {}, userLang) }, { quoted: msg });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
