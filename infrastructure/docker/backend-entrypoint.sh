#!/bin/sh
# Applies migrations, optionally seeds, then runs the API (PID 1 is tini).
set -eu

echo "Applying database migrations..."
npx prisma migrate deploy

if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding (idempotent)..."
  npx tsx prisma/seed.ts
fi

exec node dist/server.js
