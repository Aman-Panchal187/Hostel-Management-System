#!/bin/bash
# Supervises Nginx (public) and Express (loopback only). If either process exits, the
# container stops so the platform restarts it and reports it unhealthy.
set -euo pipefail

PUBLIC_PORT="${PORT:-10000}"
export PORT="${EXPRESS_PORT:-3000}"   # the Express app reads PORT; it must stay on loopback

sed "s/__PORT__/${PUBLIC_PORT}/g" /etc/nginx/nginx.prod.conf.template > /tmp/nginx.conf
nginx -t -c /tmp/nginx.conf

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy
fi
if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding platform admin / (optional) demo data..."
  npx tsx prisma/seed.ts
fi

node dist/server.js &
NODE_PID=$!
nginx -c /tmp/nginx.conf -g 'daemon off;' &
NGINX_PID=$!

shutdown() {
  trap - TERM INT
  kill -TERM "$NGINX_PID" "$NODE_PID" 2>/dev/null || true
  wait "$NGINX_PID" "$NODE_PID" 2>/dev/null || true
}
trap shutdown TERM INT

# Block until the first child exits, then take the other one down and propagate the failure.
set +e
wait -n "$NODE_PID" "$NGINX_PID"
STATUS=$?
echo "A supervised process exited with status ${STATUS}; shutting down." >&2
shutdown
exit $(( STATUS == 0 ? 1 : STATUS ))
