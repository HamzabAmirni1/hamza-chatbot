const { analyzeImage } = require('./lib/ai');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

// Mock config if needed, but ai.js already requires it.
// We just need to ensure we have a valid buffer.

async function test() {
    const testImageUrl = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500";
    try {
        console.log(chalk.cyan("Downloading test image..."));
        const { data } = await axios.get(testImageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(data);
        const mime = "image/jpeg";
        const prompt = "What is this image? Describe it in Arabic.";

        console.log(chalk.cyan("Calling analyzeImage..."));
        const start = Date.now();
        const result = await analyzeImage(buffer, mime, prompt);
        const end = Date.now();

        console.log(chalk.green(`\n--- Result (${(end - start) / 1000}s) ---`));
        console.log(result);
        console.log(chalk.green("------------------------\n"));

    } catch (e) {
        console.error(chalk.red("Test failed:"), e.message);
    }
}

test();
