import { createApp } from './app';
import { config } from './config/env';
import { prisma } from './shared/database/prisma';
import { closeRedis, getRedis } from './shared/redis/redis';
import { logger } from './shared/utils/logger';

const app = createApp();
getRedis();

// Bind to loopback only in production: Nginx is the single public entry point.
const host = config.isProduction ? '127.0.0.1' : '0.0.0.0';
const server = app.listen(config.port, host, () => {
  logger.info({ port: config.port, host, media: config.media.provider }, 'API listening');
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await Promise.allSettled([prisma.$disconnect(), closeRedis()]);
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});
