import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/shared/database/prisma';
import { api, bearer, makeIssue, makeTenant, MEDIA, resetRedis, tokenFor } from '../helpers';

beforeAll(resetRedis);

const newIssue = (overrides: Record<string, unknown> = {}) => ({
  title: 'Ceiling fan is not working',
  description: 'The fan stopped working since last night in my room.',
  category: 'ELECTRICAL',
  priority: 'HIGH',
  ...overrides,
});

describe('complete issue lifecycle', () => {
  it('student creates -> admin assigns -> assistant progresses and completes -> history is recorded', async () => {
    const t = await makeTenant();
    const [student, admin, assistant] = await Promise.all([tokenFor(t.studentA), tokenFor(t.admin), tokenFor(t.assistantA)]);

    const created = await api().post('/api/issues').set(bearer(student)).send(newIssue({ attachments: [MEDIA] }));
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ status: 'YET_TO_START', priority: 'HIGH', category: 'ELECTRICAL', assignee: null });
    expect(created.body.attachments).toHaveLength(1);
    expect(created.body.room.number).toBe('101');

    const unassigned = await api().get('/api/issues').query({ unassigned: 'true' }).set(bearer(admin));
    expect((unassigned.body.data as { id: string }[]).map((i) => i.id)).toContain(id);

    const assigned = await api().post(`/api/issues/${id}/assign`).set(bearer(admin)).send({ assigneeId: t.assistantA.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.status).toBe('YET_TO_START'); // assignment alone does not change status
    expect(assigned.body.assignee.id).toBe(t.assistantA.id);
    expect(assigned.body.assignedAt).toBeTruthy();

    const mine = await api().get('/api/issues').set(bearer(assistant));
    expect((mine.body.data as { id: string }[]).map((i) => i.id)).toEqual([id]);

    const started = await api().post(`/api/issues/${id}/status`).set(bearer(assistant)).send({ status: 'IN_PROGRESS' });
    expect(started.status).toBe(200);
    expect(started.body.startedAt).toBeTruthy();

    const noEvidence = await api().post(`/api/issues/${id}/status`).set(bearer(assistant)).send({ status: 'DONE', resolutionNotes: 'Replaced the capacitor' });
    expect(noEvidence.status).toBe(422);
    expect(noEvidence.body.error.code).toBe('RESOLUTION_EVIDENCE_REQUIRED');
    const noNotes = await api().post(`/api/issues/${id}/status`).set(bearer(assistant)).send({ status: 'DONE', attachments: [MEDIA] });
    expect(noNotes.body.error.code).toBe('RESOLUTION_NOTES_REQUIRED');

    const done = await api().post(`/api/issues/${id}/status`).set(bearer(assistant)).send({ status: 'DONE', resolutionNotes: 'Replaced the capacitor', attachments: [{ ...MEDIA, url: 'https://picsum.photos/seed/fixed/800/600' }] });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'DONE', resolutionNotes: 'Replaced the capacitor' });
    expect(done.body.completedAt).toBeTruthy();
    expect(done.body.attachments.filter((a: { kind: string }) => a.kind === 'RESOLUTION')).toHaveLength(1);

    const seen = await api().get(`/api/issues/${id}`).set(bearer(student));
    expect(seen.body.status).toBe('DONE');
    expect(seen.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['YET_TO_START', 'IN_PROGRESS', 'DONE']);
    expect(seen.body.history[1].changedBy.id).toBe(t.assistantA.id);

    const audit = await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' }, select: { action: true } });
    expect(audit.map((a) => a.action)).toEqual(['ISSUE_ASSIGNED', 'ISSUE_STATUS_CHANGED', 'ISSUE_STATUS_CHANGED']);
  });

  it('supports reassignment and records both actions', async () => {
    const t = await makeTenant();
    const admin = await tokenFor(t.admin);
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    await api().post(`/api/issues/${issue.id}/assign`).set(bearer(admin)).send({ assigneeId: t.assistantA.id }).expect(200);
    const same = await api().post(`/api/issues/${issue.id}/assign`).set(bearer(admin)).send({ assigneeId: t.assistantA.id });
    expect(same.status).toBe(409);
    await api().post(`/api/issues/${issue.id}/assign`).set(bearer(admin)).send({ assigneeId: t.assistantB.id }).expect(200);
    const actions = await prisma.auditLog.findMany({ where: { entityId: issue.id }, select: { action: true }, orderBy: { createdAt: 'asc' } });
    expect(actions.map((a) => a.action)).toEqual(['ISSUE_ASSIGNED', 'ISSUE_REASSIGNED']);
    // the previous assistant lost access
    expect((await api().get(`/api/issues/${issue.id}`).set(bearer(await tokenFor(t.assistantA)))).status).toBe(404);
  });

  it('rejects invalid assignees (other hostel, student, non-approved assistant)', async () => {
    const t = await makeTenant();
    const other = await makeTenant();
    const admin = await tokenFor(t.admin);
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    for (const assigneeId of [other.assistantA.id, t.studentA.id, '00000000-0000-4000-8000-000000000000']) {
      const res = await api().post(`/api/issues/${issue.id}/assign`).set(bearer(admin)).send({ assigneeId });
      expect(res.status, assigneeId).toBe(400);
    }
    await prisma.user.update({ where: { id: t.assistantB.id }, data: { status: 'PENDING' } });
    expect((await api().post(`/api/issues/${issue.id}/assign`).set(bearer(admin)).send({ assigneeId: t.assistantB.id })).status).toBe(400);
  });

  it('rejects invalid status transitions', async () => {
    const t = await makeTenant();
    const assistant = await tokenFor(t.assistantA);
    const fresh = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id });
    const skip = await api().post(`/api/issues/${fresh.id}/status`).set(bearer(assistant)).send({ status: 'DONE', resolutionNotes: 'x', attachments: [MEDIA] });
    expect(skip.status).toBe(422);
    expect(skip.body.error.code).toBe('INVALID_TRANSITION');
    const finished = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id, status: 'DONE' });
    expect((await api().post(`/api/issues/${finished.id}/status`).set(bearer(assistant)).send({ status: 'IN_PROGRESS' })).status).toBe(422);
    expect((await api().post(`/api/issues/${finished.id}/status`).set(bearer(assistant)).send({ status: 'YET_TO_START' })).status).toBe(400);
    const again = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id, status: 'IN_PROGRESS' });
    expect((await api().post(`/api/issues/${again.id}/status`).set(bearer(assistant)).send({ status: 'IN_PROGRESS' })).status).toBe(422);
  });

  it('prevents lost updates: concurrent identical transitions yield a single success', async () => {
    const t = await makeTenant();
    const assistant = await tokenFor(t.assistantA);
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id });
    const results = await Promise.all(Array.from({ length: 4 }, () => api().post(`/api/issues/${issue.id}/status`).set(bearer(assistant)).send({ status: 'IN_PROGRESS' })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.map((r) => `${r.status}:${r.body?.error?.code ?? ''}`).sort().join(' ')).toMatch(/^200: (409:CONCURRENT_MODIFICATION|422:INVALID_TRANSITION)( (409:CONCURRENT_MODIFICATION|422:INVALID_TRANSITION)){2}$/);
    expect(await prisma.issueStatusHistory.count({ where: { issueId: issue.id, toStatus: 'IN_PROGRESS' } })).toBe(1);
  });

  it('assistant can add resolution media before completion; kinds are role-restricted', async () => {
    const t = await makeTenant();
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id, status: 'IN_PROGRESS' });
    const assistant = await tokenFor(t.assistantA);
    const student = await tokenFor(t.studentA);
    expect((await api().post(`/api/issues/${issue.id}/attachments`).set(bearer(assistant)).send({ ...MEDIA, kind: 'RESOLUTION' })).status).toBe(201);
    expect((await api().post(`/api/issues/${issue.id}/attachments`).set(bearer(assistant)).send({ ...MEDIA, kind: 'REFERENCE' })).status).toBe(403);
    expect((await api().post(`/api/issues/${issue.id}/attachments`).set(bearer(student)).send({ ...MEDIA, kind: 'REFERENCE' })).status).toBe(201);
    expect((await api().post(`/api/issues/${issue.id}/attachments`).set(bearer(student)).send({ ...MEDIA, kind: 'RESOLUTION' })).status).toBe(403);
    const done = await api().post(`/api/issues/${issue.id}/status`).set(bearer(assistant)).send({ status: 'DONE', resolutionNotes: 'All good now' });
    expect(done.status).toBe(200); // evidence was attached earlier
  });
});

