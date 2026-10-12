import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/shared/database/prisma';
import { api, bearer, makeIssue, makeTenant, MEDIA, platformAdmin, resetRedis, tokenFor } from '../helpers';

beforeAll(resetRedis);

async function twoTenants() {
  const a = await makeTenant();
  const b = await makeTenant();
  const issueA = await makeIssue({ hostelId: a.hostel.id, reporterId: a.studentA.id, assigneeId: a.assistantA.id });
  const issueB = await makeIssue({ hostelId: b.hostel.id, reporterId: b.studentA.id, assigneeId: b.assistantA.id });
  return { a, b, issueA, issueB };
}

describe('horizontal access control (IDOR)', () => {
  it('1. student cannot view another student\'s issue', async () => {
    const { a, issueA } = await twoTenants();
    const other = await makeIssue({ hostelId: a.hostel.id, reporterId: a.studentB.id });
    expect((await api().get(`/api/issues/${other.id}`).set(bearer(await tokenFor(a.studentA)))).status).toBe(404);
    expect((await api().get(`/api/issues/${issueA.id}`).set(bearer(await tokenFor(a.studentA)))).status).toBe(200);
  });

  it('2. assistant cannot view another assistant\'s issues', async () => {
    const { a } = await twoTenants();
    const mine = await makeIssue({ hostelId: a.hostel.id, reporterId: a.studentA.id, assigneeId: a.assistantB.id });
    const res = await api().get(`/api/issues/${mine.id}`).set(bearer(await tokenFor(a.assistantA)));
    expect(res.status).toBe(404);
    const list = await api().get('/api/issues').set(bearer(await tokenFor(a.assistantA)));
    expect((list.body.data as { id: string }[]).map((i) => i.id)).not.toContain(mine.id);
  });

  it('3. hostel admin cannot view another hostel\'s issues', async () => {
    const { a, issueB } = await twoTenants();
    const token = await tokenFor(a.admin);
    expect((await api().get(`/api/issues/${issueB.id}`).set(bearer(token))).status).toBe(404);
    const list = await api().get('/api/issues').set(bearer(token));
    expect((list.body.data as { id: string }[]).map((i) => i.id)).not.toContain(issueB.id);
  });

  it('17. tenant ids in query/body/headers cannot widen access', async () => {
    const { a, b, issueB } = await twoTenants();
    const token = await tokenFor(a.admin);
    const res = await api().get('/api/issues').query({ hostelId: b.hostel.id }).set(bearer(token)).set('X-Hostel-Id', b.hostel.id);
    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((i) => i.id)).not.toContain(issueB.id);
    const created = await api().post('/api/issues').set(bearer(await tokenFor(a.studentA))).send({ title: 'Tenant hop', description: 'Trying to inject another hostel id', category: 'OTHER', hostelId: b.hostel.id, roomId: b.hostel.rooms[0]!.id });
    expect(created.status).toBe(201);
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: created.body.id } })).hostelId).toBe(a.hostel.id);
    const analytics = await api().get('/api/analytics/hostel').query({ hostelId: b.hostel.id }).set(bearer(token));
    expect(analytics.body.kpis.total).toBe(2); // only hostel A's issues (seeded one + the injected-attempt one)
  });

  it('18. users cannot modify another tenant\'s attachments or issues', async () => {
    const { a, issueB } = await twoTenants();
    expect((await api().post(`/api/issues/${issueB.id}/attachments`).set(bearer(await tokenFor(a.studentA))).send({ ...MEDIA, kind: 'REFERENCE' })).status).toBe(404);
    expect((await api().post(`/api/issues/${issueB.id}/attachments`).set(bearer(await tokenFor(a.assistantA))).send({ ...MEDIA, kind: 'RESOLUTION' })).status).toBe(404);
    expect((await api().post(`/api/issues/${issueB.id}/attachments`).set(bearer(await tokenFor(a.admin))).send({ ...MEDIA, kind: 'REFERENCE' })).status).toBe(404);
    expect((await api().post(`/api/issues/${issueB.id}/assign`).set(bearer(await tokenFor(a.admin))).send({ assigneeId: a.assistantA.id })).status).toBe(404);
    expect(await prisma.issueAttachment.count({ where: { issueId: issueB.id } })).toBe(0);
  });

  it('students cannot attach to a classmate\'s issue and assistants not to unassigned ones', async () => {
    const t = await makeTenant();
    const classmate = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id });
    expect((await api().post(`/api/issues/${classmate.id}/attachments`).set(bearer(await tokenFor(t.studentA))).send({ ...MEDIA, kind: 'REFERENCE' })).status).toBe(404);
    const unassigned = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id, assigneeId: t.assistantB.id });
    expect((await api().post(`/api/issues/${unassigned.id}/attachments`).set(bearer(await tokenFor(t.assistantA))).send({ ...MEDIA, kind: 'RESOLUTION' })).status).toBe(404);
  });
});

