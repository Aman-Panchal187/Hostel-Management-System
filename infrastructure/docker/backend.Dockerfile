# Backend image used by docker compose (Nginx runs as its own container locally).
# Build context: repository root.
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
# Workspace manifests must exist so the root lockfile resolves; their code is not needed.
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN npm ci -w backend --include-workspace-root=false
COPY backend backend
RUN npm run build -w backend

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/backend backend
COPY infrastructure/docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh && chown -R node:node /app
USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "backend-entrypoint.sh"]
