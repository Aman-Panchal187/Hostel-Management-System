import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DEMO, env, uniq } from './support';

const root = path.resolve(__dirname, '../..');
const compose = (cmd: string) => execSync(`docker compose ${cmd}`, { cwd: root, encoding: 'utf8' });

test.describe('Nginx reverse proxy', () => {
  test('health is served through Nginx with db and redis up', async ({ request }) => {
    const res = await request.get(`${env.apiBase}/api/health`);
    expect(res.status()).toBe(200);
    expect(res.headers().server).toMatch(/nginx/i); // proves the response passed through Nginx
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'up', redis: 'up' });
  });

  test('paths are forwarded unchanged and non-API paths are rejected by Nginx', async ({ request }) => {
    const api = await request.get(`${env.apiBase}/api/public/hostels`);
    expect(api.status()).toBe(200);
    expect((await api.json()).data.length).toBeGreaterThanOrEqual(3);
    const root = await request.get(`${env.apiBase}/`);
    expect(root.status()).toBe(404);
    expect((await root.json()).error.code).toBe('NOT_FOUND');
    const unknown = await request.get(`${env.apiBase}/api/does-not-exist`);
    expect(unknown.status()).toBe(404);
    expect((await unknown.json()).error.code).toBe('ROUTE_NOT_FOUND');
  });

  test('security headers are present exactly once', async ({ request }) => {
    const res = await request.get(`${env.apiBase}/api/health`);
    const raw = res.headersArray().map((h) => h.name.toLowerCase());
    for (const name of ['x-content-type-options', 'x-frame-options', 'referrer-policy']) {
      expect(raw.filter((n) => n === name), name).toHaveLength(1);
    }
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });

  test('request body size limit is enforced', async ({ request }) => {
    const res = await request.post(`${env.apiBase}/api/auth/login`, { data: { email: 'a@b.co', password: 'x'.repeat(2_000_000) } });
    expect(res.status()).toBe(413);
  });

  test('express is not reachable directly from the host', async ({ request }) => {
    const res = await request.get('http://localhost:3000/api/health', { timeout: 3000 }).catch(() => null);
    expect(res).toBeNull();
  });

  test('a spoofed X-Forwarded-For header cannot dodge the per-identifier login limiter', async ({ request }) => {
    test.setTimeout(120_000);
    await new Promise((r) => setTimeout(r, 61_000)); // start from a fresh per-IP window
    const email = `ratelimit.${uniq()}@e2e.test`;
    const limit = Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5);
    const statuses: number[] = [];
    for (let i = 0; i < limit + 3; i++) {
      const res = await request.post(`${env.apiBase}/api/auth/login`, {
        data: { email, password: 'WrongPass1' },
        headers: { 'X-Forwarded-For': `203.0.113.${i + 1}` },
      });
      statuses.push(res.status());
    }
    expect(statuses.slice(0, limit).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(limit)).toEqual([429, 429, 429]);
  });
});

test.describe('Redis and PostgreSQL behind the stack', () => {
  test('dashboard results are cached in Redis under a tenant-scoped key', async ({ request }) => {
    test.skip(!!process.env.RATE_LIMIT_BLOCKED, 'rate limit bucket exhausted');
    // wait for the previous test's login bucket to drain
    await new Promise((r) => setTimeout(r, 61_000));
    const login = await request.post(`${env.apiBase}/api/auth/login`, { data: { email: DEMO.hostelAdmin, password: env.demoPassword } });
    expect(login.status()).toBe(200);
    const { accessToken, user } = await login.json();
    const headers = { Authorization: `Bearer ${accessToken}` };
    const a = await (await request.get(`${env.apiBase}/api/analytics/hostel`, { headers })).json();
    const b = await (await request.get(`${env.apiBase}/api/analytics/hostel`, { headers })).json();
    expect(b).toEqual(a);
    const keys = compose('exec -T redis redis-cli --scan --pattern "analytics:hostel:*"');
    expect(keys).toContain(`analytics:hostel:${user.hostel.id}:`);
    const ttl = Number(compose(`exec -T redis redis-cli ttl ${keys.split('\n').find((k) => k.includes(user.hostel.id))?.trim()}`).trim());
    expect(ttl).toBeGreaterThan(0);
    // rate-limit counters live in Redis too
    const limiterKeys = compose('exec -T redis redis-cli --scan --pattern "rl:*"');
    expect(limiterKeys).toContain('rl:login:');
  });

  test('seed data is present in PostgreSQL', () => {
    const out = compose(`exec -T postgres psql -U hostel -d hostel_management -At -c "select (select count(*) from hostels where is_demo), (select count(*) from issues), (select count(*) from issue_status_history), (select count(*) from audit_logs)"`).trim();
    const [hostels, issues, history, audits] = out.split('|').map(Number);
    expect(hostels).toBe(5);
    expect(issues).toBeGreaterThanOrEqual(100);
    expect(history).toBeGreaterThan(issues!);
    expect(audits).toBeGreaterThan(100);
  });
});
