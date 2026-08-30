const crypto = require('crypto');

// Helper: validate AI response
function isValidReply(txt) {
	if (!txt || typeof txt !== 'string') return false;
	const clean = txt.trim();
	if (clean.length < 3) return false;
	const bad = [
		'missing text parameter',
		'missing parameter',
		'bad request',
		'rate limit',
		'too many requests',
		'error code',
		'internal server error',
		'undefined',
		'null',
		'<html>',
		'<!doctype',
		'error',
		'not exist',
		'unexpected response',
		'invalid response',
		'404 not found',
		'no response received',
		'quota exceeded'
	];
	const lower = clean.toLowerCase();
	if (bad.some((b) => lower === b || lower.startsWith(b + ':') || lower.startsWith(b + ' '))) return false;
	if (lower.includes('based on the information provided') && lower.includes('technical question')) return false;
	return true;
}

// Built-in Gemini API keys rotation
const GEMINI_KEYS = [
	process.env.GEMINI_API_KEY,
	Buffer.from('QUl6YVN5Qy04V01Fd0V1NGcxWXB0M3BaaWw5NWswUEJrVUtWcjBz', 'base64').toString('utf-8'),
	Buffer.from('QUl6YVN5RGdDMVpwQnY3eXhMT3dLejBXYUhJM2NTaTlsUUJ2QXNZ', 'base64').toString('utf-8'),
	Buffer.from('QUl6YVN5RFJud01ZMU5GalZJSFhJU05sZnFBU040THIyckozVE9v', 'base64').toString('utf-8'),
	Buffer.from('QUl6YVN5REw5YTRDSm9icEQ4a0ttM1d3LXlBV0lvajZhbWgzMzA0', 'base64').toString('utf-8'),
	Buffer.from('QUl6YVN5Q29aZGRwSXk5TFU1Vm9uTUc1djYwRl8zaE5KeUpja3JR', 'base64').toString('utf-8')
].filter(Boolean);

const HAMZA_SYSTEM_PROMPT = `You are a smart, helpful AI assistant named *Bot Amirni Hamza* (بوت حمزة اعمرني), created by the Moroccan developer *Hamza Amirni* (حمزة اعمرني).

LANGUAGE RULES:
• English → Respond 100% in English. Name: *Bot Amirni Hamza*. NO Arabic script.
• French → Respond 100% in French. Name: *Bot Amirni Hamza*. NO Arabic script.
• Moroccan Darija → Respond in Darija. Name: *بوت حمزة اعمرني*.
• Standard Arabic → Respond in Arabic. Name: *بوت حمزة اعمرني*.

DEVELOPER IDENTITY:
If asked about who made you or who the developer is or "من أنا" / "شكون مطور":
Praise the Moroccan developer **Hamza Amirni** (حمزة اعمرني) 🇲🇦 as an exceptional programmer and AI expert.
Official links to share:
👑 المطور: حمزة اعمرني
📸 إنستغرام: https://instagram.com/hamza_amirni_01
📢 قناة الواتساب: https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p

COMMAND FORMATTING RULES (STRICT):
• Whenever listing commands or suggesting features, ALWAYS put each command on its own separate line starting with an arrow '←' followed by a space, the dot and command name, a colon ':', and the description. Example:
← .menu : لعرض القائمة الشاملة لجميع الأوامر
← .apkm : لتحميل الألعاب والتطبيقات المهكرة من TraidMode
← .play : لتشغيل وتحميل الأغاني والصوتيات MP3
← .ytdl : لتحميل الفيديو من يوتيوب MP4
← .ig : لتحميل الصور والفيديوهات من إنستغرام
← .tiktok : لتحميل فيديوهات تيك توك بدون علامة مائية
← .fb : لتحميل مقاطع الفيديو من فيسبوك
← .ai : للدردشة وسؤال الذكاء الاصطناعي
← .gen : لرسم وتوليد الصور بالذكاء الاصطناعي
← .salat : لمعرفة أوقات الصلاة الدقيقة
← .quran : لقراءة وتصفح سور القرآن الكريم
← .quranmp3 : للاستماع للقرآن بأصوات القراء
← .tafsir : لتفسير سور وآيات القرآن الكريم
← .ad3iya : للأدعية والأذكار اليومية
← .sticker : لتحويل الصور إلى ملصقات
← .toimg : لتحويل الملصق إلى صورة عادية
← .weather : لمعرفة أحوال الطقس
← .ping : لقياس سرعة واستجابة البوت
← .tempmail : للحصول على بريد إلكتروني وهمي ومؤقت
← .tempnum : للحصول على أرقام وهمية للتفعيل
← .msgtodev : لإرسال رسالة مباشرة للمطور حمزة اعمرني

• NEVER use Markdown hyperlinks like [text](url). ALWAYS output plain URLs like https://instagram.com/hamza_amirni_01
• Use *bold* for titles, _italic_ for notes, emojis to make replies engaging.
• NEVER mention ChatGPT or OpenAI.`;

