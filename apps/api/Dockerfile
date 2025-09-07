FROM node:20-bookworm-slim
# Prisma necesita OpenSSL disponible en runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "start:dev"]
