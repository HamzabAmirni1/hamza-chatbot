FROM node:20-bullseye

WORKDIR /app

# Using the full Node image (not slim) to ensure all build tools (Python, make, g++) 
# are available for any dependencies that need compilation.

COPY package*.json ./

# Install dependencies with legacy peer deps to avoid conflicts
RUN npm install --legacy-peer-deps

COPY . .

CMD ["npm", "start"]
