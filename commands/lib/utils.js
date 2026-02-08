const fs = require('fs-extra');
const path = require('path');
const config = require('../../config');

/**
 * Sends a message with an interactive "Channel" button/header.
 * @param {object} sock - Baileys socket
 * @param {string} jid - Recipient JID
 * @param {string} text - Message text
 * @param {object} quoted - Quoted message object
 */
async function sendWithChannelButton(sock, jid, text, quoted) {
    const imagePath = path.join(__dirname, "..", "..", "media", "hamza.jpg");
    let contextInfo = {};
    if (fs.existsSync(imagePath)) {
        contextInfo = {
            externalAdReply: {
                title: "Hamza Amirni Info",
                body: "Developed by Hamza Amirni",
                thumbnail: fs.readFileSync(imagePath),
                sourceUrl: config.officialChannel,
                mediaType: 1,
                renderLargerThumbnail: true,
            },
        };
    }
    await sock.sendMessage(jid, { text, contextInfo }, { quoted });
}

module.exports = {
    sendWithChannelButton,
};
