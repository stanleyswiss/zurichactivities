FROM node:18-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src/

EXPOSE 3000

CMD ["npm", "start"]