const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

// Conversation Memory Storage
const chatMemory = new Map();
const MAX_HISTORY = 50;

function getContext(jid) {
    if (!chatMemory.has(jid)) {
        chatMemory.set(jid, { messages: [], lastImage: null });
    }
    return chatMemory.get(jid);
}

function addToHistory(jid, role, content, image = null) {
    const context = getContext(jid);
    context.messages.push({ role, content });
    if (image) {
        context.lastImage = {
            ...image,
            timestamp: Date.now(),
        };
    }
    if (context.messages.length > MAX_HISTORY) context.messages.shift();
}

async function translateToEn(text) {
    try {
        const res = await axios.get(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`,
        );
        return res.data?.[0]?.[0]?.[0] || text;
    } catch (e) {
        return text;
    }
}

async function tryRequest(getter, attempts = 2) {
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await getter();
            if (res) return res;
        } catch (e) {
            if (i === attempts - 1) return null;
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    return null;
}

async function getLuminAIResponse(jid, message) {
    try {
        const { data } = await axios.post("https://luminai.my.id/", {
            content: message,
            user: jid,
            prompt: config.systemPromptAI,
            webSearch: false, // Faster without web search by default
        }, { timeout: 10000 });
        return data.result || data.response;
    } catch (e) {
        return null;
    }
}

async function getAIDEVResponse(jid, message) {
    try {
        const { data } = await axios.get(
            `https://api.vreden.my.id/api/ai/gpt?query=${encodeURIComponent(message)}`,
            { timeout: 10000 }
        );
        return data.result || data.response;
    } catch (e) {
        return null;
    }
}

async function getBlackboxResponse(jid, message) {
    try {
        const { data } = await axios.get(
            `https://api.vreden.my.id/api/ai/blackbox?query=${encodeURIComponent(message)}`,
            { timeout: 10000 }
        );
        return data.result || data.response;
    } catch (e) {
        return null;
    }
}

async function getPollinationsResponse(jid, message) {
    try {
        const history = getContext(jid).messages;
        const messages = [
            { role: "system", content: config.systemPromptAI },
            ...history,
            { role: "user", content: message },
        ];
        const { data } = await axios.post("https://text.pollinations.ai/", {
            messages,
            model: "openai",
            code: "hamza-amirni-bot",
            jsonMode: false,
            seed: Math.floor(Math.random() * 1000)
        }, { timeout: 10000 });

        // Remove Ad
        let cleanResponse = typeof data === 'string' ? data : JSON.stringify(data);
        cleanResponse = cleanResponse.replace(/\*Support Pollinations\.AI:\*[\s\S]*$/, '').trim();
        cleanResponse = cleanResponse.replace(/\*Ad\*[\s\S]*$/, '').trim();

        // Fix Name Hallucinations
        cleanResponse = cleanResponse.replace(/حمزة عمرني/g, "حمزة اعمرني");
        cleanResponse = cleanResponse.replace(/حمزة العمرني/g, "حمزة اعمرني");
        cleanResponse = cleanResponse.replace(/Hamza Amrani/g, "Hamza Amirni");

        return cleanResponse;
    } catch (e) {
        return null;
    }
}

