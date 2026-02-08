const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function ffmpeg(buffer, args = [], ext = '', outputExt = '') {
    return new Promise((resolve, reject) => {
        try {
            const tmp = path.join(process.cwd(), 'tmp', Date.now() + '.' + ext);
            const out = tmp + '.' + outputExt;
            fs.writeFileSync(tmp, buffer);
            spawn('ffmpeg', [
                '-y',
                '-i', tmp,
                ...args,
                out
            ])
                .on('error', reject)
                .on('close', (code) => {
                    try {
                        fs.unlinkSync(tmp);
                        if (code !== 0) return reject(code);
                        const output = fs.readFileSync(out);
                        fs.unlinkSync(out);
                        resolve(output);
                    } catch (e) {
                        reject(e);
                    }
                });
        } catch (e) {
            reject(e);
        }
    });
}

function toAudio(buffer, ext) {
    return ffmpeg(buffer, [
        '-vn',
        '-ac', '2',
        '-b:a', '128k',
        '-ar', '44100',
        '-f', 'mp3'
    ], ext, 'mp3');
}

module.exports = { toAudio };
