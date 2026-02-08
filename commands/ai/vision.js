const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const chalk = require('chalk');
const config = require('../../config');
const {
    getGeminiResponse,
    getOpenRouterResponse,
    getObitoAnalyze,
    getHFVision,
    getPollinationsResponse,
    addToHistory
} = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const { type, isVideo, buffer: passedBuffer, mime: passedMime, caption: passedCaption, command } = helpers;

    let buffer = passedBuffer;
    let caption = passedCaption;
    let mime = passedMime;
    let reply;

    try {
        if (command === 'hl' || command === 'حلل' || command === 'تحليل') {
            const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
            const quotedType = Object.keys(q || {})[0];

            if (quotedType === "imageMessage" || quotedType === "documentWithCaptionMessage") {
                await sock.sendPresenceUpdate("composing", chatId);
                const quotedMsg = { message: q };
                buffer = await downloadMediaMessage(
                    quotedMsg,
                    "buffer",
                    {},
                    { logger: pino({ level: "silent" }) },
                );
                let textInCmd = args.join(" ");

                const lowerText = textInCmd.toLowerCase();
                const isExercise = lowerText.match(/tmrin|tamrin|tmarin|تمرين|تمارين|exer|devoir|jawb|ajib|أجب|حل|solve|question|sujet|exam/);

                let finalCaption;
                if (isExercise) {
                    finalCaption = `تصرف كأستاذ ذكي وخبير. قم بحل هذا التمرين أو السؤال بالتفصيل الممل، خطوة بخطوة. سياق السؤال: ${textInCmd}`;
                } else {
                    finalCaption = textInCmd
                        ? `قم بتحليل الصورة بدقة، ثم أجب على سؤال المستخدم بناءً على ما تراه في الصورة. سؤال المستخدم هو: "${textInCmd}"`
                        : "صف ما يوجد في هذه الصورة بالتفصيل.";
                }
                mime = (q.imageMessage || q.documentWithCaptionMessage?.message?.imageMessage)?.mimetype || "image/jpeg";

                const result = await getObitoAnalyze(buffer, finalCaption, mime);
                if (result) {
                    const formattedReply = `*⎔ ⋅ ───━ •﹝🤖 التحليل الذكي ﹞• ━─── ⋅ ⎔*\n\n${result}\n\n*${config.botName} - ${config.botOwner}*\n*⎔ ⋅ ───━ •﹝✅﹞• ━─── ⋅ ⎔*`;
                    return await sock.sendMessage(chatId, { text: formattedReply }, { quoted: msg });
                } else {
                    return await sock.sendMessage(chatId, { text: "❌ فشل تحليل الصورة." }, { quoted: msg });
                }
            } else {
                return await sock.sendMessage(chatId, {
                    text: `*⎔ ⋅ ───━ •﹝🧠﹞• ━─── ⋅ ⎔*\n\n📝 *طريقة الاستخدام:* \nأرسل صورة مع سؤال أو رد على صورة مكتوباً:\n.hl من هذه الشخصية؟\n\n*${config.botName}*\n*⎔ ⋅ ───━ •﹝🧠﹞• ━─── ⋅ ⎔*`
                }, { quoted: msg });
            }
        }

        // Automatic Vision Processing
        if (isVideo) {
            reply = await getPollinationsResponse(chatId, caption);
        } else {
            const lowerCaption = (caption || "").toLowerCase();
            const isExercise = lowerCaption.match(/tmrin|tamrin|tmarin|تمرين|تمارين|exer|devoir|jawb|ajib|أجب|حل|solve|question|sujet|exam/);

            let prompt;
            if (isExercise) {
                prompt = `تصرف كأستاذ ذكي وخبير. المطلوب منك هو حل التمرين أو السؤال الموجود في الصورة حلاً كاملاً ومفصلاً خطوة بخطوة. اشرح الطريقة والنتيجة بوضوح. سؤال المستخدم: "${caption}"`;
            } else if ((caption || "").length > 2) {
                prompt = `قم بتحليل الصورة بدقة عالية وفهم كل التفاصيل فيها، ثم أجب على سؤال المستخدم بناءً على ما تراه. سؤال المستخدم هو: "${caption}". يرجى الإجابة بدقة وتفصيل.`;
            } else {
                prompt = "حلل هذه الصورة بالتفصيل الممل واشرح كل ما تراه فيها (الأشخاص، الأشياء، المكان، الألوان، النصوص إن وجدت).";
            }

            if (config.geminiApiKey) {
                reply = await getGeminiResponse(chatId, prompt, buffer, mime);
            }
            if (!reply && config.openRouterKey) {
                reply = await getOpenRouterResponse(chatId, prompt, buffer);
            }
            if (!reply) {
                reply = await getObitoAnalyze(buffer, prompt, mime);
            }
            if (!reply) {
                reply = await getHFVision(buffer, prompt);
            }

            if (reply) {
                const isQuestion = (caption || "").length > 2;
                if (isQuestion) {
                    reply = `${reply}\n\n*${config.botName}*`;
                } else {
                    reply = `*⎔ ⋅ ───━ •﹝🤖 التحليل الذكي الفائق ﹞• ━─── ⋅ ⎔*\n\n${reply}\n\n*${config.botName} - ${config.botOwner}*\n*⎔ ⋅ ───━ •﹝✅﹞• ━─── ⋅ ⎔*`;
                }
            }
        }

        if (!reply && !isVideo) {
            reply = "⚠️ عذراً، ما قدرتش نقرا هاد التصويرة مزيان. عافاك دير ليها لقطة شاشة (Screenshot / la9tat chacha) وعاود صيفطها باش نقدر نجاوبك فالحين! 🙏";
        } else if (!reply && isVideo) {
            reply = await getPollinationsResponse(chatId, caption);
        }

        if (reply) {
            addToHistory(chatId, "user", caption || "Sent an image", buffer ? { buffer, mime } : null);
            addToHistory(chatId, "assistant", reply);
            await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
        }
    } catch (err) {
        console.error("Vision Processing Error:", err);
        await sock.sendMessage(chatId, { text: "أعتذر، وقع مشكل فمعالجة هاد الصورة. جرب مرة أخرى." }, { quoted: msg });
    }
};
