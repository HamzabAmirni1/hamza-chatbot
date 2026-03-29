const axios = require('axios');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);

/**
 * Robust Aptoide Downloader Utility
 */
const aptoide = {
    /**
     * Search for apps on Aptoide
     * @param {string} query 
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    search: async function (query, limit = 10) {
        try {
            // Define all search providers
            const providers = [
                // Aptoide Official
                async () => {
                    const res = await axios.get(`https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(query)}&limit=${limit}`, { timeout: 8000 });
                    return (res.data?.datalist?.list || []).map(app => ({
                        name: app.name,
                        package: app.package,
                        size: app.size,
                        sizeMB: (app.size / (1024 * 1024)).toFixed(2),
                        version: app.file?.vername || 'N/A',
                        downloads: app.stats?.downloads || 0,
                        icon: app.icon,
                        downloadUrl: app.file?.path_alt || app.file?.path,
                        updated: app.updated,
                        source: 'Aptoide'
                    }));
                },
                // Siputzx
                async () => {
                    const res = await axios.get(`https://api.siputzx.my.id/api/apk/search?q=${encodeURIComponent(query)}`, { timeout: 8000 });
                    return (res.data?.data || []).map(app => ({
                        name: app.name,
                        package: app.id || app.package || 'Siputzx',
                        size: 0, sizeMB: 'N/A', version: 'Latest', downloads: 'N/A',
                        icon: app.icon, downloadUrl: app.url, updated: 'N/A', source: 'Siputzx'
                    }));
                },
                // David Cyril
                async () => {
                    const res = await axios.get(`https://api.davidcyriltech.my.id/apk/search?query=${encodeURIComponent(query)}`, { timeout: 8000 });
                    return (res.data?.result || []).map(app => ({
                        name: app.name,
                        package: app.id || app.package || 'DavidCyril',
                        size: 0, sizeMB: 'N/A', version: 'Latest', downloads: 'N/A',
                        icon: app.icon, downloadUrl: app.url, updated: 'N/A', source: 'DavidCyril'
                    }));
                },
                // Shizune
                async () => {
                    const res = await axios.get(`https://api.shizune.tech/api/apk/search?q=${encodeURIComponent(query)}`, { timeout: 8000 });
                    return (res.data?.data || []).map(app => ({
                        name: app.name,
                        package: app.id || app.package || 'Shizune',
                        size: 0, sizeMB: 'N/A', version: 'Latest', downloads: 'N/A',
                        icon: app.icon, downloadUrl: app.url, updated: 'N/A', source: 'Shizune'
                    }));
                },
                // Guru
                async () => {
                    const res = await axios.get(`https://api.guruapi.tech/apk/search?query=${encodeURIComponent(query)}`, { timeout: 8000 });
                    return (res.data?.result || []).map(app => ({
                        name: app.name,
                        package: app.id || app.package || 'Guru',
                        size: 0, sizeMB: 'N/A', version: 'N/A', downloads: 'N/A',
                        icon: app.icon, downloadUrl: app.url, updated: 'N/A', source: 'Guru'
                    }));
                }
            ];

            // Run searches in parallel
            const resultsArray = await Promise.allSettled(providers.map(p => p()));

            // Flatten and filter results
            let allResults = [];
            resultsArray.forEach(p => {
                if (p.status === 'fulfilled' && Array.isArray(p.value)) {
                    p.value.forEach(app => {
                        if (!allResults.some(r => r.name.toLowerCase() === app.name.toLowerCase() || (r.package !== 'Direct Download' && r.package === app.package))) {
                            allResults.push(app);
                        }
                    });
                }
            });

            return allResults.slice(0, limit * 2);

        } catch (error) {
            console.error('[Aptoide Utility] Parallel Search failed:', error.message);
            return [];
        }
    },

    /**
     * Get direct download info for a package or app name
     * @param {string} id Package name or app name
     */
    downloadInfo: async function (id) {
        try {
            // If it's an Uptodown URL, try to extract package or name
            if (id.includes('uptodown.com')) {
                const pkg = await this.getPkgFromUptodown(id);
                if (pkg) id = pkg;
                else {
                    // Extract slug as fallback
                    const url = new URL(id);
                    id = url.hostname.split('.')[0];
                    if (id === 'www' || id.length < 3) {
                        id = url.pathname.split('/').filter(p => p && p !== 'android').pop();
                    }
                }
            }

            // Search specifically for the ID/Name
            const apps = await this.search(id, 1);
            if (apps.length > 0) return apps[0];
            return null;
        } catch (error) {
            console.error('[Aptoide Utility] Download Info failed:', error.message);
            return null;
        }
    },

    /**
     * Extract package name from Uptodown URL
     * @param {string} url 
     */
    getPkgFromUptodown: async function (url) {
        try {
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
            // Look for package name in HTML (common patterns)
            const pkgMatch = res.data.match(/package["']?\s*:\s*["']([^"']+)["']/i) ||
                res.data.match(/data-package=["']([^"']+)["']/i) ||
                res.data.match(/id=([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)/i);

            if (pkgMatch) return pkgMatch[1];

            // Try to find it in technical details section if regex above failed
            const technicalMatch = res.data.match(/<td>Package<\/td>\s*<td>([^<]+)<\/td>/i);
            if (technicalMatch) return technicalMatch[1].trim();

            return null;
        } catch (e) {
            console.log('[Aptoide Utility] Uptodown Pkg Extract failed:', e.message);
            return null;
        }
    },

    /**
     * Get metadata for a generic URL
     * @param {string} url 
     */
    getLinkInfo: async function (url) {
        try {
            const head = await axios.head(url, { timeout: 10000 }).catch(() => null);
            if (!head) return null;

            const size = parseInt(head.headers['content-length'] || 0);
            const mime = head.headers['content-type'];

            // Try to get filename from Content-Disposition
            let name = 'App';
            const disposition = head.headers['content-disposition'];
            if (disposition && disposition.includes('filename=')) {
                name = disposition.split('filename=')[1].replace(/['"]/g, '').trim();
            } else {
                // Get from URL
                const pathname = new URL(url).pathname;
                name = path.basename(pathname) || 'App.apk';
            }

            if (!name.toLowerCase().endsWith('.apk')) name += '.apk';

            return {
                name: name.replace('.apk', ''),
                package: 'Direct Download',
                size: size,
                sizeMB: (size / (1024 * 1024)).toFixed(2),
                version: 'Latest',
                downloads: 'N/A',
                icon: null,
                downloadUrl: url,
                updated: new Date().toLocaleDateString(),
                source: 'Direct Link',
                mime: mime
            };
        } catch (e) {
            console.log('[Aptoide Utility] Link Info failed:', e.message);
            return null;
        }
    },

    /**
     * Stream download to a temp file
     * @param {string} url 
     * @param {number} maxSize Default 300MB
     */
    downloadToFile: async function (url, maxSize = 300 * 1024 * 1024) {
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const filePath = path.join(tempDir, `apk_${Date.now()}.apk`);

        try {
            const head = await axios.head(url, { timeout: 15000 }).catch(() => null);
            const size = head ? parseInt(head.headers['content-length'] || 0) : 0;

            if (size > maxSize) {
                throw new Error(`File too large: ${(size / 1024 / 1024).toFixed(2)}MB`);
            }

            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                timeout: 600000 // 10 mins
            });

            const writer = fs.createWriteStream(filePath);
            await pipeline(response.data, writer);

            return filePath;
        } catch (error) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            throw error;
        }
    }
};

module.exports = aptoide;
