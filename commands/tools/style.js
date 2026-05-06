const styles = {
    1: (t) => t.split('').map(c => "𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃"["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c)] || c).join(''),
    2: (t) => t.split('').map(c => "𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕊𝕋𝕌𝕎𝕏𝕐ℤ𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫"["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c)] || c).join(''),
    3: (t) => t.split('').map(c => "ᗩᗷᑕᗪEᖴGᕼIᒍKᒪᗰᑎOᑭᑫᖇᔕTᑌᐯᗯ᙭Yᘔabcdefghijklmnopqrstuvwxyz"["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c)] || c).join(''),
    4: (t) => t.split('').map(c => "ค๒с๔єŦgђเјкℓмก๏קгรtยงฬхуչค๒с๔єŦgђเјкℓмก๏קгรtยงฬхуչ"["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c)] || c).join(''),
    5: (t) => t.split('').map(c => "卂乃匚刀乇下厶卄工丁长乚从𠘨口尸㔿尺丂丅凵リ山乂丫乙卂乃匚刀乇下厶卄工丁长乚从𠘨口尸㔿尺丂丅凵リ山乂丫乙"["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c)] || c).join(''),
    6: (t) => t.split('').map(c => "A̶B̶C̶D̶E̶F̶G̶H̶I̶J̶K̶L̶M̶N̶O̶P̶Q̶R̶S̶T̶U̶V̶W̶X̶Y̶Z̶a̶b̶c̶d̶e̶f̶g̶h̶i̶j̶k̶l̶m̶n̶o̶p̶q̶r̶s̶t̶u̶v̶w̶x̶y̶z̶"["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c)] || c).join(''),
    7: (t) => t.split('').map(c => "A̴B̴C̴D̴E̴F̴G̴H̴I̴J̴K̴L̴M̴N̴O̴P̴Q̴R̴S̴T̴U̴V̴W̴X̴Y̴Z̴a̴b̴c̴d̴e̴f̴g̴h̴i̴j̴k̴l̴m̴n̴o̴p̴q̴r̴s̴t̴u̴v̴w̴x̴y̴z̴"["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c)] || c).join(''),
    8: (t) => t.split('').map(c => "ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓧⓨⓩ"["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".indexOf(c)] || c).join(''),
};

module.exports = async (sock, chatId, msg, args, extra, userLang) => {
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(chatId, {
            text: `╔══════════════════╗\n║   ✨ *TEXT STYLE*   ║\n╚══════════════════╝\n\n⚠️ *يرجى كتابة نص بالإنجليزية*\n\n*مثال:*\n.style Hamza\n\n─────────────────────\n🚀 *Hamza Amirni Bot*`,
        }, { quoted: msg });
    }

    let response = `╔══════════════════╗\n║   ✨ *TEXT STYLE*   ║\n╚══════════════════╝\n\n📝 *نصك بستايلات مختلفة:*\n\n`;

    Object.keys(styles).forEach((key) => {
        response += `*${key}.* ${styles[key](text)}\n`;
    });

    response += `\n─────────────────────\n💡 اختر الستايل اللي عجبك وانسخه!\n🚀 *Hamza Amirni Bot*`;

    await sock.sendMessage(chatId, { text: response }, { quoted: msg });
    await sock.sendMessage(chatId, { react: { text: '✨', key: msg.key } });
};
