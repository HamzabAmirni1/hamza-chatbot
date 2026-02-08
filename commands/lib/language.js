const translations = {
    'yts.usage': '⚠️ *الطريقة الصحيحة:*\n{prefix}yts [اسم الفيديو]',
    'yts.no_result': '❌ *ما لقيت حتى نتيجة.*',
    'yts.library_title': '📺 *YouTube Search*',
    'yts.results_for': 'Results for: *{query}*',
    'yts.video_btn': 'Download Video 🎥',
    'yts.audio_btn': 'Download Audio 🎵',
    'common.error': '❌ حدث خطأ ما.'
};

function t(key, vars = {}, lang = 'ar') {
    let str = translations[key] || key;
    for (let v in vars) {
        str = str.replace(`{${v}}`, vars[v]);
    }
    return str;
}

module.exports = { t };
