FROM node:18-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts/
COPY shared-lib ./shared-lib/
RUN npm install --only=production \
    && npx playwright install-deps chromium \
    && npx playwright install chromium

COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src/

EXPOSE 3000

CMD ["npm", "start"]