describe('vertical access control (roles)', () => {
  it('7. student cannot assign issues', async () => {
    const t = await makeTenant();
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    const res = await api().post(`/api/issues/${issue.id}/assign`).set(bearer(await tokenFor(t.studentA))).send({ assigneeId: t.assistantA.id });
    expect(res.status).toBe(403);
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } })).assigneeId).toBeNull();
  });

  it('8. assistant cannot approve registrations or list approvals', async () => {
    const t = await makeTenant();
    const token = await tokenFor(t.assistantA);
    expect((await api().get('/api/approvals').set(bearer(token))).status).toBe(403);
    expect((await api().post(`/api/approvals/${randomUUID()}/decision`).set(bearer(token)).send({ decision: 'APPROVED' })).status).toBe(403);
  });

  it('9. unauthorized users cannot change issue status', async () => {
    const t = await makeTenant();
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id });
    expect((await api().post(`/api/issues/${issue.id}/status`).send({ status: 'IN_PROGRESS' })).status).toBe(401);
    for (const user of [t.studentA, t.admin]) {
      expect((await api().post(`/api/issues/${issue.id}/status`).set(bearer(await tokenFor(user))).send({ status: 'IN_PROGRESS' })).status).toBe(403);
    }
    expect((await api().post(`/api/issues/${issue.id}/status`).set(bearer(await tokenFor(t.assistantB))).send({ status: 'IN_PROGRESS' })).status).toBe(404);
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } })).status).toBe('YET_TO_START');
  });

  it('platform admin has no access to hostel-operational endpoints', async () => {
    const admin = await tokenFor(await platformAdmin());
    expect((await api().get('/api/issues').set(bearer(admin))).status).toBe(403);
    expect((await api().get('/api/rooms').set(bearer(admin))).status).toBe(403);
    expect((await api().get('/api/users').set(bearer(admin))).status).toBe(403);
    expect((await api().get('/api/analytics/hostel').set(bearer(admin))).status).toBe(403);
  });

  it('only the platform admin can read platform analytics', async () => {
    const t = await makeTenant();
    for (const user of [t.admin, t.assistantA, t.studentA]) {
      expect((await api().get('/api/analytics/platform').set(bearer(await tokenFor(user)))).status).toBe(403);
    }
    expect((await api().get('/api/analytics/platform').set(bearer(await tokenFor(await platformAdmin())))).status).toBe(200);
  });

  it('assistants and students cannot reach hostel-admin analytics, users or audit', async () => {
    const t = await makeTenant();
    for (const user of [t.assistantA, t.studentA]) {
      const token = await tokenFor(user);
      expect((await api().get('/api/analytics/hostel').set(bearer(token))).status).toBe(403);
      expect((await api().get('/api/users').set(bearer(token))).status).toBe(403);
      expect((await api().get('/api/audit').set(bearer(token))).status).toBe(403);
    }
  });
});

describe('account state', () => {
  it('5/6. pending and rejected users get no protected data', async () => {
    const t = await makeTenant();
    const token = await tokenFor(t.studentA);
    await prisma.user.update({ where: { id: t.studentA.id }, data: { status: 'PENDING' } });
    for (const path of ['/api/issues', '/api/rooms', '/api/analytics/me', '/api/auth/me']) {
      const res = await api().get(path).set(bearer(token));
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_PENDING');
    }
    await prisma.user.update({ where: { id: t.studentA.id }, data: { status: 'REJECTED' } });
    expect((await api().get('/api/issues').set(bearer(token))).body.error.code).toBe('ACCOUNT_REJECTED');
  });

  it('users lose access when their hostel is no longer approved', async () => {
    const t = await makeTenant();
    const token = await tokenFor(t.studentA);
    await prisma.hostel.update({ where: { id: t.hostel.id }, data: { status: 'REJECTED' } });
    const res = await api().get('/api/issues').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HOSTEL_NOT_APPROVED');
  });

  it('tokens of deleted accounts are rejected', async () => {
    const t = await makeTenant();
    const token = await tokenFor(t.studentB);
    await prisma.user.delete({ where: { id: t.studentB.id } });
    expect((await api().get('/api/issues').set(bearer(token))).status).toBe(401);
  });
});

describe('platform audit view', () => {
  it('hostel admin sees only own-hostel audit records', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const issueA = await makeIssue({ hostelId: a.hostel.id, reporterId: a.studentA.id });
    const issueB = await makeIssue({ hostelId: b.hostel.id, reporterId: b.studentA.id });
    await api().post(`/api/issues/${issueA.id}/assign`).set(bearer(await tokenFor(a.admin))).send({ assigneeId: a.assistantA.id }).expect(200);
    await api().post(`/api/issues/${issueB.id}/assign`).set(bearer(await tokenFor(b.admin))).send({ assigneeId: b.assistantA.id }).expect(200);
    const res = await api().get('/api/audit').set(bearer(await tokenFor(a.admin)));
    const ids = (res.body.data as { entityId: string }[]).map((r) => r.entityId);
    expect(ids).toContain(issueA.id);
    expect(ids).not.toContain(issueB.id);
  });
});
