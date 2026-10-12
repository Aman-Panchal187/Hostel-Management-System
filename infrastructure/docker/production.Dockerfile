# Production image for Render: Nginx (public, $PORT or 10000) + Express (127.0.0.1:3000) in one container.
# Build context: repository root.  Render "Dockerfile Path": infrastructure/docker/production.Dockerfile
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN npm ci -w backend --include-workspace-root=false
COPY backend backend
RUN npm run build -w backend

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl nginx bash tini
ENV NODE_ENV=production \
    PORT=10000 \
    EXPRESS_PORT=3000
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/backend backend
COPY infrastructure/nginx/nginx.prod.conf.template /etc/nginx/nginx.prod.conf.template
COPY infrastructure/docker/production-entrypoint.sh /usr/local/bin/production-entrypoint.sh
RUN chmod +x /usr/local/bin/production-entrypoint.sh \
    && mkdir -p /tmp/nginx-client-body /tmp/nginx-proxy \
    && chown -R node:node /app /etc/nginx /var/lib/nginx /var/log/nginx /tmp/nginx-client-body /tmp/nginx-proxy
USER node
WORKDIR /app/backend
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/production-entrypoint.sh"]