/**
 * 1. Gemini Web Scraper (RPC endpoint - Keyless & Unlimited)
 * Ported from BardChatUi & BardFrontendService StreamGenerate
 */
async function askGeminiWeb(prompt, systemPrompt = HAMZA_SYSTEM_PROMPT, timeoutMs = 10000) {
	const ctrl = new AbortController();
	const tid = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const fullPrompt = systemPrompt ? `${systemPrompt}\n\nسؤال المستخدم: ${prompt}` : prompt;

		// Step 1: Session init cookie
		const initHeaders = {
			'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
			'user-agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
		};
		const initRes = await fetch(
			'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c',
			{
				method: 'POST',
				headers: initHeaders,
				body: 'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&',
				signal: ctrl.signal
			}
		);
		const cookie = (initRes.headers.get('set-cookie') || '').split(';')[0];

		// Step 2: StreamGenerate RPC
		const b = [[fullPrompt], ['en-US'], null];
		const a = [null, JSON.stringify(b)];
		const body = new URLSearchParams({ 'f.req': JSON.stringify(a) }).toString();

		const genRes = await fetch(
			'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c',
			{
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
					'x-goog-ext-525001261-jspb': '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]',
					cookie: cookie,
					'user-agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
				},
				body: body,
				signal: ctrl.signal
			}
		);
		clearTimeout(tid);

		if (!genRes.ok) throw new Error(`Gemini Web HTTP ${genRes.status}`);
		const text = await genRes.text();
		const chunks = [...text.matchAll(/^\d+\n(.+?)\n/gm)].map((m) => m[1]);
		for (const chunk of chunks.reverse()) {
			try {
				const realArr = JSON.parse(chunk);
				const parse1 = JSON.parse(realArr[0][2]);
				if (parse1 && parse1.length > 4 && parse1[4] && parse1[4].length > 0) {
					const textVal = parse1[4][0][1][0];
					if (isValidReply(textVal)) {
						return textVal.trim();
					}
				}
			} catch (_) {}
		}
		throw new Error('Gemini Web response parsing failed');
	} finally {
		clearTimeout(tid);
	}
}

/**
 * 2. Gemini Official Generative Language API with Key & Model Rotation
 */
async function askGeminiOfficial(prompt, systemPrompt = HAMZA_SYSTEM_PROMPT, history = [], timeoutMs = 8000) {
	const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
	for (const key of GEMINI_KEYS) {
		for (const model of models) {
			const ctrl = new AbortController();
			const tid = setTimeout(() => ctrl.abort(), timeoutMs);
			try {
				const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
				const contents = [];
				if (Array.isArray(history) && history.length > 0) {
					for (const msg of history.slice(-6)) {
						contents.push({
							role: msg.role === 'assistant' ? 'model' : 'user',
							parts: [{ text: msg.content }]
						});
					}
				}
				contents.push({
					role: 'user',
					parts: [{ text: prompt }]
				});

				const bodyPayload = {
					contents,
					generationConfig: {
						temperature: 0.8,
						maxOutputTokens: 1024
					}
				};
				if (systemPrompt) {
					bodyPayload.system_instruction = {
						parts: [{ text: systemPrompt }]
					};
				}

				const res = await fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(bodyPayload),
					signal: ctrl.signal
				});
				clearTimeout(tid);
				if (res.ok) {
					const data = await res.json();
					const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
					if (isValidReply(txt)) {
						return txt.trim();
					}
				}
			} catch (_) {
				clearTimeout(tid);
			}
		}
	}
	throw new Error('Gemini Official API failed on all keys');
}

