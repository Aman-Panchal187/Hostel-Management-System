import { createHash } from 'node:crypto';
import { config } from '../../config/env';
import { getRedis } from './redis';
import { logger } from '../utils/logger';

export type CacheScope = { kind: 'platform' } | { kind: 'hostel'; hostelId: string };

const scopeName = (scope: CacheScope) => (scope.kind === 'platform' ? 'platform' : `hostel:${scope.hostelId}`);

/** Stable hash of a filter object (key order independent, undefined values dropped). */
export function hashFilters(filters: Record<string, unknown>): string {
  const normalized = Object.keys(filters)
    .sort()
    .filter((key) => filters[key] !== undefined && filters[key] !== null && filters[key] !== '')
    .map((key) => [key, filters[key]]);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
}

export const versionKey = (scope: CacheScope) => `cache:ver:${scopeName(scope)}`;

/** Tenant-namespaced key, e.g. analytics:hostel:{id}:v3:{filterHash}. */
export function buildCacheKey(namespace: string, scope: CacheScope, version: string, filters: Record<string, unknown> = {}) {
  return `${namespace}:${scopeName(scope)}:v${version}:${hashFilters(filters)}`;
}

export async function cached<T>(
  namespace: string,
  scope: CacheScope,
  filters: Record<string, unknown>,
  loader: () => Promise<T>,
): Promise<T> {
  let key: string | null;
  try {
    const redis = getRedis();
    const version = (await redis.get(versionKey(scope))) ?? '0';
    key = buildCacheKey(namespace, scope, version, filters);
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Cache read failed; falling back to database');
    key = null;
  }
  const value = await loader();
  if (key) {
    try {
      await getRedis().set(key, JSON.stringify(value), 'EX', config.cacheTtlSeconds);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Cache write failed');
    }
  }
  return value;
}

/** Invalidate by bumping the scope version; stale keys expire via TTL. */
export async function invalidateScopes(...scopes: CacheScope[]): Promise<void> {
  try {
    const redis = getRedis();
    await Promise.all(scopes.map((scope) => redis.incr(versionKey(scope))));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Cache invalidation failed');
  }
}
