const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const { db } = require('./supabase');
const chalk = require('chalk');


// Conversation Memory Storage
const chatMemory = new Map();
const MAX_HISTORY = 30;

// Messages that should NEVER be fed back to the AI as context
const ERROR_PATTERNS = ['⚠️', 'الخادم مشغول', 'حاول مجدداً', 'حاول مجددا', '<!doctype', '<html'];

function detectLanguage(text) {
    if (!text) return 'ar';
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text) ? 'ar' : 'en';
}

function getSystemPrompt(text, isVision = false) {
    const lang = detectLanguage(text);
    
    // Dynamically calculate current date/time in Morocco
    const moroccoTimeAr = new Date().toLocaleString('ar-MA', {
        timeZone: 'Africa/Casablanca',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const moroccoTimeEn = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Casablanca',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const dateInstruction = lang === 'ar'
        ? `\n\n📌 تاريخ ووقت اليوم في المغرب هو: ${moroccoTimeAr}.`
        : `\n\n📌 Today's date and time in Morocco is: ${moroccoTimeEn}.`;

    if (isVision) {
        return lang === 'ar' 
            ? "أنت مساعد ذكي خبير في تحليل الصور وحل التمارين. اسمك هو 'بوت حمزة اعمرني'.\n\n⚠️ القواعد الصارمة:\n1. إذا كانت الصورة تحتوي على تمرين مدرسي، أجب بنفس لغة التمرين.\n2. في جميع الحالات الأخرى، وبالخصوص إذا كان طلب المستخدم بالعربية، أجب **حصرياً** بالدارجة المغربية أو العربية. لا تستخدم الإنجليزية أبداً في الشرح.\n3. قدم شرحاً مفصلاً وممتعاً مع الرموز التعبيرية." + dateInstruction
            : "You are an expert image analyzer and problem solver. Your name is 'Hamza Amirni Bot'.\n\n⚠️ STRICT RULES:\n1. If the image contains text or exercises, answer in the same language as the text.\n2. In all other cases, or if the user's request is in English, reply in English.\n3. Provide detailed and engaging explanations with Emojis." + dateInstruction;
    }
    const langInstruction = lang === 'ar' 
        ? "\n\n⚠️ هام: أجب دائماً باللغة العربية أو الدارجة المغربية." 
        : "\n\n⚠️ IMPORTANT: Always reply in English.";
    return config.systemPromptAI + langInstruction + dateInstruction;
}

// ─── Web Search Integration ───────────────────────────────────────────────────
// Keywords that indicate the user needs live/current information
const WEB_SEARCH_TRIGGERS_AR = [
    'اليوم', 'الآن', 'الان', 'الآن', 'حاليا', 'حالياً', 'أحدث', 'احدث',
    'أخبار', 'اخبار', 'خبر', 'عاجل', 'آخر', 'اخر', 'جديد', 'جديدة',
    'سعر', 'ثمن', 'كم ثمن', 'كم سعر', 'كيلو', 'دولار', 'درهم', 'يورو',
    'طقس', 'حرارة', 'درجة الحرارة', 'مطر', 'رياح',
    'مباراة', 'نتيجة', 'سكور', 'ملخص', 'نتائج', 'دوري', 'كرة',
    'الانتخابات', 'رئيس', 'حكومة', 'وزير', 'ملك',
    'زلزال', 'حادثة', 'حادث', 'فيضان', 'كارثة',
    'بورصة', 'أسهم', 'أسعار', 'اقتصاد'
];
const WEB_SEARCH_TRIGGERS_EN = [
    'today', 'now', 'current', 'latest', 'recent', 'breaking', 'news',
    'price', 'cost', 'how much', 'weather', 'temperature', 'score',
    'match', 'result', 'election', 'stock', 'market', 'earthquake',
    'live', 'update', 'happening', '2024', '2025', '2026'
];

function needsWebSearch(text) {
    if (!text || text.length < 4) return false;
    const lower = text.toLowerCase();
    return WEB_SEARCH_TRIGGERS_AR.some(t => lower.includes(t)) ||
           WEB_SEARCH_TRIGGERS_EN.some(t => lower.includes(t));
}

/**
 * Performs a web search and returns a summary of results.
 * Uses DuckDuckGo Instant Answer API (free, no key needed) +
 * Jina AI Reader as a fallback (also free).
 */
async function webSearch(query, lang = 'ar') {
    const results = [];
    const now = new Date().toLocaleString('ar-MA', { timeZone: 'Africa/Casablanca', hour12: false });

    try {
        // 1. DuckDuckGo Instant Answer (fast, free, no key)
        const ddgRes = await axios.get(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
            { timeout: 6000, headers: { 'Accept-Language': lang === 'ar' ? 'ar' : 'en' } }
        );
        const ddg = ddgRes.data;
        if (ddg.AbstractText && ddg.AbstractText.length > 30) {
            results.push(`📌 ${ddg.AbstractText}`);
        }
        if (ddg.RelatedTopics?.length) {
            const topics = ddg.RelatedTopics
                .filter(t => t.Text && t.Text.length > 20)
                .slice(0, 3)
                .map(t => `• ${t.Text}`);
            if (topics.length) results.push(topics.join('\n'));
        }
        if (ddg.Answer) results.push(`✅ ${ddg.Answer}`);
    } catch (e) {}

    try {
        // 2. SearXNG public instance (free, open source)
        const searxRes = await axios.get(
            `https://searx.be/search?q=${encodeURIComponent(query)}&format=json&language=${lang === 'ar' ? 'ar' : 'en'}`,
            { timeout: 7000 }
        );
        const hits = searxRes.data?.results?.slice(0, 3) || [];
        if (hits.length) {
            const snippets = hits
                .filter(h => h.content && h.content.length > 20)
                .map(h => `🔗 ${h.title}: ${h.content.substring(0, 200)}`);
            if (snippets.length) results.push(snippets.join('\n\n'));
        }
    } catch (e) {}

    try {
        // 3. Jina AI Reader — reads a real web page and returns text (free, no key)
        if (results.length === 0) {
            // Use Jina to read a DuckDuckGo search result page
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const jinaRes = await axios.get(`https://r.jina.ai/${encodeURIComponent(searchUrl)}`, {
                timeout: 8000,
                headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' }
            });
            if (jinaRes.data && typeof jinaRes.data === 'string') {
                const snippet = jinaRes.data.replace(/\n+/g, ' ').substring(0, 500).trim();
                if (snippet.length > 50) results.push(`🌐 ${snippet}`);
            }
        }
    } catch (e) {}

    if (!results.length) return null;

    return `📅 *معلومات من الويب (${now}):*\n\n${results.join('\n\n')}`.substring(0, 1800);
}

module.exports.webSearch = webSearch;
module.exports.needsWebSearch = needsWebSearch;


// Track last sync time per JID to avoid overloading Supabase
const lastSyncTime = new Map();
const SYNC_COOLDOWN = 60000; // 1 minute cooldown for DB sync

async function getContext(jid) {
    if (!chatMemory.has(jid)) {
        const stored = await db.getAIMemory(jid);
        // Filter out error/fallback messages from stored history
        const cleanHistory = (stored.history || []).filter(msg =>
            !ERROR_PATTERNS.some(p => msg.content && msg.content.includes(p))
        );
        chatMemory.set(jid, {
            messages: cleanHistory,
            lastImage: stored.last_image || null
        });
    }
    return chatMemory.get(jid);
}

async function clearHistory(jid) {
    chatMemory.delete(jid);
    lastSyncTime.delete(jid);
    await db.updateAIMemory(jid, [], null);
}

async function addToHistory(jid, role, content, image = null) {
    // Never save error/fallback messages to history
    if (ERROR_PATTERNS.some(p => content && content.includes(p))) return;

    const context = await getContext(jid);
    context.messages.push({ role, content });
    if (image) {
        context.lastImage = {
            ...image,
            timestamp: Date.now(),
        };
    }
    if (context.messages.length > MAX_HISTORY) context.messages.shift();
    
    // Auto-Sync to Supabase with Throttling
    const now = Date.now();
    const lastSync = lastSyncTime.get(jid) || 0;
    
    if (now - lastSync > SYNC_COOLDOWN) {
        lastSyncTime.set(jid, now);
        // We don't 'await' here to avoid blocking message flow, 
        // but we want to ensure it eventually finishes.
        db.updateAIMemory(jid, context.messages, context.lastImage).catch(() => {});
    }
}

async function translateText(text, targetLang) {
    try {
        const res = await axios.get(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`,
        );
        return res.data?.[0]?.map(x => x?.[0]).filter(Boolean).join('') || text;
    } catch (e) {
        return text;
    }
}

async function translateToEn(text) {
    return translateText(text, 'en');
}

function sanitizeAiResponse(text) {
    if (!text || typeof text !== 'string') return text;
    let clean = text.trim();
    
    // If it looks like JSON, try to extract the text content
    if (clean.startsWith('{') && clean.endsWith('}')) {
        try {
            const parsed = JSON.parse(clean);
            if (parsed.choices?.[0]?.message?.content) {
                clean = parsed.choices[0].message.content;
            } else if (parsed.content) {
                clean = parsed.content;
            } else if (parsed.message?.content) {
                clean = parsed.message.content;
            } else if (parsed.message) {
                clean = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message);
            } else if (parsed.response) {
                clean = parsed.response;
            } else if (parsed.reply) {
                clean = parsed.reply;
            } else if (parsed.result) {
                clean = parsed.result;
            } else if (parsed.text) {
                clean = parsed.text;
            } else if (parsed.role === 'assistant') {
                clean = parsed.content || '';
            }
        } catch (e) {}
    }
    
    // If the response is stringified JSON containing assistant blocks or tool_calls
    if (clean.includes('"role":"assistant"') || clean.includes('"tool_calls"')) {
        const match = clean.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (match && match[1]) {
            clean = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        } else {
            clean = clean.replace(/\{"role":"assistant"[\s\S]*/g, '').trim();
        }
    }

    // Fix Name Hallucinations
    clean = clean.replace(/حمزة عمرني/g, "حمزة اعمرني");
    clean = clean.replace(/حمزة العمرني/g, "حمزة اعمرني");
    clean = clean.replace(/Hamza Amrani/g, "Hamza Amirni");
    
    return clean;
}

async function tryRequest(getter, attempts = 2) {
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await getter();
            if (res) return sanitizeAiResponse(res);
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
            prompt: getSystemPrompt(message),
            webSearch: false, // Faster without web search by default
        }, { timeout: 10000 });
        return sanitizeAiResponse(data.result || data.response);
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
        return sanitizeAiResponse(data.result || data.response);
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
        return sanitizeAiResponse(data.result || data.response);
    } catch (e) {
        return null;
    }
}

async function getNoteGPTVision(imageUrl, prompt, lang = "ar") {
    try {
        const { data } = await axios.post(
            'https://notegpt.io/api/v2/homework/stream',
            {
                message: prompt,
                language: "default", // Let the system prompt handle language
                model: "gemini-3.1-flash-lite",
                tone: "default",
                length: "moderate",
                conversation_id: require('crypto').randomUUID(),
                image_urls: [imageUrl],
                stream_url: "/api/v2/homework/stream"
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://notegpt.io',
                    'Referer': 'https://notegpt.io/ai-answer-generator',
                    'User-Agent': 'Mozilla/5.0'
                }
            }
        );
        
        let fullText = '';
        const lines = data.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const jsonStr = line.slice(6);
                    if (!jsonStr) continue;
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.text) fullText += parsed.text;
                } catch (e) {}
            }
        }
        return fullText.trim() || null;
    } catch (e) {
        return null;
    }
}


async function getPollinationsResponse(jid, message) {
    try {
        const history = (await getContext(jid)).messages;
        const messages = [
            { role: "system", content: getSystemPrompt(message) },
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

        let cleanResponse = typeof data === 'string' ? data : JSON.stringify(data);
        
        // Reject HTML error pages
        if (cleanResponse.trim().toLowerCase().startsWith("<!doctype") || cleanResponse.includes("<html")) {
            return null;
        }

        // Remove Ad
        cleanResponse = cleanResponse.replace(/\*Support Pollinations\.AI:\*[\s\S]*$/, '').trim();
        cleanResponse = cleanResponse.replace(/\*Ad\*[\s\S]*$/, '').trim();

        return sanitizeAiResponse(cleanResponse);
    } catch (e) {
        return null;
    }
}

async function getStableAIResponse(jid, message) {
    try {
        const history = (await getContext(jid)).messages.slice(-6).map(h => `${h.role}: ${h.content}`).join('\n');
        const aiHost = 'all-in-1-ais.officialhectormanuel.workers.dev';
        const aiIP = '104.21.83.121'; // Cloudflare IP to bypass DNS failures

        const { data } = await axios.get(`https://${aiIP}?query=${encodeURIComponent(getSystemPrompt(message) + '\n\n' + history + '\nUser: ' + message)}&model=gpt-4o-mini`, {
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
        const history = (await getContext(jid)).messages;
        const messages = [
            { role: "system", content: getSystemPrompt(message) },
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
        const history = (await getContext(jid)).messages;
        const content = [{ type: "text", text }];
        if (imageBuffer) {
            content.push({
                type: "image_url",
                image_url: {
                    url: `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
                },
            });
        }

        let messages = [];
        const systemPrompt = getSystemPrompt(text, !!imageBuffer);
        
        if (jid && jid !== "system") {
            const history = (await getContext(jid)).messages;
            messages = [
                { role: "system", content: systemPrompt },
                ...history,
                { role: "user", content }
            ];
        } else {
            messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content }
            ];
        }

        const { data } = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: imageBuffer ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "qwen/qwen-2.5-7b-instruct:free",
                messages,
            },
            {
                headers: {
                    Authorization: `Bearer ${config.openRouterKey}`,
                    "Content-Type": "application/json",
                },
            },
        );
        let replyText = data.choices?.[0]?.message?.content;
        // Some OpenRouter models return a JSON object string with reasoning instead of plain text
        if (typeof replyText === 'string' && replyText.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(replyText);
                replyText = parsed.content || parsed.text || parsed.answer || parsed.response || replyText;
            } catch (e) { /* not JSON, use as-is */ }
        }
        return typeof replyText === 'string' ? replyText : null;
    } catch (e) {
        return null;
    }
}

async function getGeminiResponse(jid, prompt, imageBuffer = null, mime = "image/jpeg", customApiKey = null) {
    try {
        const apiKey = customApiKey || config.geminiApiKey;
        if (!apiKey) { console.warn('[Gemini] No API key configured — skipping'); return null; }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

        let contents = [];
        if (jid && jid !== "system") {
            const history = (await getContext(jid)).messages.slice(-10);
            contents = history.map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            }));
        }

        const parts = [];
        if (imageBuffer) {
            parts.push({
                inline_data: {
                    mime_type: mime,
                    data: imageBuffer.toString("base64"),
                },
            });
        }

        // ── Web Search Injection: add live context for time-sensitive queries ──
        let finalPrompt = prompt;
        if (!imageBuffer && needsWebSearch(prompt)) {
            try {
                const lang = detectLanguage(prompt);
                console.log(chalk.cyan(`[WebSearch] Detected live query, searching: "${prompt.substring(0, 60)}..."`));
                const searchResults = await Promise.race([
                    webSearch(prompt, lang),
                    new Promise(r => setTimeout(() => r(null), 5000)) // 5s max
                ]);
                if (searchResults) {
                    finalPrompt = `${searchResults}\n\n---\nبناءً على المعلومات أعلاه الحديثة من الإنترنت، أجب عن هذا السؤال:\n${prompt}`;
                    console.log(chalk.green(`[WebSearch] Injected ${searchResults.length} chars into Gemini context`));
                }
            } catch (e) {}
        }
        parts.push({ text: finalPrompt });


        contents.push({ role: "user", parts });

        const { data } = await axios.post(url, {
            contents,
            system_instruction: { parts: [{ text: getSystemPrompt(prompt, !!imageBuffer) }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        });

        return data.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (e) {
        const errData = e.response?.data?.error;
        console.error(`[Gemini] Error: ${errData?.code} ${errData?.status} — ${errData?.message?.split('\n')[0] || e.message}`);
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

// 🆓 HuggingFace Qwen2-VL Vision (free with free HF token — no Gemini!)
async function getHFQwenVision(buffer, prompt) {
    try {
        const hfKey = config.hfToken;
        if (!hfKey) return null; // Requires free HuggingFace token
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${hfKey}`
        };
        const base64 = buffer.toString('base64');
        const { data } = await axios.post(
            'https://router.huggingface.co/hf-inference/models/Qwen/Qwen2-VL-7B-Instruct/v1/chat/completions',
            {
                model: 'Qwen/Qwen2-VL-7B-Instruct',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
                        { type: 'text', text: prompt || 'صف ما في هذه الصورة بالتفصيل.' }
                    ]
                }],
                max_tokens: 1024
            },
            { headers, timeout: 30000 }
        );
        return data.choices?.[0]?.message?.content || null;
    } catch (e) {
        return null;
    }
}

const pdfParse = require('pdf-parse');

async function analyzeImage(buffer, mime, prompt, directUrl = null) {
    try {
        console.log(chalk.cyan(`[Vision] Analyzing image: Mime=${mime}, Size=${buffer ? buffer.length : 0} bytes`));
        const promises = [];
        let finalPrompt = prompt || "ماذا يوجد في هذه الصورة؟ اشرح بالتفصيل.";
        const lang = detectLanguage(finalPrompt);
        
        // Force language instruction in prompt to override model bias
        if (lang === 'ar') {
            finalPrompt += "\n\n⚠️ IMPORTANT: Answer ONLY in Arabic or Moroccan Darija. Do NOT use English.";
        } else {
            finalPrompt += "\n\n⚠️ IMPORTANT: Answer in English.";
        }

        const base64 = buffer.toString("base64");


        // 3. Pollinations URL mode (fast! only for non-Facebook CDN URLs)
        const isPublicUrl = directUrl && !directUrl.includes('fbcdn.net') && !directUrl.includes('scontent.');
        if (isPublicUrl) {
            promises.push((async () => {
                const { data } = await axios.post('https://text.pollinations.ai/', {
                    model: 'openai',
                    messages: [
                        { role: 'system', content: getSystemPrompt(finalPrompt, true) },
                        { role: 'user', content: [
                            { type: 'text', text: finalPrompt },
                            { type: 'image_url', image_url: { url: directUrl } }
                        ]}
                    ]
                }, { timeout: 18000 });
                const text = typeof data === 'string' ? data : data?.choices?.[0]?.message?.content;
                if (text && !text.includes('<!doctype') && !text.includes('<html')) return text;
                throw new Error('Pollinations URL mode failed');
            })());
        }

        // 1. Gemini AI (only if API key is explicitly configured)
        if (config.geminiApiKey) {
            promises.push((async () => {
                console.log(chalk.blue(`[Vision] Starting Gemini branch (key: ${config.geminiApiKey.substring(0,10)}...)`));
                const res = await getGeminiResponse("system", finalPrompt, buffer, mime, config.geminiApiKey);
                if (!res) throw new Error("Gemini returned null");
                console.log(chalk.green(`[Vision] Gemini succeeded!`));
                return res;
            })());
        }
        
        // 2. OpenRouter (If configured - Free Llama 3.2 Vision - No Gemini!)
        if (config.openRouterKey) {
            promises.push((async () => {
                console.log(chalk.blue(`[Vision] Starting OpenRouter branch...`));
                const res = await getOpenRouterResponse("system", finalPrompt, buffer);
                if (!res) throw new Error("OpenRouter returned null");
                console.log(chalk.green(`[Vision] OpenRouter succeeded!`));
                return res;
            })());
        }

        // 4. NoteGPT & Fallback Upload APIs
        promises.push((async () => {
            console.log(chalk.blue(`[Vision] Starting NoteGPT branch...`));
            
            // Use directUrl only if it's a publicly accessible URL (not Facebook CDN)
            let imageUrl = isPublicUrl ? directUrl : null;
            if (!imageUrl) {
                const { uploadToBestProvider } = require('./media');
                imageUrl = await uploadToBestProvider(buffer);
            }
            
            if (imageUrl) {
                console.log(chalk.cyan(`[Vision] Image URL for NoteGPT: ${imageUrl}`));
                
                // Try NoteGPT (Very reliable in tests)
                const noteRes = await getNoteGPTVision(imageUrl, getSystemPrompt(finalPrompt, true) + "\n\nUser Request: " + finalPrompt, lang);
                if (noteRes) return noteRes;

                // Branch A: Free Gemini (Siputzx)
                try {
                    const { data } = await axios.get(`https://api.siputzx.my.id/api/ai/gemini-image?prompt=${encodeURIComponent(finalPrompt)}&url=${encodeURIComponent(imageUrl)}`, { timeout: 15000 });
                    if (data?.status && data?.data) return data.data;
                } catch (e) {}

                // Branch B: Free Gemini (Ryzendesu)
                try {
                    const { data } = await axios.get(`https://api.ryzendesu.vip/api/ai/gemini-vision?text=${encodeURIComponent(finalPrompt)}&url=${encodeURIComponent(imageUrl)}`, { timeout: 15000 });
                    if (data?.success && data?.answer) return data.answer;
                } catch (e) {}
            }
            throw new Error("Upload-based vision branches failed");
        })());

        // 5. Obito RAW Buffer Vision
        promises.push(getObitoAnalyze(buffer, finalPrompt, mime));

        // 7. 🆓 HuggingFace Qwen2-VL (free, no Gemini!)
        promises.push(getHFQwenVision(buffer, finalPrompt));

        // Race them!
        const racePromise = Promise.any(promises.map((p, i) => p.then(async res => {
            if (!res || typeof res !== 'string') throw new Error("Invalid response");
            const lowerRes = res.toLowerCase();
            
            if (lowerRes.includes("<!doctype") || lowerRes.includes("<html")) throw new Error("HTML error");
            const hallucinations = [
                "أرسل الصورة", "إرسال الصورة", "مكن ترسل لي نصو", "أين الصورة", 
                "نقدر نشوفه", "لا أستطيع رؤية", "غير مرفقة", "لا تتوفر صورة", 
                "can't see", "no image", "attach an image", "provide an image",
                "not able to see", "not able to view", "unable to view", "unable to see",
                "can't view", "cannot view", "don't see", "do not see", "no picture",
                "don't have access to any image", "can't view images", "cannot see the image",
                "i'm not able to see", "i cannot see", "i can't see",
                "based on the information provided, i can see that this is a complex",
                "ما كاينش", "ما قدرتش نشوف", "ما كانشوفش", "ما شفتش", "صيفط الصورة", 
                "أرسل لي الصورة", "لا أرى أي", "لا أستطيع رؤيتها", "ما واضحاش", 
                "ما كايناش", "لا توجد صورة", "الصورة غير واضحة"
            ];
            if (hallucinations.some(h => lowerRes.includes(h.toLowerCase()))) {
                throw new Error("Model hallucinations about missing image");
            }

            // ⚠️ Language Filter: If user asked in Arabic, translate purely English responses
            const hasArabicChars = /[\u0600-\u06FF]/.test(res);
            if (lang === 'ar' && !hasArabicChars && res.length > 50) {
                console.log(chalk.yellow(`[Vision] Provider ${i} returned English for Arabic request. Translating...`));
                const translated = await translateText(res, 'ar');
                if (translated && /[\u0600-\u06FF]/.test(translated)) {
                    console.log(chalk.green(`[Vision] Provider ${i} translated successfully!`));
                    return translated.trim();
                }
                throw new Error("Language mismatch (Expected Arabic) and translation failed");
            }

            console.log(chalk.green(`[Vision] Provider ${i} succeeded!`));
            return res.trim();
        }).catch(err => {
            throw err;
        })));
        
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 28000));
        
        let reply = await Promise.race([racePromise, timeoutPromise]);
        
        if (reply) {
            reply = reply
                .replace(/^\s*\.\s*/g, '') // Remove leading dots
                .replace(/###\s*السؤال\s*\d+/gi, '')
                .replace(/###\s*الإجابة/gi, '')
                .replace(/###\s*الجواب/gi, '')
                .replace(/###\s*Question\s*\d+/gi, '')
                .replace(/###\s*Answer/gi, '')
                .replace(/###\s*Solution\s*Steps/gi, '')
                .replace(/###\s*Analysis/gi, '')
                .replace(/ماذا يوجد في هذه الصورة؟/g, '')
                .replace(/اشرح بالتفصيل/g, '')
                .trim();
        }

        return reply || "❌ عذرا، لم أتمكن من تحليل الصورة.";
    } catch (e) {
        return "❌ حدث خطأ أثناء تحليل الصورة.";
    }
}

async function transcribeAudio(buffer, mime) {
    try {
        if (config.geminiApiKey) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${config.geminiApiKey}`;
            const { data } = await axios.post(url, {
                contents: [{
                    parts: [
                        { text: "استمع إلى هذا المقطع الصوتي، ثم اكتب لي ما قيل فيه (Transcription) ولخّصه بلغة المقطع." },
                        { inline_data: { mime_type: mime, data: buffer.toString("base64") } }
                    ]
                }]
            });
            return data.candidates?.[0]?.content?.parts?.[0]?.text;
        }
        return "❌ لتحليل الصوت وتحويله إلى نص، يجب توفير مفتاح `GEMINI_API_KEY` في إعدادات السيرفر.";
    } catch (e) {
        return "❌ حدث خطأ أثناء معالجة الأوديو.";
    }
}

async function analyzeDocument(buffer, mime, prompt) {
    try {
        let textExtracted = "";
        
        if (mime === 'application/pdf') {
            const pdfData = await pdfParse(buffer);
            textExtracted = pdfData.text.slice(0, 10000); // Max 10,000 chars for free Pollinations API
        } else {
            textExtracted = buffer.toString('utf-8').slice(0, 10000);
        }
        
        if (!textExtracted.trim()) {
            return "❌ المجلد فارغ أو لم أتمكن من استخراج القراءة منه.";
        }
        
        const finalPrompt = `بناءً على هذا النص المستخرج من الملف المرفق، أجب عن طلب المستخدم. \n\nطلب المستخدم: ${prompt || 'لخص لي أهم ما جاء في هذا الملف.'}\n\nالنص المرفق:\n---\n${textExtracted}\n---`;
        
        const { data } = await axios.post("https://text.pollinations.ai/", {
            model: "openai",
            messages: [
                { role: "system", content: getSystemPrompt(finalPrompt) + "\n\nYou are an expert document analyzer. Be strictly professional." },
                { role: "user", content: finalPrompt }
            ]
        }, { timeout: 30000 });
        
        let response = typeof data === 'string' ? data : data.message;
        
        // Clean Pollinations ads if any
        response = response.replace(/\*Support Pollinations\.AI:\*[\s\S]*$/, '').trim();
        response = response.replace(/\*Ad\*[\s\S]*$/, '').trim();
        return response;
        
    } catch (e) {
        return "❌ حدث خطأ أثناء تحليل وقراءة الملف (PDF/Doc).";
    }
}

module.exports = {
    getContext,
    addToHistory,
    clearHistory,
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
    getHFQwenVision,
    getBlackboxResponse,
    getStableAIResponse,
    transcribeAudio,
    analyzeDocument,
    analyzeImage,
    detectLanguage
};
