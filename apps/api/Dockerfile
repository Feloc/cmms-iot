# ===== deps =====
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Prisma resuelve mejor los engines en Debian/glibc que en Alpine/musl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# El build context ES ./apps/api -> rutas relativas
COPY package*.json ./
RUN npm ci

# ===== dev/runtime =====
FROM node:20-bookworm-slim AS dev
WORKDIR /app
ENV CHROMIUM_BIN=/usr/bin/chromium
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . ./

EXPOSE 3001
CMD ["npm","run","start:dev"]
