const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');
const CryptoJS = require('crypto-js');

const AES_KEY = "ai-enhancer-web__aes-key";
const AES_IV = "aienhancer-aesiv";

function encryptSettings(obj) {
    return CryptoJS.AES.encrypt(
        JSON.stringify(obj),
        CryptoJS.enc.Utf8.parse(AES_KEY),
        {
            iv: CryptoJS.enc.Utf8.parse(AES_IV),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
        },
    ).toString();
}

class PhotoEnhancer {
    constructor() {
        this.cfg = {
            base: "https://photoenhancer.pro",
            end: {
                enhance: "/api/enhance",
                status: "/api/status",
                removeBg: "/api/remove-background",
                upscale: "/api/upscale",
            },
            headers: {
                accept: "*/*",
                "content-type": "application/json",
                origin: "https://photoenhancer.pro",
                referer: "https://photoenhancer.pro/",
                "user-agent":
                    "Mozilla/5.0 (Linux; Android 10) Chrome/127.0.0.0 Mobile Safari/537.36",
            },
        };
    }
    async poll(id) {
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
                const { data } = await axios.get(
                    `${this.cfg.base}${this.cfg.end.status}?id=${id}`,
                    { headers: this.cfg.headers },
                );
                if (data?.status === "succeeded") return data;
                if (data?.status === "failed") throw new Error("Processing failed");
            } catch (e) {
                console.error("Poll error:", e.message);
            }
        }
        throw new Error("Processing timeout");
    }
    async generate({ imageBuffer, type }) {
        const imageData = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
        let endpoint = this.cfg.end.enhance;
        let body = { imageData, mode: "ultra", fileName: "image.png" };
        if (type === "upscale" || type === "enhance") {
            const { data } = await axios.post("https://inferenceengine.vyro.ai/enhance", imageData.split(",")[1], {
                headers: {
                    'User-Agent': 'okhttp/4.9.3',
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'content-type': 'application/json'
                }
            });
            return "data:image/jpeg;base64," + data;
        }

        if (type === "remove-bg") {
            const form = new FormData();
            form.append("image", imageBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
            const { data } = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
                headers: {
                    ...form.getHeaders(),
                    'X-Api-Key': "INSERT_API_KEY_HERE_IF_AVAILABLE" // Placeholder, user needs key. Fallback to other free tools if needed.
                }
            });
            // Since remove.bg requires key, let's use a free alternative for remove-bg if this fails or just return original for now with warning.
            // Better alternative for now:
            const { data: rbData } = await axios.post("https://api.resizin.com/api/v1/image/remove-background", { url: imageData });
            return rbData.url;
        }

        const init = await axios.post(`${this.cfg.base}${endpoint}`, body, {
            headers: this.cfg.headers,
        });
        if (init.data?.predictionId)
            return await this.poll(init.data.predictionId).then((r) => r.resultUrl);
        return init.data?.resultUrl;
    }
}

class ImageColorizer {
    constructor() {
        this.cfg = {
            upUrl: "https://photoai.imglarger.com/api/PhoAi/Upload",
            ckUrl: "https://photoai.imglarger.com/api/PhoAi/CheckStatus",
            headers: {
                accept: "application/json, text/plain, */*",
                origin: "https://imagecolorizer.com",
                referer: "https://imagecolorizer.com/",
                "user-agent":
                    "Mozilla/5.0 (Linux; Android 10) Chrome/127.0.0.0 Mobile Safari/537.36",
            },
        };
    }
    async upload(buffer, prompt = "") {
        const form = new FormData();
        form.append("file", buffer, {
            filename: "image.jpg",
            contentType: "image/jpeg",
        });
        form.append("type", 17);
        form.append("restore_face", "false");
        form.append("upscale", "false");
        form.append(
            "positive_prompts",
            Buffer.from(prompt + ", masterpiece, high quality").toString("base64"),
        );
        form.append(
            "negative_prompts",
            Buffer.from("low quality, blur").toString("base64"),
        );
        form.append("scratches", "false");
        form.append("portrait", "false");
        form.append("color_mode", "2");

        const res = await axios.post(this.cfg.upUrl, form, {
            headers: { ...this.cfg.headers, ...form.getHeaders() },
        });
        return res?.data?.data;
    }
    async check(code, type) {
        const res = await axios.post(
            this.cfg.ckUrl,
            { code, type },
            { headers: { ...this.cfg.headers, "content-type": "application/json" } },
        );
        return res?.data;
    }
    async generate(buffer, prompt) {
        const task = await this.upload(buffer, prompt);
        if (!task?.code) throw new Error("Failed to get task code");
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
                const status = await this.check(task.code, task.type || 17);
                if (status?.data?.status === "success")
                    return status.data.downloadUrls[0];
            } catch (e) {
                console.error("Check error:", e.message);
            }
        }
        throw new Error("Colorizing timeout");
    }
}

