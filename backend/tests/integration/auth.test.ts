import jwt from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../src/config/env';
import { prisma } from '../../src/shared/database/prisma';
import { api, bearer, login, makeHostel, makeTenant, PASSWORD, platformAdmin, randomIp, resetRedis, tokenFor, uid } from '../helpers';

const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };
const cookieHeader = (cookies: string[]) => cookies.map((c) => c.split(';')[0]).join('; ');

beforeAll(resetRedis);

describe('registration', () => {
  const hostelPayload = () => ({
    hostelName: `Reg Hostel ${uid()}`,
    address: '12 Main Road, Pune',
    city: 'Pune',
    contactPhone: '+91 98765 43210',
    contactEmail: `office.${uid()}@test.example`,
    name: 'Reg Admin',
    email: `regadmin.${uid()}@test.example`,
    password: PASSWORD,
  });

  it('creates a PENDING hostel, admin and approval request', async () => {
    const payload = hostelPayload();
    const res = await api().post('/api/auth/register/hostel').set('X-Forwarded-For', randomIp()).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: payload.email }, include: { membership: { include: { hostel: true } } } });
    expect(user.status).toBe('PENDING');
    expect(user.role).toBe('HOSTEL_ADMIN');
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.membership?.hostel.status).toBe('PENDING');
    expect(await prisma.approvalRequest.count({ where: { userId: user.id, type: 'HOSTEL_REGISTRATION', status: 'PENDING' } })).toBe(1);
  });

  it('rejects duplicate emails with 409', async () => {
    const payload = hostelPayload();
    await api().post('/api/auth/register/hostel').set('X-Forwarded-For', randomIp()).send(payload).expect(201);
    const res = await api().post('/api/auth/register/hostel').set('X-Forwarded-For', randomIp()).send({ ...payload, hostelName: 'Other' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates input (weak password, bad email)', async () => {
    const res = await api().post('/api/auth/register/hostel').set('X-Forwarded-For', randomIp()).send({ ...hostelPayload(), password: 'short', email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('students and assistants register against approved hostels only', async () => {
    const t = await makeTenant();
    const pending = await makeHostel('PENDING');
    const student = { name: 'New Student', email: `s.${uid()}@test.example`, password: PASSWORD, hostelId: t.hostel.id, roomNumber: '101' };
    expect((await api().post('/api/auth/register/student').set('X-Forwarded-For', randomIp()).send(student)).status).toBe(201);
    const badRoom = await api().post('/api/auth/register/student').set('X-Forwarded-For', randomIp()).send({ ...student, email: `s.${uid()}@test.example`, roomNumber: '999' });
    expect(badRoom.body.error.code).toBe('ROOM_NOT_FOUND');
    const unapproved = await api().post('/api/auth/register/assistant').set('X-Forwarded-For', randomIp()).send({ name: 'Assistant', email: `a.${uid()}@test.example`, password: PASSWORD, hostelId: pending.id });
    expect(unapproved.status).toBe(400);
    expect(unapproved.body.error.code).toBe('HOSTEL_UNAVAILABLE');
    const created = await prisma.user.findUniqueOrThrow({ where: { email: student.email }, include: { membership: true } });
    expect(created.status).toBe('PENDING');
    expect(created.membership?.hostelId).toBe(t.hostel.id);
  });

  it('public hostel list only exposes approved hostels', async () => {
    const approved = await makeHostel('APPROVED');
    const pending = await makeHostel('PENDING');
    const res = await api().get('/api/public/hostels').query({ search: 'Test Hostel' }).set('X-Forwarded-For', randomIp());
    const ids = (res.body.data as { id: string }[]).map((h) => h.id);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(pending.id);
    const rooms = await api().get(`/api/public/hostels/${pending.id}/rooms`).set('X-Forwarded-For', randomIp());
    expect(rooms.status).toBe(404);
  });
});

describe('login and sessions', () => {
  it('logs in an approved user and sets an HttpOnly refresh cookie', async () => {
    const t = await makeTenant();
    const res = await api().post('/api/auth/login').set('X-Forwarded-For', randomIp()).send({ email: t.studentA.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ role: 'STUDENT', hostel: { id: t.hostel.id } });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('gives identical errors for unknown user and wrong password', async () => {
    const t = await makeTenant();
    const wrong = await api().post('/api/auth/login').set('X-Forwarded-For', randomIp()).send({ email: t.studentA.email, password: 'Wrong1234' });
    const unknown = await api().post('/api/auth/login').set('X-Forwarded-For', randomIp()).send({ email: `nobody.${uid()}@test.example`, password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('blocks PENDING and REJECTED accounts at login without issuing tokens', async () => {
    const pendingHostel = await makeHostel('PENDING');
    const pending = await api().post('/api/auth/login').set('X-Forwarded-For', randomIp()).send({ email: pendingHostel.admin.email, password: PASSWORD });
    expect(pending.status).toBe(403);
    expect(pending.body.error.code).toBe('ACCOUNT_PENDING');
    expect(pending.body.accessToken).toBeUndefined();
    expect(pending.headers['set-cookie']).toBeUndefined();

    const rejectedHostel = await makeHostel('REJECTED');
    const rejected = await api().post('/api/auth/login').set('X-Forwarded-For', randomIp()).send({ email: rejectedHostel.admin.email, password: PASSWORD });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('ACCOUNT_REJECTED');
  });

  it('GET /me returns the profile for a valid token', async () => {
    const t = await makeTenant();
    const res = await api().get('/api/auth/me').set(bearer(await tokenFor(t.assistantA)));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(t.assistantA.email);
  });
});

describe('JWT handling', () => {
  it('rejects missing, malformed and wrongly signed tokens', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set(bearer('garbage'))).status).toBe(401);
    const forged = jwt.sign({ sub: 'x', role: 'PLATFORM_ADMIN' }, 'attacker-secret-attacker-secret-attacker');
    const res = await api().get('/api/analytics/platform').set(bearer(forged));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects expired tokens', async () => {
    const t = await makeTenant();
    const expired = jwt.sign({ sub: t.studentA.id, role: 'STUDENT' }, config.jwt.accessSecret, { expiresIn: -5 });
    const res = await api().get('/api/auth/me').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('ignores a forged role claim: the role comes from the database', async () => {
    const t = await makeTenant();
    const forged = jwt.sign({ sub: t.studentA.id, role: 'PLATFORM_ADMIN' }, config.jwt.accessSecret, { expiresIn: 60 });
    const res = await api().get('/api/analytics/platform').set(bearer(forged));
    expect(res.status).toBe(403);
  });
});

describe('refresh token rotation', () => {
  it('rotates tokens, detects reuse and revokes the whole family', async () => {
    const t = await makeTenant();
    const first = await login(t.studentA.email);
    const rotate = (cookies: string[]) => api().post('/api/auth/refresh').set(CSRF).set('Cookie', cookieHeader(cookies));

    const second = await rotate(first.cookies);
    expect(second.status).toBe(200);
    expect(second.body.accessToken).toBeTruthy();
    const newCookies = second.headers['set-cookie'] as unknown as string[];
    expect(cookieHeader(newCookies)).not.toBe(cookieHeader(first.cookies));

    const reuse = await rotate(first.cookies);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The legitimately rotated token is now revoked too (family compromise).
    const afterReuse = await rotate(newCookies);
    expect(afterReuse.status).toBe(401);
  });

  it('only one of several concurrent refreshes succeeds', async () => {
    const t = await makeTenant();
    const { cookies } = await login(t.studentA.email);
    const results = await Promise.all(Array.from({ length: 5 }, () => api().post('/api/auth/refresh').set(CSRF).set('Cookie', cookieHeader(cookies))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('logout revokes the session', async () => {
    const t = await makeTenant();
    const { cookies } = await login(t.studentA.email);
    const out = await api().post('/api/auth/logout').set(CSRF).set('Cookie', cookieHeader(cookies));
    expect(out.status).toBe(204);
    const res = await api().post('/api/auth/refresh').set(CSRF).set('Cookie', cookieHeader(cookies));
    expect(res.status).toBe(401);
  });

  it('requires the CSRF header and an allowed origin', async () => {
    const t = await makeTenant();
    const { cookies } = await login(t.studentA.email);
    const noHeader = await api().post('/api/auth/refresh').set('Cookie', cookieHeader(cookies));
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.error.code).toBe('CSRF_HEADER');
    const badOrigin = await api().post('/api/auth/refresh').set(CSRF).set('Origin', 'https://evil.example').set('Cookie', cookieHeader(cookies));
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body.error.code).toBe('CSRF_ORIGIN');
    const good = await api().post('/api/auth/refresh').set(CSRF).set('Origin', 'http://localhost:5173').set('Cookie', cookieHeader(cookies));
    expect(good.status).toBe(200);
  });

  it('platform admin can log in and use admin endpoints', async () => {
    const admin = await platformAdmin();
    const res = await api().get('/api/hostels').set(bearer(await tokenFor(admin)));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
