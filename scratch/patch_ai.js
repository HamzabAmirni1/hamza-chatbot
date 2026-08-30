const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'lib', 'ai.js');
let content = fs.readFileSync(filePath, 'utf8');

const target = "// Race them!\n\n        \n        const timeoutPromise = new Promise((_, reject) =>";

const replacement = `// Race them!
        const racePromise = Promise.any(promises.map((p, i) => p.then(async res => {
            if (!res || typeof res !== 'string') throw new Error("Invalid response");
            const lowerRes = res.toLowerCase();
            
            if (lowerRes.includes("<!doctype") || lowerRes.includes("<html")) throw new Error("HTML error");
            const hallucinations = [
                "أرسل الصورة", "إرسال الصورة", "ممكن ترسل لي نصو", "أين الصورة", 
                "نقدر نشوفه", "لا أستطيع رؤية", "غير مرفقة", "لا تتوفر صورة", 
                "can't see", "no image", "attach an image", "provide an image"
            ];
            if (hallucinations.some(h => lowerRes.includes(h.toLowerCase()))) {
                throw new Error("Model hallucinations about missing image");
            }

            // ⚠️ Language Filter: If user asked in Arabic, translate purely English responses
            const hasArabicChars = /[\\u0600-\\u06FF]/.test(res);
            if (lang === 'ar' && !hasArabicChars && res.length > 50) {
                console.log(chalk.yellow(\`[Vision] Provider \${i} returned English for Arabic request. Translating...\`));
                const translated = await translateText(res, 'ar');
                if (translated && /[\\u0600-\\u06FF]/.test(translated)) {
                    console.log(chalk.green(\`[Vision] Provider \${i} translated successfully!\`));
                    return translated.trim();
                }
                throw new Error("Language mismatch (Expected Arabic) and translation failed");
            }

            console.log(chalk.green(\`[Vision] Provider \${i} succeeded!\`));
            return res.trim();
        }).catch(err => {
            throw err;
        })));
        
        const timeoutPromise = new Promise((_, reject) =>`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Successfully patched lib/ai.js!");
} else {
    // Also try normalization
    const normContent = content.replace(/\r\n/g, '\n');
    if (normContent.includes(target)) {
        const patchedNorm = normContent.replace(target, replacement);
        fs.writeFileSync(filePath, patchedNorm, 'utf8');
        console.log("Successfully patched normalized lib/ai.js!");
    } else {
        console.error("Target content still not found in lib/ai.js!");
    }
}
