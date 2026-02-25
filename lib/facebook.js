const axios = require('axios');
const config = require('../config');
const { getContext, addToHistory, getAutoGPTResponse, getGeminiResponse, getLuminAIResponse, getAIDEVResponse, getPollinationsResponse, getBlackboxResponse, getStableAIResponse, getOpenRouterResponse } = require('./ai');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

// Save Facebook user to DB
function saveFbUser(senderId) {
    try {
        const dbPath = path.join(__dirname, '..', 'data', 'fb_users.json');
        fs.ensureDirSync(path.dirname(dbPath));
        let users = [];
        if (fs.existsSync(dbPath)) {
            try { users = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch (e) { users = []; }
        }
        const id = senderId.toString();
        if (!users.includes(id)) {
            users.push(id);
            fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
        }
    } catch (e) { }
}

async function sendFacebookMessage(recipientId, text) {
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${config.fbPageAccessToken}`, {
            recipient: { id: recipientId },
            message: { text: text }
        });
    } catch (error) {
        console.error(chalk.red('[Facebook] Send Error:'), error.response?.data || error.message);
    }
}

async function handleFacebookMessage(event) {
    const senderId = event.sender.id;
    const message = event.message;

    if (!message || !message.text) return;

    const text = message.text;
    console.log(chalk.cyan(`[Facebook] Message from ${senderId}: ${text}`));

    // Track Facebook user
    saveFbUser(senderId);

    try {
        const context = getContext(senderId);
        const aiPromises = [];
        if (config.geminiApiKey) aiPromises.push(getGeminiResponse(senderId, text));
        if (config.openRouterKey) aiPromises.push(getOpenRouterResponse(senderId, text));

        aiPromises.push(getLuminAIResponse(senderId, text));
        aiPromises.push(getAIDEVResponse(senderId, text));
        aiPromises.push(getPollinationsResponse(senderId, text));
        aiPromises.push(getBlackboxResponse(senderId, text));
        aiPromises.push(getStableAIResponse(senderId, text));
        aiPromises.push(getAutoGPTResponse(senderId, text));

        let reply;
        try {
            const racePromise = Promise.any(aiPromises.map(p => p.then(res => {
                if (!res) throw new Error("No response");
                return res;
            })));
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 25000));
            reply = await Promise.race([racePromise, timeoutPromise]);
        } catch (e) {
            reply = await getStableAIResponse(senderId, text) || await getBlackboxResponse(senderId, text) || "عذراً، حدث خطأ في معالجة طلبك.";
        }

        if (reply) {
            addToHistory(senderId, 'user', text);
            addToHistory(senderId, 'assistant', reply);
            await sendFacebookMessage(senderId, reply);
        }
    } catch (error) {
        console.error(chalk.red('[Facebook] Error:'), error.message);
    }
}

module.exports = { handleFacebookMessage, sendFacebookMessage };

