# syntax=docker/dockerfile:1.7

# --- deps: instala usando lockfile de la RAÍZ ---
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/ingest/package.json apps/ingest/
RUN --mount=type=cache,target=/root/.npm npm ci --workspaces --include-workspace-root

# --- dev: hot reload (usa node_modules de /app) ---
FROM node:20-bookworm-slim AS dev
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
WORKDIR /app/apps/ingest
CMD ["npm","run","dev"]

# --- build: compila TS -> dist (para prod) ---
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
WORKDIR /app/apps/ingest
RUN npm run build

# --- prod: runtime limpio ---
FROM node:20-bookworm-slim AS prod
WORKDIR /app/apps/ingest
ENV NODE_ENV=production
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/apps/ingest/dist ./dist
CMD ["node","dist/index.js"]
