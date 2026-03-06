# ===== deps =====
FROM node:20-alpine AS deps
WORKDIR /app

# El build context ES ./apps/api → rutas relativas
COPY package*.json ./
# ⚠️ Para dev: usa npm install (no requiere package-lock en sync)
RUN npm install

# ===== dev/runtime =====
FROM node:20-alpine AS dev
WORKDIR /app
ENV CHROMIUM_BIN=/usr/bin/chromium-browser
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

# Prisma client (requiere ./prisma/schema.prisma)
RUN npx prisma generate

EXPOSE 3001
CMD ["npm","run","start:dev"]
