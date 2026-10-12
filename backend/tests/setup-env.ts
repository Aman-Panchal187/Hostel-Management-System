import path from 'node:path';
import dotenv from 'dotenv';

// Load local secrets, then force every test-run setting. Tests must never touch the dev database.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb || !/\/[^/?]*_test(\?|$)/.test(testDb)) {
  throw new Error('TEST_DATABASE_URL must point to a database whose name ends with "_test"');
}

const redisBase = (process.env.REDIS_URL ?? 'redis://localhost:6380').replace(/\/\d+$/, '');

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testDb,
  REDIS_URL: `${redisBase}/1`,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-test-access-secret-12345',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-test-refresh-secret-12345',
  BCRYPT_ROUNDS: '4',
  MEDIA_PROVIDER: 'external',
  TRUST_PROXY_HOPS: '1',
  FRONTEND_URL: 'http://localhost:5173',
  RATE_LIMIT_LOGIN_MAX: '1000',
  RATE_LIMIT_REGISTER_MAX: '1000',
  RATE_LIMIT_API_MAX: '100000',
  CACHE_TTL_SECONDS: '60',
});
