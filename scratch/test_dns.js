const dns = require('dns');

const domains = [
    'google.com',
    'github.com',
    'text.pollinations.ai',
    'chat.typegpt.net',
    'api.vreden.my.id',
    'luminai.my.id',
    'all-in-1-ais.officialhectormanuel.workers.dev'
];

function testDns() {
    domains.forEach(d => {
        dns.lookup(d, (err, address, family) => {
            if (err) {
                console.log(`${d}: FAILED ->`, err.message);
            } else {
                console.log(`${d}: SUCCESS ->`, address);
            }
        });
    });
}

testDns();
