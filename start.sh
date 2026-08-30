#!/bin/bash

# Hamza Chatbot - Auto-Restart Script for Koyeb
# This script ensures the bot keeps running 24/7

echo "🚀 Starting Hamza Chatbot with Auto-Restart..."

while true; do
    echo "▶️ Bot starting at $(date)"
    
    # Run the bot
    node --max-old-space-size=256 index.js
    
    # If bot crashes, wait 5 seconds then restart
    EXIT_CODE=$?
    echo "⚠️ Bot stopped with exit code: $EXIT_CODE at $(date)"
    echo "🔄 Restarting in 5 seconds..."
    sleep 5
done
