const axios = require("axios");
const crypto = require("crypto");

class MiraMuseAI {
    constructor() {
        this.baseUrl = "https://mjaiserver.erweima.ai";
        this.origin = "https://miramuseai.net";
        this.uniqueId = crypto.randomBytes(16).toString("hex");
        this.validModels = ["flux", "tamarin", "superAnime", "visiCanvas", "realistic", "oldRealistic", "anime", "3danime"];
        this.validSizes = ["1:2", "9:16", "3:4", "1:1", "4:3", "16:9", "2:1"];

        this.axios = axios.create({
            baseURL: this.baseUrl,
            headers: {
                accept: "application/json, text/plain, */*",
                "accept-language": "en-US",
                "content-type": "application/json",
                origin: this.origin,
                referer: `${this.origin}/`,
                uniqueid: this.uniqueId,
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
    }

    validate(value, list, defaultValue) {
        return list.includes(value) ? value : defaultValue;
    }

    async generate({ prompt, imageUrl, ...rest }) {
        const validatedPrompt = prompt || "";
        const validatedModel = this.validate(rest.model, this.validModels, "realistic");
        const validatedSize = this.validate(rest.size, this.validSizes, "1:1"); // Default to 1:1 for better mobile view

        const payload = {
            prompt: validatedPrompt,
            negativePrompt: rest.negativePrompt || "",
            model: validatedModel,
            size: validatedSize,
            batchSize: rest.batchSize || "1",
            imageUrl: imageUrl || "",
            rangeValue: rest.rangeValue || null
        };

        const { data } = await this.axios.post("/api/v1/generate/generateMj", payload);
        const recordId = data?.data?.replace("-", "");
        if (!recordId) throw new Error("لم يتم استلام معرف السجل (recordId) من الخادم.");

        return await this.poll(recordId);
    }

    async poll(recordId, maxAttempts = 60, interval = 3000) {
        for (let i = 0; i < maxAttempts; i++) {
            const { data } = await this.axios.get("/api/midjourneyaiGenerateRecord/getRecordDetails", {
                params: { recordId }
            });

            const state = data?.data?.picState || "unknown";

            if (state === "success") {
                const picUrl = data?.data?.picUrl ? JSON.parse(data.data.picUrl) : [];

                return {
                    result: picUrl,
                    id: data?.data?.id,
                    prompt: data?.data?.picPrompt,
                    executedPrompt: data?.data?.picPromptExecuted,
                    generateTime: data?.data?.generateTime,
                    completeTime: data?.data?.generateCompleteTime,
                    type: data?.data?.type,
                    batchSize: data?.data?.batchSize,
                    nsfwFlag: data?.data?.nsfwFlag,
                    state
                };
            }

            if (state === "failed" || state === "error") {
                throw new Error(`فشل إنشاء الصورة: ${data?.data?.failCode || "خطأ غير معروف"}`);
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }

        throw new Error("انتهت مهلة الانتظار لإنشاء الصورة.");
    }
}

module.exports = MiraMuseAI;
