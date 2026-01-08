FROM node:20-bullseye

WORKDIR /app

# Using the full Node image (not slim) to ensure all build tools (Python, make, g++) 
# are available for any dependencies that need compilation.

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    webp \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install dependencies with legacy peer deps to avoid conflicts
RUN npm install --legacy-peer-deps

COPY . .

CMD ["node", "index.js"]