/**
 * 3. DuckDuckGo DuckChat (GPT-4o-mini, Fast Backup)
 */
async function askDuckDuckGo(prompt, systemPrompt = HAMZA_SYSTEM_PROMPT, timeoutMs = 7000) {
	const ctrl = new AbortController();
	const tid = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const statusRes = await fetch('https://duckduckgo.com/duckchat/v1/status', {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
				'x-vqd-accept': '1'
			},
			signal: ctrl.signal
		});
		const vqd = statusRes.headers.get('x-vqd-4');
		if (!vqd) throw new Error('No VQD token');

		const fullMsg = systemPrompt ? `${systemPrompt}\n\nسؤال المستخدم: ${prompt}` : prompt;
		const chatRes = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
			method: 'POST',
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
				'Content-Type': 'application/json',
				'x-vqd-4': vqd
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [{ role: 'user', content: fullMsg }]
			}),
			signal: ctrl.signal
		});
		clearTimeout(tid);
		if (!chatRes.ok) throw new Error('DuckChat HTTP error');
		const raw = await chatRes.text();
		let text = '';
		for (const line of raw.split('\n')) {
			if (line.startsWith('data: ') && !line.includes('[DONE]')) {
				try {
					const json = JSON.parse(line.slice(6));
					if (json.message) text += json.message;
				} catch (_) {}
			}
		}
		if (isValidReply(text)) return text.trim();
		throw new Error('Invalid DuckChat reply');
	} finally {
		clearTimeout(tid);
	}
}

/**
 * 4. Airforce API (GPT-4o-mini)
 */
async function askAirforce(prompt, systemPrompt = HAMZA_SYSTEM_PROMPT, history = [], timeoutMs = 6000) {
	const ctrl = new AbortController();
	const tid = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch('https://api.airforce/v1/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: systemPrompt },
					...(Array.isArray(history) ? history.slice(-6) : []),
					{ role: 'user', content: prompt }
				],
				temperature: 0.8,
				max_tokens: 500
			}),
			signal: ctrl.signal
		});
		clearTimeout(tid);
		if (!res.ok) throw new Error('Airforce error');
		const data = await res.json();
		const txt = data?.choices?.[0]?.message?.content;
		if (isValidReply(txt)) return txt.trim();
		throw new Error('Invalid Airforce reply');
	} finally {
		clearTimeout(tid);
	}
}

/**
 * 5. Nowtech AI
 */
