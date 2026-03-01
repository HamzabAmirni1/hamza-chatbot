const axios = require('axios');
const config = require('../../config');
const { generateWAMessageContent } = require('@whiskeysockets/baileys');

// ========================
// API Keys (Decoded inline)
// ========================
const fireKeys = ["fw_3ZQMXwDwq3jZ884Jy2AErdiy"];

// ========================
// Fireworks Class
// ========================
class Fireworks {
    constructor() {
        this.keys = fireKeys;
        this.base = "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models";
    }

    async _ri(image, sock) {
        try {
            if (!image) return null;
            if (Buffer.isBuffer(image)) return image.toString("base64");
            if (typeof image === 'string' && /^https?:\/\//.test(image)) {
                const r = await axios.get(image, { responseType: "arraybuffer" });
                return Buffer.from(r.data).toString("base64");
            }
            return image.replace(/^data:[^;]+;base64,/, "");
        } catch (e) {
            throw new Error("Image processing failed");
        }
    }

    async _rk(fn) {
        let lastError;
        for (let i = 0; i < this.keys.length; i++) {
            const key = this.keys[i];
            try {
                return await fn(key);
            } catch (e) {
                lastError = e;
                const status = e.response?.status;
                if (![401, 403, 429].includes(status)) throw e;
            }
        }
        throw lastError;
    }

    async _rp(model, id, key) {
        const url = `${this.base}/${model}/get_result`;
        for (let i = 1; i <= 30; i++) {
            try {
                await new Promise(r => setTimeout(r, 2000));
                const { data } = await axios.post(url, { id }, { headers: { Authorization: `Bearer ${key}` } });
                const state = data.status?.state ?? data.status;
                if (["Ready", "SUCCESS", "COMPLETE", "succeeded"].includes(state) || data.result) return data;
                if (["FAILED", "ERROR", "failed"].includes(state)) throw new Error(`Task Failed: ${JSON.stringify(data.status)}`);
            } catch (e) {
                if (e.message.startsWith("Task Failed")) throw e;
            }
        }
        throw new Error("Polling timeout (60s)");
    }

    async generate({ prompt, image, model, sock }) {
        try {
            const isI2I = !!image;
            let selectedModel = model || (isI2I ? "flux-kontext-pro" : "flux-1-schnell-fp8");
            const payload = { prompt, ...(isI2I && { input_image: await this._ri(image, sock) }) };

            if (!isI2I) {
                return await this._rk(async key => {
                    const response = await axios.post(`${this.base}/${selectedModel}/text_to_image`, payload, {
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Accept: "image/jpeg" },
                        responseType: "arraybuffer"
                    });
                    return { buffer: Buffer.from(response.data) };
                });
            } else {
                let activeKey;
                const initData = await this._rk(async key => {
                    activeKey = key;
                    const { data } = await axios.post(`${this.base}/${selectedModel}`, payload, {
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }
                    });
                    return data;
                });
                const taskId = initData.id || initData.request_id;
                const resultJson = await this._rp(selectedModel, taskId, activeKey);
                const res = resultJson.result || {};
                let finalBuffer;
                if (res.sample) {
                    const dl = await axios.get(res.sample, { responseType: "arraybuffer" });
                    finalBuffer = Buffer.from(dl.data);
                } else if (res.base64) {
                    finalBuffer = Buffer.from(res.base64, "base64");
                } else throw new Error("Response structure unknown");
                return { buffer: finalBuffer };
            }
        } catch (e) {
            throw new Error(e.message);
        }
    }
}

module.exports = async (sock, chatId, msg, args, helpers, userLang) => {
    let prompt = args.join(" ");
    if (!prompt && !msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        return await sock.sendMessage(chatId, { text: "🎨 *Fireworks Image Generator*\n\nEx: .imagine a beautiful sunset\nOr reply to an image to transform it." }, { quoted: msg });
    }

    let model = null;
    const modelMatch = prompt.match(/--model\s+(\S+)/);
    if (modelMatch) {
        model = modelMatch[1];
        prompt = prompt.replace(modelMatch[0], "").trim();
    }

    let imageBuffer = null;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted && (quoted.imageMessage || quoted.stickerMessage)) {
        try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            imageBuffer = await downloadMediaMessage({ message: quoted }, 'buffer', {}, { logger: { level: 'silent' } });
        } catch (e) { console.error(e); }
    }

    await sock.sendMessage(chatId, { react: { text: "🎨", key: msg.key } });

    try {
        const api = new Fireworks();
        const result = await api.generate({ prompt, image: imageBuffer, model, sock });
        await sock.sendMessage(chatId, { image: result.buffer, caption: `✅ *Done!*\n📝 *Prompt:* ${prompt}` }, { quoted: msg });
    } catch (error) {
        await sock.sendMessage(chatId, { text: `❌ *Failed:* ${error.message}` }, { quoted: msg });
    }
};
