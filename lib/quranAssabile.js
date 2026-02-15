const axios = require('axios');

const QuranAssabile = {
    async list() {
        try {
            // Using Sudais as default for the list, can be parameterized later
            let res = await axios.get('https://www.assabile.com/ajax/loadplayer-12-9');
            if (!res.data || !res.data.Recitation) throw new Error('Invalid data format');
            return res.data.Recitation;
        } catch (error) {
            console.error('Error while fetching the murottal list:', error.message);
            return [];
        }
    },
    async search(q) {
        let list = await this.list();
        if (list.length === 0) return [];

        if (typeof q === 'number' || !isNaN(q)) {
            const num = parseInt(q);
            return [list[num - 1]];
        }

        const normalizedQ = q.toLowerCase().replace(/\W/g, '');
        return list.filter(_ =>
            _.span_name.toLowerCase().replace(/\W/g, '').includes(normalizedQ)
        );
    },
    async audio(d) {
        try {
            if (!d || !d.href) throw new Error('Data does not contain href');
            let res = await axios.get(`https://www.assabile.com/ajax/getrcita-link-${d.href.slice(1)}`, {
                headers: {
                    'authority': 'www.assabile.com',
                    'accept': '*/*',
                    'referer': 'https://www.assabile.com/abdul-rahman-al-sudais-12/abdul-rahman-al-sudais.htm',
                    'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132"',
                    'sec-ch-ua-mobile': '?1',
                    'sec-ch-ua-platform': '"Android"',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
                    'x-requested-with': 'XMLHttpRequest'
                },
                decompress: true
            });

            if (!res.data) throw new Error('Failed to fetch audio');
            return res.data; // This is the final mp3 link
        } catch (error) {
            console.error('Error while fetching audio:', error.message);
            return null;
        }
    }
};

module.exports = QuranAssabile;
