const settings = {
    packname: 'حمزة اعمرني',
    author: 'حمزة اعمرني',
    botName: "حمزة اعمرني",
    botOwner: 'حمزة اعمرني',
    timezone: 'Africa/Casablanca',
    prefix: '.',
    ownerNumber: ['212624855939', '76704223654068', '72375181807785', '218859369943283'],
    // Phone number used for WhatsApp pairing code (country code + number, without '+', e.g. 2126xxxxxxx)
    pairingNumber: '212684051093',
    newsletterJid: '120363367937224887@newsletter',
    newsletterName: 'حمزة اعمرني',

    // Social Links
    officialChannel: "https://whatsapp.com/channel/0029ValXRoHCnA7yKopcrn1p",
    instagram: 'https://instagram.com/hamza_amirni_01',
    instagram2: 'https://instagram.com/hamza_amirni_02',
    instagramChannel: 'https://www.instagram.com/channel/AbbqrMVbExH_EZLD/',
    facebook: 'https://www.facebook.com/6kqzuj3y4e',
    facebookPage: 'https://www.facebook.com/profile.php?id=61564527797752',
    youtube: 'https://www.youtube.com/@Hamzaamirni01',
    telegram: 'https://t.me/hamzaamirni',
    waGroups: 'https://chat.whatsapp.com/DDb3fGPuZPB1flLc1BV9gJ',
    portfolio: 'https://hamzaamirni.netlify.app',
    publicUrl: process.env.PUBLIC_URL || '', // Add your Koyeb/Render URL here to keep it awake
    botThumbnail: './media/hamza.jpg',

    // API KEYS (Set these in Koyeb Environment Variables for security!)
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    openRouterKey: process.env.OPENROUTER_API_KEY || '',

    // Internal URL management
    publicUrl: (function () {
        try {
            const path = require('path');
            const fs = require('fs');
            const urlPath = path.join(__dirname, 'server_url.json');
            if (fs.existsSync(urlPath)) {
                return JSON.parse(fs.readFileSync(urlPath)).url;
            }
        } catch (e) { }
        return process.env.PUBLIC_URL || 'https://rolling-cherianne-ham9666-c0fa34e1.koyeb.app';
    })(),

    AUTO_STATUS_REACT: 'true',
    AUTO_STATUS_REPLY: 'false',
    AUTO_STATUS_MSG: 'Status Viewed by حمزة اعمرني',

    AUTORECORD: 'false',
    AUTOTYPE: 'false',
    AUTORECORDTYPE: 'false',

    giphyApiKey: 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq',
    commandMode: "public",
    description: "This is a bot for managing group commands and automating tasks.",
    version: "2026.1.1",
    hfToken: '', // HuggingFace Token for Qwen AI
};

module.exports = settings;
