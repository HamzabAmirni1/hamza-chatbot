module.exports = {
    t: (key, params = {}, lang = 'en') => {
        const map = {
            'video.usage': 'Please provide a URL.',
            'download.yt_no_result': 'No results found.',
            'download.yt_invalid_url': 'Invalid URL.',
            'video.downloading': 'Downloading...',
            'video.success': 'Done.',
            'download.yt_error': 'Error downloading.',
            'play.usage': 'Usage: .play <query>',
            'play.no_results': 'No results.',
            'play.downloading_thumb': 'Searching...',
            'play.error': 'Error.'
        };
        let text = map[key] || key;
        for (let p in params) text = text.replace(`{${p}}`, params[p]);
        return text;
    }
};
