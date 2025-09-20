FROM node:18-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl1.1-compat

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src/

EXPOSE 3000

CMD ["npm", "start"]