async function askNowtech(prompt, systemPrompt = HAMZA_SYSTEM_PROMPT, timeoutMs = 7000) {
	const ctrl = new AbortController();
	const tid = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const ts = Date.now().toString();
		const secretKey =
			'dfaugf098ad0g98-idfaugf098ad0g98-iduoafiunoa-f09a8s098a09ea-a0s8g-asd8g0a9d--gasdga8d0g8a0dg80a9sd8g0a9d8gduoafiunoa-f09adfaugf098ad0g98-iduoafiunoa-f09a8s098a09ea-a0s8g-asd8g0a9d--gasdga8d0g8a0dg80a9sd8g0a9d8g8s098a09ea-a0s8g-asd8g0a9d--gasdga8d0g8a0dg80a9sd8g0a9d8g';
		const key = crypto.createHmac('sha512', secretKey).update(ts).digest('base64');
		const res = await fetch('http://aichat.nowtechai.com/now/v1/ai', {
			method: 'POST',
			headers: {
				'User-Agent': 'Ktor client',
				Connection: 'Keep-Alive',
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Key: key,
				TimeStamps: ts
			},
			body: JSON.stringify({ content: `${systemPrompt}\n\nالمستخدم قال: ${prompt}` }),
			signal: ctrl.signal
		});
		clearTimeout(tid);
		if (!res.ok) throw new Error('Nowtech error');
		const raw = await res.text();
		let result = '';
		for (const line of raw.split('\n')) {
			if (line.startsWith('data: ') && line !== 'data: [DONE]') {
				try {
					const json = JSON.parse(line.replace('data: ', ''));
					const content = json?.choices?.[0]?.delta?.content;
					if (content) result += content;
				} catch (_) {}
			}
		}
		if (isValidReply(result)) return result.trim();
		throw new Error('Invalid Nowtech reply');
	} finally {
		clearTimeout(tid);
	}
}

/**
 * 6. Pollinations AI POST
 */
async function askPollinations(prompt, systemPrompt = HAMZA_SYSTEM_PROMPT, history = [], timeoutMs = 8000) {
	const ctrl = new AbortController();
	const tid = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch('https://text.pollinations.ai/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
			body: JSON.stringify({
				messages: [
					{ role: 'system', content: systemPrompt },
					...(Array.isArray(history) ? history.slice(-4) : []),
					{ role: 'user', content: prompt }
				],
				model: 'openai',
				seed: Math.floor(Math.random() * 999999),
				temperature: 0.85
			}),
			signal: ctrl.signal
		});
		clearTimeout(tid);
		if (!res.ok) throw new Error('Pollinations POST error');
		const txt = await res.text();
		if (isValidReply(txt)) return txt.trim();
		throw new Error('Invalid Pollinations reply');
	} finally {
		clearTimeout(tid);
	}
}

/**
 * Master Multi-Tier AI Resolver:
 * Prioritizes Google Gemini Web & Gemini API with ultra-fast parallel racing
 */
async function getSmartAIReply(prompt, options = {}) {
	const { systemPrompt = HAMZA_SYSTEM_PROMPT, history = [] } = options;

	// Primary Race: Gemini Web + Gemini Official + DuckDuckGo
	try {
		const result = await Promise.any([
			askGeminiWeb(prompt, systemPrompt, 9000).then((r) => {
				console.log('🤖 [AI Engine] Winner: Google Gemini Web RPC');
				return r;
			}),
			askGeminiOfficial(prompt, systemPrompt, history, 8000).then((r) => {
				console.log('🤖 [AI Engine] Winner: Google Gemini Generative API');
				return r;
			}),
			askDuckDuckGo(prompt, systemPrompt, 7000).then((r) => {
				console.log('🤖 [AI Engine] Winner: DuckDuckGo GPT-4o-mini');
				return r;
			})
		]);
		if (isValidReply(result)) return result;
	} catch (_) {}

	// Secondary Fallback Race: Airforce + Nowtech + Pollinations
	try {
		const result = await Promise.any([
			askAirforce(prompt, systemPrompt, history, 6000).then((r) => {
				console.log('🤖 [AI Engine] Winner: Airforce Backup');
				return r;
			}),
			askNowtech(prompt, systemPrompt, 6000).then((r) => {
				console.log('🤖 [AI Engine] Winner: Nowtech Backup');
				return r;
			}),
			askPollinations(prompt, systemPrompt, history, 7000).then((r) => {
				console.log('🤖 [AI Engine] Winner: Pollinations Backup');
				return r;
			})
		]);
		if (isValidReply(result)) return result;
	} catch (_) {}

	return null;
}

module.exports = {
	askGeminiWeb,
	askGeminiOfficial,
	askDuckDuckGo,
	askAirforce,
	askNowtech,
	askPollinations,
	getSmartAIReply,
	isValidReply,
	HAMZA_SYSTEM_PROMPT
};

