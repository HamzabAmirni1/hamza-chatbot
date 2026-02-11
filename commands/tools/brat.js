const fs = require('fs-extra');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');
const Jimp = require('jimp');
const { execSync } = require('child_process');

async function renderTextToBuffer(text, options = {}) {
    const width = 512;
    const height = 512;
    const margin = 20;
    const wordSpacing = 25;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = options.background || "white";
    ctx.fillRect(0, 0, width, height);
    let fontSize = 150;
    const lineHeightMultiplier = 1.3;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `${fontSize}px Sans-serif`;
    const words = text.split(" ");
    const datas = words.map(() => options.color || "black");
    let lines = [];
    function rebuildLines() {
        lines = [];
        let currentLine = "";
        for (let word of words) {
            if (ctx.measureText(word).width > width - 2 * margin) {
                fontSize -= 2;
                ctx.font = `${fontSize}px Sans-serif`;
                return rebuildLines();
            }
            let testLine = currentLine ? `${currentLine} ${word}` : word;
            let lineWidth =
                ctx.measureText(testLine).width +
                (currentLine.split(" ").length - 1) * wordSpacing;
            if (lineWidth < width - 2 * margin) {
                currentLine = testLine;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(currentLine);
    }
    rebuildLines();
    while (lines.length * fontSize * lineHeightMultiplier > height - 2 * margin) {
        fontSize -= 2;
        ctx.font = `${fontSize}px Sans-serif`;
        rebuildLines();
    }
    const lineHeight = fontSize * lineHeightMultiplier;
    let y = margin;
    let i = 0;
    for (let line of lines) {
        const wordsInLine = line.split(" ");
        let x = margin;
        const space =
            (width - 2 * margin - ctx.measureText(wordsInLine.join("")).width) /
            (wordsInLine.length - 1);
        for (let word of wordsInLine) {
            ctx.fillStyle = datas[i];
            ctx.fillText(word, x, y);
            x += ctx.measureText(word).width + space;
            i++;
        }
        y += lineHeight;
    }
    const buffer = canvas.toBuffer("image/png");
    if (options.blur) {
        const img = await Jimp.read(buffer);
        img.blur(options.blur);
        return await img.getBufferAsync(Jimp.MIME_PNG);
    }
    return buffer;
}

async function makeBratVideo(text, {
    output = path.join(__dirname, '..', '..', 'tmp', `brat_${Date.now()}.mp4`),
    background = "white",
    color = "black",
    blur = 1,
    speed = "normal"
} = {}) {
    const words = text.split(" ");
    const tmpDir = path.join(__dirname, '..', '..', 'tmp', `tmp_brat_${Date.now()}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const framePaths = [];
    for (let i = 0; i < words.length; i++) {
        const partial = words.slice(0, i + 1).join(" ");
        const buffer = await renderTextToBuffer(partial, { background, color, blur });
        const framePath = path.join(tmpDir, `frame_${i}.png`);
        fs.writeFileSync(framePath, buffer);
        framePaths.push(framePath);
    }
    const fileListPath = path.join(tmpDir, "filelist.txt");
    const duration = { fast: 0.4, normal: 1, slow: 1.6 }[speed] || 1;
    let fileList = "";
    framePaths.forEach(f => {
        fileList += `file '${f.replace(/\\/g, '/')}'\n`;
        fileList += `duration ${duration}\n`;
    });
    fileList += `file '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'\n`;
    fileList += `duration 2\n`;
    fs.writeFileSync(fileListPath, fileList);
    try {
        execSync(`ffmpeg -y -f concat -safe 0 -i "${fileListPath}" -vf "fps=30,format=yuv420p" "${output}"`);
    } catch (e) {
        throw "ffmpeg error: " + e.message;
    }
    return output;
}

module.exports = async (sock, chatId, msg, args) => {
    const text = args.join(" ");
    if (!text) {
        return await sock.sendMessage(chatId, { text: '📥 أرسل النص بعد الأمر.\nمثال: .brat-vd  hamza bot' }, { quoted: msg });
    }

    await sock.sendMessage(chatId, { react: { text: "⏳", key: msg.key } });
    const waitMsg = await sock.sendMessage(chatId, { text: "⏳ جاري إنشاء الفيديو... المرجو الانتظار قليلاً" }, { quoted: msg });

    try {
        const filePath = await makeBratVideo(text, {
            color: "black",
            background: "white",
            blur: 1,
            speed: "normal"
        });

        await sock.sendMessage(chatId, {
            video: { url: filePath },
            caption: '📽️ *تم إنشاء الفيديو بنجاح*',
            gifPlayback: true
        }, { quoted: msg });

        await sock.sendMessage(chatId, { delete: waitMsg.key });
        await sock.sendMessage(chatId, { react: { text: "✅", key: msg.key } });

        // Cleanup handled by tmp cleaner or system
    } catch (e) {
        console.error("Brat Error:", e);
        await sock.sendMessage(chatId, {
            edit: waitMsg.key,
            text: '❌ حدث خطأ أثناء إنشاء الفيديو:\n' + e
        });
        await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    }
};
