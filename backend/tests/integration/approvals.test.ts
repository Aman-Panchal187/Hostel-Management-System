import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/shared/database/prisma';
import { api, bearer, login, makeHostel, makeTenant, makeUser, PASSWORD, platformAdmin, randomIp, resetRedis, tokenFor, uid } from '../helpers';

beforeAll(resetRedis);

async function registerHostel() {
  const email = `appr.${uid()}@test.example`;
  await api()
    .post('/api/auth/register/hostel')
    .set('X-Forwarded-For', randomIp())
    .send({ hostelName: `Approval Hostel ${uid()}`, address: '9 Test Lane, Pune', city: 'Pune', contactPhone: '+91 90000 11111', contactEmail: `o.${uid()}@test.example`, name: 'Owner', email, password: PASSWORD })
    .expect(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, email: true, membership: { select: { hostelId: true } } } });
  const request = await prisma.approvalRequest.findFirstOrThrow({ where: { userId: user.id } });
  return { user, requestId: request.id, hostelId: user.membership!.hostelId };
}

async function registerMember(kind: 'student' | 'assistant', hostelId: string) {
  const email = `${kind}.${uid()}@test.example`;
  const body = { name: 'Member', email, password: PASSWORD, hostelId, ...(kind === 'student' ? { roomNumber: '101' } : {}) };
  await api().post(`/api/auth/register/${kind}`).set('X-Forwarded-For', randomIp()).send(body).expect(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, email: true } });
  const request = await prisma.approvalRequest.findFirstOrThrow({ where: { userId: user.id } });
  return { user, requestId: request.id };
}

const decide = (token: string, id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) =>
  api().post(`/api/approvals/${id}/decision`).set(bearer(token)).send({ decision, reason });

describe('hostel approval workflow', () => {
  it('platform admin sees pending request, approves it, and the hostel admin gains access', async () => {
    const admin = await platformAdmin();
    const token = await tokenFor(admin);
    const reg = await registerHostel();

    const list = await api().get('/api/approvals').query({ status: 'PENDING', pageSize: 100 }).set(bearer(token));
    expect(list.status).toBe(200);
    expect((list.body.data as { id: string }[]).some((r) => r.id === reg.requestId)).toBe(true);

    const res = await decide(token, reg.requestId, 'APPROVED');
    expect(res.status).toBe(200);
    const hostel = await prisma.hostel.findUniqueOrThrow({ where: { id: reg.hostelId } });
    expect(hostel.status).toBe('APPROVED');

    const adminToken = await tokenFor(reg.user);
    const dash = await api().get('/api/analytics/hostel').set(bearer(adminToken));
    expect(dash.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: reg.requestId, action: 'HOSTEL_APPROVED' } });
    expect(audit?.actorId).toBe(admin.id);
    expect(audit?.hostelId).toBe(reg.hostelId);
  });

  it('rejection blocks login and records the reason', async () => {
    const token = await tokenFor(await platformAdmin());
    const reg = await registerHostel();
    expect((await decide(token, reg.requestId, 'REJECTED', 'Missing documents')).status).toBe(200);
    const res = await api().post('/api/auth/login').set('X-Forwarded-For', randomIp()).send({ email: reg.user.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_REJECTED');
    const stored = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: reg.requestId } });
    expect(stored).toMatchObject({ status: 'REJECTED', reason: 'Missing documents' });
  });

  it('a hostel admin cannot approve hostel registrations', async () => {
    const t = await makeTenant();
    const reg = await registerHostel();
    const res = await decide(await tokenFor(t.admin), reg.requestId, 'APPROVED');
    expect(res.status).toBe(404);
    expect((await prisma.hostel.findUniqueOrThrow({ where: { id: reg.hostelId } })).status).toBe('PENDING');
  });
});

