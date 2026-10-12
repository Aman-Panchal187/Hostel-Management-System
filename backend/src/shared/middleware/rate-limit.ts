import type { Request, RequestHandler } from 'express';
import { config } from '../../config/env';
import { AppError } from '../errors/app-error';
import { getRedis } from '../redis/redis';
import { logger } from '../utils/logger';

export interface LimitOptions {
  /** Logical bucket name, e.g. "login". */
  name: string;
  limit: () => { max: number; windowSec: number };
  /** Returns the identifiers counted independently (all must stay under the limit). */
  keys: (req: Request) => string[];
  /**
   * Behaviour when Redis is unavailable:
   *  - "memory": enforce the same limit with a per-process counter (strict; used for auth)
   *  - "open":   allow the request (used for the general API to keep the app available)
   */
  onRedisFailure: 'memory' | 'open';
}

interface MemoryEntry {
  count: number;
  resetAt: number;
}
const memoryStore = new Map<string, MemoryEntry>();

function memoryHit(key: string, windowSec: number): { count: number; ttl: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    if (memoryStore.size > 10_000) {
      for (const [k, v] of memoryStore) if (v.resetAt <= now) memoryStore.delete(k);
    }
    return { count: 1, ttl: windowSec };
  }
  entry.count += 1;
  return { count: entry.count, ttl: Math.ceil((entry.resetAt - now) / 1000) };
}

async function redisHit(key: string, windowSec: number): Promise<{ count: number; ttl: number }> {
  const redis = getRedis();
  const results = await redis.multi().incr(key).ttl(key).exec();
  const count = Number(results?.[0]?.[1] ?? 1);
  let ttl = Number(results?.[1]?.[1] ?? -1);
  if (ttl < 0) {
    await redis.expire(key, windowSec);
    ttl = windowSec;
  }
  return { count, ttl };
}

export function rateLimit(options: LimitOptions): RequestHandler {
  return (req, res, next) => {
    const { max, windowSec } = options.limit();
    const keys = options.keys(req).map((id) => `rl:${options.name}:${id}`);
    Promise.all(
      keys.map(async (key) => {
        try {
          return await redisHit(key, windowSec);
        } catch (err) {
          if (options.onRedisFailure === 'open') {
            logger.warn({ err: (err as Error).message }, 'Rate limiter bypassed: Redis unavailable');
            return { count: 0, ttl: 0 };
          }
          return memoryHit(key, windowSec);
        }
      }),
    )
      .then((hits) => {
        const worst = hits.reduce((a, b) => (b.count > a.count ? b : a), { count: 0, ttl: 0 });
        res.setHeader('RateLimit-Limit', String(max));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, max - worst.count)));
        if (worst.count > max) throw AppError.tooManyRequests(undefined, worst.ttl);
        next();
      })
      .catch(next);
  };
}

/** req.ip honours "trust proxy" (a fixed hop count), so spoofed X-Forwarded-For entries are ignored. */
const clientIp = (req: Request) => req.ip ?? 'unknown';
const emailOf = (req: Request) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : null;
};

export const loginLimiter = rateLimit({
  name: 'login',
  limit: () => config.rateLimits.login,
  keys: (req) => {
    const email = emailOf(req);
    return email ? [`ip:${clientIp(req)}`, `id:${email}`] : [`ip:${clientIp(req)}`];
  },
  onRedisFailure: 'memory',
});

export const registerLimiter = rateLimit({
  name: 'register',
  limit: () => config.rateLimits.register,
  keys: (req) => [`ip:${clientIp(req)}`],
  onRedisFailure: 'memory',
});

export const publicLimiter = rateLimit({
  name: 'public',
  limit: () => config.rateLimits.api,
  keys: (req) => [`ip:${clientIp(req)}`],
  onRedisFailure: 'open',
});

/** Per authenticated user. Must run after authenticate(). */
export const userLimiter = rateLimit({
  name: 'api',
  limit: () => config.rateLimits.api,
  keys: (req) => [`user:${req.auth?.userId ?? clientIp(req)}`],
  onRedisFailure: 'open',
});

export const refreshLimiter = rateLimit({
  name: 'refresh',
  limit: () => config.rateLimits.api,
  keys: (req) => [`ip:${clientIp(req)}`],
  onRedisFailure: 'memory',
});
