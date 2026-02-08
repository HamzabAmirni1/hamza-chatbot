const axios = require('axios');
const { igdl } = require('ruhend-scraper');
const chalk = require('chalk');
const config = require('../config');

async function handleAutoDL(sock, sender, msg, body, processedMessages, helpers) {
    const { sendFBVideo, sendYTVideo, getYupraVideoByUrl, getOkatsuVideoByUrl } = helpers;

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
                const apiUrl = `https://api.hanggts.xyz/download/facebook?url=${encodeURIComponent(fbUrl)}`;
                const response = await axios.get(apiUrl, { timeout: 15000 });
                let fbvid = null;
                if (response.data && (response.data.status === true || response.data.result)) {
                    fbvid = response.data.result.media?.video_hd || response.data.result.media?.video_sd || response.data.result.url || response.data.result.download;
                }
                if (fbvid) {
                    await sendFBVideo(sock, sender, fbvid, "Hanggts API", msg);
                } else {
                    const vUrl = `https://api.ryzendesu.vip/api/downloader/fb?url=${encodeURIComponent(fbUrl)}`;
                    const vRes = await axios.get(vUrl, { timeout: 15000 });
                    if (vRes.data && vRes.data.url) {
                        const vid = Array.isArray(vRes.data.url) ? vRes.data.url.find((v) => v.quality === "hd")?.url || vRes.data.url[0]?.url : vRes.data.url;
                        if (vid) await sendFBVideo(sock, sender, vid, "Ryzendesu API", msg);
                    }
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
            // 1. Try Hector Manuel API
            try {
                const apiUrl = `https://yt-dl.officialhectormanuel.workers.dev/?url=${encodeURIComponent(ytUrl)}`;
                const response = await axios.get(apiUrl, { timeout: 15000 });
                if (response.data && response.data.status) {
                    const videoTitle = response.data.title || "YouTube Video";
                    const downloadUrl = response.data.videos["360"] || response.data.videos["480"] || Object.values(response.data.videos)[0];
                    if (downloadUrl) {
                        return await sendYTVideo(sock, sender, downloadUrl, videoTitle, msg);
                    }
                }
            } catch (e) {
                console.log("Hector API failed, trying next...");
            }

            // 2. Try Vreden API
            try {
                const vredenUrl = `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(ytUrl)}`;
                const vResponse = await axios.get(vredenUrl, { timeout: 15000 });
                if (vResponse.data && vResponse.data.status) {
                    return await sendYTVideo(sock, sender, vResponse.data.result.download, vResponse.data.result.title, msg);
                }
            } catch (e) {
                console.log("Vreden API failed, trying next...");
            }

            // 3. Try Yupra API
            const yupra = await getYupraVideoByUrl(ytUrl);
            if (yupra) {
                return await sendYTVideo(sock, sender, yupra.download, yupra.title, msg);
            }

            // 4. Try Okatsu API
            const okatsu = await getOkatsuVideoByUrl(ytUrl);
            if (okatsu) {
                return await sendYTVideo(sock, sender, okatsu.download, okatsu.title, msg);
            }
        }

        await sock.sendMessage(sender, { react: { text: "✅", key: msg.key } });

        // Return true if it was just a link (to skip AI)
        const isPureLink = body.trim() === fbMatch?.[0] || body.trim() === igMatch?.[0] || body.trim() === ytMatch?.[0];
        return isPureLink;
    }
    return false;
}

module.exports = { handleAutoDL };
