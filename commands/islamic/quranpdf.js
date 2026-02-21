/**
 * quranpdf.js → Repurposed: Now shows the Reciters Carousel for audio selection.
 * When a user clicks Audio, this command presents them with the reciters card
 * so they can pick their preferred reciter and receive the audio file.
 */
const quranMp3Command = require('./quranmp3');

module.exports = async (sock, chatId, msg, args, commands, userLang) => {
    // Simply delegate to quranmp3 which shows the reciters carousel for the given surah
    return await quranMp3Command(sock, chatId, msg, args, commands, userLang);
};
