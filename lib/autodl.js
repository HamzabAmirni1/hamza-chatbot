const axios = require('axios');
const { igdl } = require('ruhend-scraper');
const chalk = require('chalk');
const config = require('../config');
const { downloadYouTube } = require('./ytdl'); // Import robust downloader

async function handleAutoDL(sock, sender, msg, body, processedMessages, helpers) {
    const { sendFBVideo, sendYTVideo } = helpers;

    const fbRegex = /(https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch|fb\.com)\/[^\s]+)/i;
    const igRegex = /(https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/[^\s]+)/i;
    const ytRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+)/i;

    const fbMatch = body.match(fbRegex);
    const igMatch = body.match(igRegex);
    const ytMatch = body.match(ytRegex);

    if (fbMatch || igMatch || ytMatch) {
        if (processedMessages.has(msg.key.id)) return true;

        processedMessages.add(msg.key.id);
        setTimeout(() => processedMessages.delete(msg.key.id), 5 * 60 * 1000);

        await sock.sendMessage(sender, { react: { text: "🔄", key: msg.key } });

        if (fbMatch) {
            const fbUrl = fbMatch[0];
            console.log(chalk.cyan(`📥 Auto-Downloading FB: ${fbUrl}`));
            try {
                let fbvid = null;
                const methods = [
                    async () => {
                        const res = await axios.get(`https://api.siputzx.my.id/api/facebook?url=${encodeURIComponent(fbUrl)}`, { timeout: 15000 });
                        return res.data?.status && res.data.data?.url ? res.data.data.url : null;
                    },
                    async () => {
                        const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/fb?url=${encodeURIComponent(fbUrl)}`, { timeout: 15000 });
                        if (res.data?.status && res.data.result?.url) {
                            return Array.isArray(res.data.result.url) ? res.data.result.url.find(v => v.quality === "hd")?.url || res.data.result.url[0]?.url : res.data.result.url;
                        }
                        return null;
                    },
                    async () => {
                        const res = await axios.get(`https://api.hanggts.xyz/download/facebook?url=${encodeURIComponent(fbUrl)}`, { timeout: 15000 });
                        if (res.data && (res.data.status === true || res.data.result)) {
                            return res.data.result.media?.video_hd || res.data.result.media?.video_sd || res.data.result.url || res.data.result.download;
                        }
                        return null;
                    }
                ];

                for (const method of methods) {
                    try {
                        fbvid = await method();
                        if (fbvid) break;
                    } catch (e) {
                        console.log("FB Auto-DL method failed:", e.message);
                    }
                }

                if (fbvid) {
                    await sendFBVideo(sock, sender, fbvid, "Auto-DL", msg);
                }
            } catch (e) {
                console.error("FB Auto-DL Failed:", e.message);
            }
        }

        if (igMatch) {
            const igUrl = igMatch[0];
            console.log(chalk.cyan(`📥 Auto-Downloading IG: ${igUrl}`));
            try {
                const downloadData = await igdl(igUrl);
                if (downloadData?.data?.length) {
                    const mediaList = downloadData.data;
                    for (let i = 0; i < Math.min(2, mediaList.length); i++) {
                        const media = mediaList[i];
                        const mediaUrl = media.url;
                        const isVideo = media.type === "video" || /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || igUrl.includes("/reel/") || igUrl.includes("/tv/");
                        const caption = `✅ *Hamza Amirni Instagram Downloader*\n\n⚔️ ${config.botName}`;
                        if (isVideo) {
                            await sock.sendMessage(sender, { video: { url: mediaUrl }, caption, mimetype: "video/mp4" }, { quoted: msg });
                        } else {
                            await sock.sendMessage(sender, { image: { url: mediaUrl }, caption }, { quoted: msg });
                        }
                    }
                }
            } catch (e) {
                console.error("IG Auto-DL Failed:", e.message);
            }
        }

        if (ytMatch) {
            const ytUrl = ytMatch[0];
            console.log(chalk.cyan(`📥 Auto-Downloading YT: ${ytUrl}`));

            // Use revised robust downloadYouTube function
            try {
                const data = await downloadYouTube(ytUrl, 'video');
                if (data && data.download) {
                    await sendYTVideo(sock, sender, data.download, data.title || "YouTube Video", msg);
                } else {
                    console.log(chalk.red("All YT Auto-DL methods failed."));
                }
            } catch (e) {
                console.error("YT Auto-DL Error:", e.message);
            }
        }

        await sock.sendMessage(sender, { react: { text: "✅", key: msg.key } });

        const isPureLink = body.trim() === fbMatch?.[0] || body.trim() === igMatch?.[0] || body.trim() === ytMatch?.[0];
        return isPureLink;
    }
    return false;
}

module.exports = { handleAutoDL };
