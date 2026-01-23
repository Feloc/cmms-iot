#!/bin/sh
set -eu

echo "[api] Starting production entrypoint..."

# Ensure Prisma client exists (should be generated during npm ci)
# Apply schema:
# - If migrations exist -> migrate deploy
# - Otherwise -> db push (useful for first internal pilot)
if [ -d "./prisma/migrations" ] && [ "$(ls -A ./prisma/migrations 2>/dev/null)" ]; then
  echo "[api] prisma migrate deploy"
  npx prisma migrate deploy
else
  echo "[api] prisma db push (no migrations found)"
  npx prisma db push
fi

echo "[api] Starting NestJS"
exec node dist/main.js