async function getStableAIResponse(jid, message) {
    try {
        const history = getContext(jid).messages.slice(-6).map(h => `${h.role}: ${h.content}`).join('\n');
        const aiHost = 'all-in-1-ais.officialhectormanuel.workers.dev';
        const aiIP = '104.21.83.121'; // Cloudflare IP to bypass DNS failures

        const { data } = await axios.get(`https://${aiIP}?query=${encodeURIComponent(config.systemPromptAI + '\n\n' + history + '\nUser: ' + message)}&model=gpt-4o-mini`, {
            headers: { 'Host': aiHost },
            timeout: 20000,
            httpsAgent: new (require('https')).Agent({ keepAlive: true, rejectUnauthorized: false, servername: aiHost })
        });

        const reply = data?.choices?.[0]?.message?.content || data?.message?.content || data?.reply;
        return reply ? reply.replace(/\*/g, '').replace(/\//g, '').trim() : null;
    } catch (e) {
        return null;
    }
}

async function getHectormanuelAI(jid, message, model = "gpt-4o") {
    try {
        const history = getContext(jid).messages;
        const messages = [
            { role: "system", content: config.systemPromptAI },
            ...history,
            { role: "user", content: message },
        ];
        const { data } = await axios.post(
            "https://ai-api.officialhectormanuel.workers.dev/",
            { model, messages },
            { timeout: 10000 }
        );
        return data.choices?.[0]?.message?.content || data.response;
    } catch (e) {
        return null;
    }
}

async function getAutoGPTResponse(jid, message) {
    return await tryRequest(async () => {
        let r = await getHectormanuelAI(jid, message, "gpt-4o");
        if (!r) r = await getHectormanuelAI(jid, message, "gpt-4o-mini");
        return r;
    });
}

async function getHuggingFaceResponse(jid, text) {
    try {
        const { data } = await axios.post(
            "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
            { inputs: text },
            { headers: { Authorization: `Bearer ${config.hfToken}` } },
        );
        return data[0]?.generated_text || data.summary_text;
    } catch (e) {
        return null;
    }
}

async function getOpenRouterResponse(jid, text, imageBuffer = null) {
    try {
        if (!config.openRouterKey) return null;
        const history = getContext(jid).messages;
        const content = [{ type: "text", text }];
        if (imageBuffer) {
            content.push({
                type: "image_url",
                image_url: {
                    url: `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
                },
            });
        }

        const messages = [
            { role: "system", content: config.systemPromptAI },
            ...history,
            { role: "user", content },
        ];

        const { data } = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: imageBuffer ? "google/gemini-flash-1.5-8b" : "meta-llama/llama-3.1-8b-instruct:free",
                messages,
            },
            {
                headers: {
                    Authorization: `Bearer ${config.openRouterKey}`,
                    "Content-Type": "application/json",
                },
            },
        );
        return data.choices?.[0]?.message?.content;
    } catch (e) {
        return null;
    }
}

async function getGeminiResponse(jid, prompt, imageBuffer = null, mime = "image/jpeg") {
    try {
        if (!config.geminiApiKey) return null;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`;

        const history = getContext(jid).messages.slice(-10);
        const contents = history.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));

        const userPart = { text: prompt };
        const parts = [userPart];

        if (imageBuffer) {
            parts.push({
                inline_data: {
                    mime_type: mime,
                    data: imageBuffer.toString("base64"),
                },
            });
        }

        contents.push({ role: "user", parts });

        const { data } = await axios.post(url, {
            contents,
            system_instruction: { parts: [{ text: config.systemPromptAI }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        });

        return data.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (e) {
        console.error("Gemini Error:", e.response?.data || e.message);
        return null;
    }
}

async function getHFVision(buffer, prompt) {
    try {
        const { data } = await axios.post(
            "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large",
            buffer,
            { headers: { Authorization: `Bearer ${config.hfToken}` } },
        );
        const desc = data[0]?.generated_text || "A beautiful image";
        const enPrompt = await translateToEn(prompt);
        return await getAutoGPTResponse("system", `Analyze this image description: "${desc}". User question about the image: "${enPrompt}". Give a detailed answer in the same language as the user's question.`);
    } catch (e) {
        return null;
    }
}

async function getObitoAnalyze(buffer, prompt, mime) {
    try {
        const body = new (require('form-data'))();
        body.append("image", buffer, { filename: "image.jpg", contentType: mime });
        body.append("prompt", prompt);

        const { data } = await axios.post("https://api.obito.my.id/api/vision", body, {
            headers: body.getHeaders(),
        });
        return data.result;
    } catch (e) {
        return null;
    }
}

module.exports = {
    getContext,
    addToHistory,
    translateToEn,
    tryRequest,
    getLuminAIResponse,
    getAIDEVResponse,
    getPollinationsResponse,
    getHectormanuelAI,
    getAutoGPTResponse,
    getHuggingFaceResponse,
    getOpenRouterResponse,
    getGeminiResponse,
    getHFVision,
    getObitoAnalyze,
    getBlackboxResponse,
    getStableAIResponse
};
