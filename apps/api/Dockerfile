# apps/api/Dockerfile o Dockerfile en la raíz apuntando a apps/api
FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm ci

FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api/ ./
# Genera Prisma client si aplica
RUN npx prisma generate
EXPOSE 3001
CMD ["npm","run","start:dev"]



#FROM node:20-bookworm-slim
# Prisma necesita OpenSSL disponible en runtime
#RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
#WORKDIR /app
#COPY package*.json ./
#RUN npm ci || npm install
#COPY . .
#EXPOSE 3001
#CMD ["npm", "run", "start:dev"]
