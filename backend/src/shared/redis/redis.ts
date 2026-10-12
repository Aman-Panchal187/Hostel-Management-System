import Redis from 'ioredis';
import { config } from '../../config/env';
import { logger } from '../utils/logger';

let client: Redis | null = null;

/** Lazily-created shared Redis client. Supports redis:// and TLS rediss:// (Upstash). */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      lazyConnect: false,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });
    client.on('error', (err) => logger.warn({ err: err.message }, 'Redis error'));
  }
  return client;
}

export function isRedisReady(): boolean {
  return client?.status === 'ready';
}

export async function pingRedis(): Promise<boolean> {
  try {
    return (await getRedis().ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => client?.disconnect());
    client = null;
  }
}
