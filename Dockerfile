FROM node:20-bullseye-slim

WORKDIR /app

# Install only essential system dependencies (Removed heavy Chromium/upgrade)
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    webp && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install Node dependencies
RUN npm install

COPY . .

CMD ["npm", "start"]
