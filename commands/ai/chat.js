const config = require('../../config');
const { getHectormanuelAI, addToHistory } = require('../../lib/ai');

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const { command, delayPromise } = helpers;
    const query = args.join(' ');

    if (!query) {
        return await sock.sendMessage(chatId, { text: `❓ يرجى كتابة سؤالك.\nمثال: .${command} كيف حالك؟` }, { quoted: msg });
    }

    const modelMap = {
        gpt3: "gpt-3.5-turbo",
        gpt4: "gpt-4",
        gpt4o: "gpt-4o",
        gpt4om: "gpt-4o-mini",
        o1: "o1-preview",
    };
    const model = modelMap[command] || "gpt-4o";

    if (delayPromise) await delayPromise;

    const res = await getHectormanuelAI(chatId, query, model);
    if (res) {
        await sock.sendMessage(chatId, { text: `🤖 *GPT (${model}):*\n\n${res}` }, { quoted: msg });
        addToHistory(chatId, "user", query);
        addToHistory(chatId, "assistant", res);
    } else {
        await sock.sendMessage(chatId, { text: "❌ فشلت عملية الدردشة. حاول لاحقاً." }, { quoted: msg });
    }
};
