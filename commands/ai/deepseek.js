const axios = require('axios');
const config = require('../../config');

class DeepSeek {
    constructor() {
        this.api = axios.create({
            baseURL: "https://ark.cn-beijing.volces.com/api/v3",
            headers: {
                Authorization: "Bearer 937e9831-d15e-4674-8bd3-a30be3e148e9",
                "Content-Type": "application/json",
                "User-Agent": "okhttp/4.12.0"
            }
        });
        this.history = [];
    }

    async chat({ prompt, messages, ...rest }) {
        const msgList = messages || this.history;
        const model = rest.model ? rest.model : "deepseek-v3-1-250821";
        msgList.push({ role: "user", content: prompt || "" });

        try {
            const { data } = await this.api.post("/chat/completions", {
                model: model,
                messages: msgList,
                max_tokens: rest.max_tokens || 1024,
                temperature: rest.temperature ?? 0.1
            });
            const result = data?.choices?.[0]?.message?.content || "";
            if (result) msgList.push({ role: "assistant", content: result });
            return { result };
        } catch (error) {
            throw new Error(error?.response?.data?.error?.message || error.message);
        }
    }
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    const prompt = args.join(" ");
    if (!prompt) return await sock.sendMessage(chatId, { text: "🔍 *DeepSeek AI*\n\nUsage: .deepseek [prompt]" }, { quoted: msg });

    await sock.sendMessage(chatId, { react: { text: "🧠", key: msg.key } });

    try {
        const api = new DeepSeek();
        const response = await api.chat({ prompt });
        await sock.sendMessage(chatId, { text: `🧠 *DeepSeek Response:*\n\n${response.result}` }, { quoted: msg });
    } catch (err) {
        await sock.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    }
};
