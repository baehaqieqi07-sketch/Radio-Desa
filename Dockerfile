FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && node -e "require('discord.js'); console.log('✅ discord.js terpasang')"

COPY . .

ENV NODE_ENV=production
CMD ["npm", "start"]