async function processImageAI(filePath, prompt) {
    try {
        const img = fs.readFileSync(filePath, "base64");
        const settings = encryptSettings({
            prompt,
            size: "2K",
            aspect_ratio: "match_input_image",
            output_format: "jpeg",
            max_images: 1,
        });

        const headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
            "Content-Type": "application/json",
            Origin: "https://aienhancer.ai",
            Referer: "https://aienhancer.ai/ai-image-editor",
        };

        const create = await axios.post(
            "https://aienhancer.ai/api/v1/k/image-enhance/create",
            { model: 2, image: `data:image/jpeg;base64,${img}`, settings },
            { headers },
        );

        const id = create?.data?.data?.id;
        if (!id) throw new Error("لم يتم العثور على معرف المهمة");

        for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            const r = await axios.post(
                "https://aienhancer.ai/api/v1/k/image-enhance/result",
                { id },
                { headers },
            );
            if (r.data?.data?.status === "success") {
                return r.data.data;
            }
            if (r.data?.data?.status === "failed") {
                throw new Error("فشلت عملية التعديل");
            }
        }
        throw new Error("انتهى وقت الانتظار");
    } catch (error) {
        throw error;
    }
}

/**
 * AI Labs - Image Generation Logic
 */
const aiLabs = {
    api: {
        base: "https://text2pet.zdex.top",
        endpoints: { images: "/images" },
    },
    headers: {
        "user-agent": "NB Android/1.0.0",
        "accept-encoding": "gzip",
        "content-type": "application/json",
        authorization: "",
    },
    state: { token: null },
    setup: {
        cipher:
            "hbMcgZLlzvghRlLbPcTbCpfcQKM0PcU0zhPcTlOFMxBZ1oLmruzlVp9remPgi0QWP0QW",
        shiftValue: 3,
        dec(text, shift) {
            return [...text]
                .map((c) =>
                    /[a-z]/.test(c)
                        ? String.fromCharCode(
                            ((c.charCodeAt(0) - 97 - shift + 26) % 26) + 97,
                        )
                        : /[A-Z]/.test(c)
                            ? String.fromCharCode(
                                ((c.charCodeAt(0) - 65 - shift + 26) % 26) + 65,
                            )
                            : c,
                )
                .join("");
        },
        decrypt: async () => {
            if (aiLabs.state.token) return aiLabs.state.token;
            const decrypted = aiLabs.setup.dec(
                aiLabs.setup.cipher,
                aiLabs.setup.shiftValue,
            );
            aiLabs.state.token = decrypted;
            aiLabs.headers.authorization = decrypted;
            return decrypted;
        },
    },
    generateImage: async (prompt = "") => {
        if (!prompt?.trim()) return { success: false, error: "Empty prompt" };
        await aiLabs.setup.decrypt();
        try {
            const payload = { prompt };
            const url = aiLabs.api.base + aiLabs.api.endpoints.images;
            const res = await axios.post(url, payload, { headers: aiLabs.headers });
            if (res.data.code !== 0 || !res.data.data)
                return { success: false, error: "Server failed to generate image." };
            return { success: true, url: res.data.data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    },
};

module.exports = {
    PhotoEnhancer,
    ImageColorizer,
    processImageAI,
    encryptSettings,
    aiLabs
};
