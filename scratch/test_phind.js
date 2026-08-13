const axios = require('axios');

async function testPhind() {
    try {
        const response = await axios.post('https://https.extension.phind.com/agent/', {
            additional_extension_context: "",
            allow_magic_buttons: true,
            is_vscode_extension: true,
            message_history: [
                { content: "You are a helpful assistant.", role: "user" },
                { content: "Hello, reply with YES or OK", role: "user" }
            ],
            requested_model: "Phind-70B",
            user_input: "Hello, reply with YES or OK"
        }, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "",
                Accept: "*/*",
                "Accept-Encoding": "Identity"
            },
            timeout: 15000
        });
        console.log('Status:', response.status);
        console.log('Response:', typeof response.data === 'string' ? response.data.substring(0, 500) : response.data);
    } catch (e) {
        console.log('Error:', e.message, e.response ? e.response.data : '');
    }
}

testPhind();
