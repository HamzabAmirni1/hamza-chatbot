const axios = require("axios");
const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

const base = "https://www.pinterest.com";
const search = "/resource/BaseSearchResource/get/";

const headers = {
    'accept': 'application/json, text/javascript, */*, q=0.01',
    'referer': 'https://www.pinterest.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'x-app-version': 'a9522f',
    'x-pinterest-appstate': 'active',
    'x-pinterest-pws-handler': 'www/[username]/[slug].js',
    'x-requested-with': 'XMLHttpRequest'
};

async function getCookies() {
    try {
        const response = await axios.get(base);
        const setHeaders = response.headers['set-cookie'];
        if (setHeaders) {
            const cookies = setHeaders.map(cookieString => cookieString.split(';')[0].trim()).join('; ');
            return cookies;
        }
        return null;
    } catch (error) {
        console.error("خطأ أثناء جلب الكوكيز:", error);
        return null;
    }
}

async function searchPinterest(query) {
    if (!query) {
        return { status: false, message: "يرجى إدخال كلمة بحث صحيحة!" };
    }

    try {
        const cookies = await getCookies();
        // Fallback or continue without cookies if failed, sometimes Pinterest works
        const params = {
            source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
            data: JSON.stringify({
                options: { isPrefetch: false, query, scope: "pins", bookmarks: [""], page_size: 10 },
                context: {}
            }),
            _: Date.now()
        };

        const { data } = await axios.get(`${base}${search}`, {
            headers: {
                ...headers,
                'cookie': cookies || ''
            },
            params
        });

        const results = data.resource_response?.data?.results?.filter(v => v.images?.orig);
        if (!results || results.length === 0) {
            return { status: false, message: `لم يتم العثور على نتائج لكلمة البحث: ${query}` };
        }

        return {
            status: true,
            pins: results.map(result => ({
                id: result.id,
                title: result.title || "بدون عنوان",
                description: result.description || "بدون وصف",
                pin_url: `https://pinterest.com/pin/${result.id}`,
                image: result.images.orig.url,
                uploader: {
                    username: result.pinner?.username || "unknown",
                    full_name: result.pinner?.full_name || "Unknown",
                    profile_url: result.pinner ? `https://pinterest.com/${result.pinner.username}` : "#"
                }
            }))
        };

    } catch (error) {
        console.error('Pinterest Search Error:', error);
        return { status: false, message: "حدث خطأ أثناء البحث، حاول مرة أخرى لاحقًا." };
    }
}

async function pinterestCommand(sock, chatId, msg, args, commands, userLang, match) {
    const query = match || args.join(' ');
    if (!query) {
        return sock.sendMessage(chatId, { text: `• *Example:*\n .pinterest cat` }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { text: '*_`جاري التحميل`_*' }, { quoted: msg });

    try {
        async function createImage(url) {
            const { imageMessage } = await generateWAMessageContent({
                image: { url }
            }, {
                upload: sock.waUploadToServer
            });
            return imageMessage;
        }

        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        }

        let result = await searchPinterest(query);
        if (!result.status) {
            return sock.sendMessage(chatId, { text: `⚠️ ${result.message}` }, { quoted: msg });
        }

        let pins = result.pins.slice(0, 5); // Reduced to 5 for better performance/reliability
        shuffleArray(pins);

        let push = [];
        let i = 1;
        for (let pin of pins) {
            let imageUrl = pin.image;
            push.push({
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `📌 *العنوان:* ${pin.title}\n📝 *الوصف:* ${pin.description}\n👤 *الناشر:* ${pin.uploader.full_name} (@${pin.uploader.username})\n🔗 *الرابط:* ${pin.pin_url}`
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: `الصورة ${i++}`,
                    hasMediaAttachment: true,
                    imageMessage: await createImage(imageUrl)
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [
                        {
                            "name": "cta_url",
                            "buttonParamsJson": `{"display_text":"عرض على Pinterest","url":"${pin.pin_url}"}`
                        }
                    ]
                })
            });
        }

        const bot = generateWAMessageFromContent(chatId, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `نتائج البحث عن: ${query}`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: '🤖 Hamza Bot'
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            hasMediaAttachment: false
                        }),
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                            cards: [...push]
                        })
                    })
                }
            }
        }, {});

        await sock.relayMessage(chatId, bot.message, { messageId: bot.key.id });

    } catch (err) {
        console.error('Pinterest command error:', err);
        await sock.sendMessage(chatId, { text: "❌ حدث خطأ أثناء عرض النتائج." }, { quoted: msg });
    }
}

module.exports = pinterestCommand;