describe('member approvals', () => {
  it('hostel admin approves a student and an assistant, who can then work', async () => {
    const t = await makeTenant();
    const adminToken = await tokenFor(t.admin);
    const student = await registerMember('student', t.hostel.id);
    const assistant = await registerMember('assistant', t.hostel.id);

    const pending = await api().get('/api/approvals').query({ status: 'PENDING' }).set(bearer(adminToken));
    const ids = (pending.body.data as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([student.requestId, assistant.requestId]));

    expect((await decide(adminToken, student.requestId, 'APPROVED')).status).toBe(200);
    expect((await decide(adminToken, assistant.requestId, 'APPROVED')).status).toBe(200);
    expect((await api().get('/api/issues').set(bearer(await tokenFor(student.user)))).status).toBe(200);
    expect((await api().get('/api/issues').set(bearer(await tokenFor(assistant.user)))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: { in: ['STUDENT_APPROVED', 'ASSISTANT_APPROVED'] }, hostelId: t.hostel.id } })).toBe(2);
  });

  it('hostel admin cannot approve another hostel\'s student (cross-tenant)', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const foreign = await registerMember('student', b.hostel.id);
    const res = await decide(await tokenFor(a.admin), foreign.requestId, 'APPROVED');
    expect(res.status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: foreign.user.id } })).status).toBe('PENDING');
    const list = await api().get('/api/approvals').query({ status: 'PENDING', pageSize: 100 }).set(bearer(await tokenFor(a.admin)));
    expect((list.body.data as { id: string }[]).map((r) => r.id)).not.toContain(foreign.requestId);
  });

  it('students and assistants cannot approve anyone', async () => {
    const t = await makeTenant();
    const pending = await registerMember('student', t.hostel.id);
    for (const user of [t.studentA, t.assistantA]) {
      expect((await decide(await tokenFor(user), pending.requestId, 'APPROVED')).status).toBe(403);
    }
  });

  it('pending users cannot reach protected APIs even with a previously valid token', async () => {
    const t = await makeTenant();
    const member = await registerMember('student', t.hostel.id);
    await prisma.user.update({ where: { id: member.user.id }, data: { status: 'APPROVED' } });
    const token = await tokenFor(member.user);
    expect((await api().get('/api/issues').set(bearer(token))).status).toBe(200);
    await prisma.user.update({ where: { id: member.user.id }, data: { status: 'REJECTED' } });
    const res = await api().get('/api/issues').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_REJECTED');
    await prisma.user.update({ where: { id: member.user.id }, data: { status: 'PENDING' } });
    expect((await api().get('/api/issues').set(bearer(token))).body.error.code).toBe('ACCOUNT_PENDING');
  });

  it('rejecting an active member revokes refresh sessions', async () => {
    const t = await makeTenant();
    const member = await registerMember('assistant', t.hostel.id);
    await prisma.user.update({ where: { id: member.user.id }, data: { status: 'APPROVED' } });
    const { cookies } = await login(member.user.email);
    await prisma.approvalRequest.update({ where: { id: member.requestId }, data: { status: 'PENDING' } });
    await decide(await tokenFor(t.admin), member.requestId, 'REJECTED');
    const res = await api().post('/api/auth/refresh').set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookies.map((c) => c.split(';')[0]).join('; '));
    expect(res.status).toBe(401);
  });

  it('handles concurrent duplicate decisions safely (exactly one wins)', async () => {
    const t = await makeTenant();
    const token = await tokenFor(t.admin);
    const member = await registerMember('student', t.hostel.id);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => decide(token, member.requestId, i % 2 ? 'APPROVED' : 'REJECTED')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await prisma.auditLog.count({ where: { entityId: member.requestId } })).toBe(1);
  });

  it('validates decision payloads and ids', async () => {
    const token = await tokenFor(await platformAdmin());
    expect((await decide(token, 'not-a-uuid', 'APPROVED')).status).toBe(400);
    const res = await api().post(`/api/approvals/${'00000000-0000-4000-8000-000000000000'}/decision`).set(bearer(token)).send({ decision: 'MAYBE' });
    expect(res.status).toBe(400);
  });
});

describe('hostel listing and rooms management', () => {
  it('platform admin lists hostels with filters; others are denied', async () => {
    const admin = await platformAdmin();
    await makeHostel('PENDING');
    const res = await api().get('/api/hostels').query({ status: 'PENDING' }).set(bearer(await tokenFor(admin)));
    expect(res.status).toBe(200);
    expect((res.body.data as { status: string }[]).every((h) => h.status === 'PENDING')).toBe(true);
    const t = await makeTenant();
    expect((await api().get('/api/hostels').set(bearer(await tokenFor(t.admin)))).status).toBe(403);
  });

  it('hostel admin manages only their own rooms', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const token = await tokenFor(a.admin);
    const created = await api().post('/api/rooms').set(bearer(token)).send({ number: `X${uid()}`, floor: 2, capacity: 3 });
    expect(created.status).toBe(201);
    expect((await api().post('/api/rooms').set(bearer(token)).send({ number: '101', floor: 1, capacity: 2 })).status).toBe(409);
    const foreignRoom = b.hostel.rooms[0]!.id;
    expect((await api().patch(`/api/rooms/${foreignRoom}`).set(bearer(token)).send({ capacity: 9 })).status).toBe(404);
    expect((await api().delete(`/api/rooms/${foreignRoom}`).set(bearer(token))).status).toBe(404);
    expect((await api().delete(`/api/rooms/${created.body.id}`).set(bearer(token))).status).toBe(204);
    expect((await api().post('/api/rooms').set(bearer(await tokenFor(a.studentA))).send({ number: 'Z', floor: 1, capacity: 1 })).status).toBe(403);
  });

  it('lists only own-hostel members', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await makeUser({ role: 'ASSISTANT', hostelId: b.hostel.id, name: 'Foreign Assistant' });
    const res = await api().get('/api/users').query({ role: 'ASSISTANT', status: 'APPROVED' }).set(bearer(await tokenFor(a.admin)));
    expect(res.status).toBe(200);
    const emails = (res.body.data as { email: string }[]).map((u) => u.email);
    expect(emails).toContain(a.assistantA.email);
    expect(emails).not.toContain(b.assistantA.email);
  });
});