describe('validation and media URL safety', () => {
  it('rejects invalid issue payloads', async () => {
    const t = await makeTenant();
    const token = await tokenFor(t.studentA);
    for (const bad of [{ title: 'x' }, { category: 'MAGIC' }, { priority: 'EXTREME' }, { description: 'short' }]) {
      expect((await api().post('/api/issues').set(bearer(token)).send(newIssue(bad))).status).toBe(400);
    }
  });

  it.each(['http://example.com/a.png', 'https://localhost/a.png', 'https://169.254.169.254/x', 'javascript:alert(1)', 'https://u:p@example.com/a.png'])(
    'rejects unsafe media URL %s',
    async (url) => {
      const t = await makeTenant();
      const res = await api().post('/api/issues').set(bearer(await tokenFor(t.studentA))).send(newIssue({ attachments: [{ url, mediaType: 'IMAGE' }] }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_MEDIA_URL');
      expect(await prisma.issue.count({ where: { reporterId: t.studentA.id } })).toBe(0);
    },
  );

  it('upload signatures are unavailable in external mode', async () => {
    const t = await makeTenant();
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    const res = await api().post(`/api/issues/${issue.id}/media/signature`).set(bearer(await tokenFor(t.studentA)));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPLOAD_NOT_SUPPORTED');
  });

  it('treats SQL injection payloads as data', async () => {
    const t = await makeTenant();
    const token = await tokenFor(t.studentA);
    const payload = "Robert'); DROP TABLE issues;--";
    const created = await api().post('/api/issues').set(bearer(token)).send(newIssue({ title: payload, description: `${payload} <script>alert(1)</script>` }));
    expect(created.status).toBe(201);
    expect(created.body.title).toBe(payload);
    const search = await api().get('/api/issues').query({ search: "' OR '1'='1" }).set(bearer(token));
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(0);
    const found = await api().get('/api/issues').query({ search: 'DROP TABLE' }).set(bearer(token));
    expect(found.body.data).toHaveLength(1);
    expect((await api().get('/api/issues').query({ sortBy: 'createdAt;DROP TABLE users' }).set(bearer(token))).status).toBe(400);
    expect(await prisma.issue.count()).toBeGreaterThan(0);
  });
});

describe('listing, filtering, sorting and pagination', () => {
  it('paginates correctly with stable ordering and totals', async () => {
    const t = await makeTenant();
    const admin = await tokenFor(t.admin);
    const base = Date.now();
    for (let i = 0; i < 7; i++) {
      await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, createdAt: new Date(base - i * 60_000), title: `Paged ${i}` });
    }
    const page1 = await api().get('/api/issues').query({ pageSize: 3, page: 1 }).set(bearer(admin));
    const page2 = await api().get('/api/issues').query({ pageSize: 3, page: 2 }).set(bearer(admin));
    const page3 = await api().get('/api/issues').query({ pageSize: 3, page: 3 }).set(bearer(admin));
    expect(page1.body.meta).toEqual({ page: 1, pageSize: 3, total: 7, totalPages: 3 });
    const titles = [...page1.body.data, ...page2.body.data, ...page3.body.data].map((i: { title: string }) => i.title);
    expect(titles).toEqual(Array.from({ length: 7 }, (_, i) => `Paged ${i}`));
    expect(page3.body.data).toHaveLength(1);
  });

  it('filters by status, priority, category and assistant', async () => {
    const t = await makeTenant();
    const admin = await tokenFor(t.admin);
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, status: 'DONE', category: 'PLUMBING', priority: 'URGENT', assigneeId: t.assistantA.id });
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, status: 'IN_PROGRESS', category: 'PLUMBING', priority: 'LOW', assigneeId: t.assistantB.id });
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id, status: 'YET_TO_START', category: 'INTERNET', priority: 'LOW' });
    const q = async (query: Record<string, string>) => (await api().get('/api/issues').query(query).set(bearer(admin))).body.meta.total as number;
    expect(await q({})).toBe(3);
    expect(await q({ status: 'DONE' })).toBe(1);
    expect(await q({ category: 'PLUMBING' })).toBe(2);
    expect(await q({ priority: 'LOW' })).toBe(2);
    expect(await q({ assigneeId: t.assistantB.id })).toBe(1);
    expect(await q({ unassigned: 'true' })).toBe(1);
    expect(await q({ category: 'PLUMBING', priority: 'LOW' })).toBe(1);
  });

  it('students see only their own issues', async () => {
    const t = await makeTenant();
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id });
    const res = await api().get('/api/issues').set(bearer(await tokenFor(t.studentA)));
    expect(res.body.meta.total).toBe(1);
  });
});
