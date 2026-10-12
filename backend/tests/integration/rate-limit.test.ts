import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../src/config/env';
import { api, makeTenant, PASSWORD, randomIp, resetRedis } from '../helpers';

const original = { ...config.rateLimits.login };
const originalRegister = { ...config.rateLimits.register };

beforeAll(resetRedis);
afterEach(() => {
  config.rateLimits.login = { ...original };
  config.rateLimits.register = { ...originalRegister };
});

describe('rate limiting', () => {
  it('16. login returns 429 after the per-IP limit (Redis backed)', async () => {
    config.rateLimits.login = { max: 3, windowSec: 60 };
    const t = await makeTenant();
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await api().post('/api/auth/login').set('X-Forwarded-For', ip).send({ email: t.studentA.email, password: i < 4 ? 'Wrong1234' : PASSWORD });
      statuses.push(res.status);
      if (res.status === 429) {
        expect(res.headers['retry-after']).toBeTruthy();
        expect(res.body.error.code).toBe('RATE_LIMITED');
      }
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('limits per identifier even when the IP changes (credential stuffing)', async () => {
    config.rateLimits.login = { max: 3, windowSec: 60 };
    const t = await makeTenant();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await api().post('/api/auth/login').set('X-Forwarded-For', randomIp()).send({ email: t.studentB.email, password: 'Wrong1234' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it('does not trust spoofed X-Forwarded-For prefixes: only the last trusted hop counts', async () => {
    config.rateLimits.login = { max: 2, windowSec: 60 };
    const realClient = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      // The attacker prepends fake addresses; the proxy-appended (rightmost) address is what express trusts.
      const res = await api().post('/api/auth/login').set('X-Forwarded-For', `1.2.3.${i}, ${realClient}`).send({ email: `nobody${i}.${Math.random()}@test.example`, password: 'Wrong1234' });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([401, 401, 429, 429]);
  });

  it('limits registrations per IP', async () => {
    config.rateLimits.register = { max: 2, windowSec: 600 };
    const ip = randomIp();
    const payload = () => ({ name: 'Bulk Student', email: `bulk.${Math.random().toString(36).slice(2)}@test.example`, password: PASSWORD, hostelId: '00000000-0000-4000-8000-000000000000', roomNumber: '1' });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await api().post('/api/auth/register/student').set('X-Forwarded-For', ip).send(payload())).status);
    expect(statuses.slice(0, 2)).not.toContain(429);
    expect(statuses[2]).toBe(429);
  });
});

describe('health', () => {
  it('reports database and redis status', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up', redis: 'up' });
  });

  it('unknown routes return a JSON 404 and malformed JSON a 400', async () => {
    expect((await api().get('/api/nope')).body.error.code).toBe('ROUTE_NOT_FOUND');
    const bad = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('MALFORMED_JSON');
  });
});
