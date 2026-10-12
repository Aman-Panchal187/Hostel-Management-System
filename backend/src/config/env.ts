import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Root .env first (shared with docker compose), then backend-local overrides.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const durationPattern = /^\d+(s|m|h|d)$/;
const duration = (fallback: string) => z.string().regex(durationPattern).default(fallback);
const boolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_EXPIRY: duration('15m'),
    REFRESH_TOKEN_EXPIRY: duration('7d'),
    MEDIA_PROVIDER: z.enum(['external', 'cloudinary']).default('external'),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    FRONTEND_URL: z.string().min(1).default('http://localhost:5173'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
    COOKIE_SECURE: boolean.optional(),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).optional(),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_LOGIN_WINDOW_SEC: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_REGISTER_WINDOW_SEC: z.coerce.number().int().positive().default(600),
    RATE_LIMIT_API_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_API_WINDOW_SEC: z.coerce.number().int().positive().default(60),
    LOG_LEVEL: z.string().default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.MEDIA_PROVIDER === 'cloudinary') {
      for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when MEDIA_PROVIDER=cloudinary` });
        }
      }
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n  ');
  throw new Error(`Invalid environment configuration:\n  ${details}`);
}
const env = parsed.data;
const isProduction = env.NODE_ENV === 'production';

export function parseDurationMs(value: string): number {
  const amount = Number.parseInt(value, 10);
  const unit = value.slice(-1);
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (multipliers[unit] ?? 0);
}

export const config = {
  env: env.NODE_ENV,
  isProduction,
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiry: env.ACCESS_TOKEN_EXPIRY,
    refreshTtlMs: parseDurationMs(env.REFRESH_TOKEN_EXPIRY),
  },
  media: {
    provider: env.MEDIA_PROVIDER,
    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: env.CLOUDINARY_API_KEY ?? '',
      apiSecret: env.CLOUDINARY_API_SECRET ?? '',
    },
  },
  allowedOrigins: env.FRONTEND_URL.split(',').map((origin) => origin.trim().replace(/\/$/, '')),
  trustProxyHops: env.TRUST_PROXY_HOPS,
  cookie: {
    // Cross-site (Vercel -> Render) deployments need Secure + SameSite=None.
    secure: env.COOKIE_SECURE ?? isProduction,
    sameSite: env.COOKIE_SAMESITE ?? (isProduction ? 'none' : 'lax'),
  },
  bcryptRounds: env.BCRYPT_ROUNDS,
  cacheTtlSeconds: env.CACHE_TTL_SECONDS,
  rateLimits: {
    login: { max: env.RATE_LIMIT_LOGIN_MAX, windowSec: env.RATE_LIMIT_LOGIN_WINDOW_SEC },
    register: { max: env.RATE_LIMIT_REGISTER_MAX, windowSec: env.RATE_LIMIT_REGISTER_WINDOW_SEC },
    api: { max: env.RATE_LIMIT_API_MAX, windowSec: env.RATE_LIMIT_API_WINDOW_SEC },
  },
  logLevel: env.LOG_LEVEL,
};

export type AppConfig = typeof config;
