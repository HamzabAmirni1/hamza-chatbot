FROM node:20-bullseye-slim

WORKDIR /app

# Removed all apt-get installs/ffmpeg as they are not needed for text-only GPT bot
# This will make the build extremely fast and fix the timeout/failure.

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "start"]
