import { beforeAll, describe, expect, it } from 'vitest';
import { getRedis } from '../../src/shared/redis/redis';
import { api, bearer, makeIssue, makeTenant, MEDIA, platformAdmin, resetRedis, tokenFor } from '../helpers';

beforeAll(resetRedis);

const HOUR = 3_600_000;

async function seedHostelData() {
  const t = await makeTenant();
  const now = Date.now();
  // assistant A: 2 done (2h and 6h) + 1 in progress; assistant B: 1 done (10h); 2 unassigned
  await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id, status: 'DONE', category: 'PLUMBING', priority: 'HIGH', createdAt: new Date(now - 20 * HOUR), completedAt: new Date(now - 18 * HOUR) });
  await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id, status: 'DONE', category: 'PLUMBING', priority: 'LOW', createdAt: new Date(now - 30 * HOUR), completedAt: new Date(now - 24 * HOUR) });
  await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id, assigneeId: t.assistantA.id, status: 'IN_PROGRESS', category: 'INTERNET', priority: 'URGENT' });
  await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id, assigneeId: t.assistantB.id, status: 'DONE', category: 'ELECTRICAL', priority: 'MEDIUM', createdAt: new Date(now - 40 * HOUR), completedAt: new Date(now - 30 * HOUR) });
  await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id, status: 'YET_TO_START', category: 'ELECTRICAL', priority: 'MEDIUM' });
  await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id, status: 'YET_TO_START', category: 'OTHER', priority: 'LOW' });
  return t;
}

describe('hostel analytics', () => {
  it('computes KPIs, breakdowns and assistant performance from the database', async () => {
    const t = await seedHostelData();
    const res = await api().get('/api/analytics/hostel').set(bearer(await tokenFor(t.admin)));
    expect(res.status).toBe(200);
    expect(res.body.kpis).toMatchObject({ total: 6, yetToStart: 2, inProgress: 1, done: 3, completionRate: 50 });
    expect(res.body.kpis.avgResolutionHours).toBe(6); // (2 + 6 + 10) / 3
    const byCategory = Object.fromEntries(res.body.byCategory.map((c: { name: string; value: number }) => [c.name, c.value]));
    expect(byCategory).toMatchObject({ PLUMBING: 2, ELECTRICAL: 2, INTERNET: 1, OTHER: 1 });
    const byPriority = Object.fromEntries(res.body.byPriority.map((c: { name: string; value: number }) => [c.name, c.value]));
    expect(byPriority).toMatchObject({ HIGH: 1, URGENT: 1, LOW: 2, MEDIUM: 2 });
    const a = res.body.assistants.find((x: { id: string }) => x.id === t.assistantA.id);
    const b = res.body.assistants.find((x: { id: string }) => x.id === t.assistantB.id);
    expect(a).toMatchObject({ assigned: 3, completed: 2, inProgress: 1, avgResolutionHours: 4 });
    expect(b).toMatchObject({ assigned: 1, completed: 1, avgResolutionHours: 10 });
    expect(res.body.createdOverTime.reduce((s: number, d: { count: number }) => s + d.count, 0)).toBe(6);
    expect(res.body.resolvedOverTime.reduce((s: number, d: { count: number }) => s + d.count, 0)).toBe(3);
  });

  it('applies status, category, assistant and date filters', async () => {
    const t = await seedHostelData();
    const token = await tokenFor(t.admin);
    const get = async (query: Record<string, string>) => (await api().get('/api/analytics/hostel').query(query).set(bearer(token))).body;
    expect((await get({ status: 'DONE' })).kpis.total).toBe(3);
    expect((await get({ category: 'PLUMBING' })).kpis.total).toBe(2);
    expect((await get({ assigneeId: t.assistantB.id })).kpis.total).toBe(1);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await get({ from: future })).kpis.total).toBe(0);
    const bad = await api().get('/api/analytics/hostel').query({ from: '2026-02-01', to: '2026-01-01' }).set(bearer(token));
    expect(bad.status).toBe(400);
    expect((await api().get('/api/analytics/hostel').query({ category: "x'; DROP TABLE issues;--" }).set(bearer(token))).status).toBe(400);
  });

  it('is cached in Redis and invalidated by issue changes', async () => {
    const t = await seedHostelData();
    const token = await tokenFor(t.admin);
    const first = await api().get('/api/analytics/hostel').set(bearer(token));
    const keys = await getRedis().keys(`analytics:hostel:${t.hostel.id}:*`);
    expect(keys.length).toBe(1);
    expect((await getRedis().ttl(keys[0]!)) > 0).toBe(true);

    // direct DB write bypasses invalidation, so the cached value is served
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    const cachedRes = await api().get('/api/analytics/hostel').set(bearer(token));
    expect(cachedRes.body.kpis.total).toBe(first.body.kpis.total);

    // API write bumps the tenant version and the next read is fresh
    await api().post('/api/issues').set(bearer(await tokenFor(t.studentA))).send({ title: 'Cache bust', description: 'Creating an issue through the API', category: 'OTHER' }).expect(201);
    const fresh = await api().get('/api/analytics/hostel').set(bearer(token));
    expect(fresh.body.kpis.total).toBe(first.body.kpis.total + 2);
  });

  it('cache keys are tenant scoped: hostels never share cached data', async () => {
    const a = await seedHostelData();
    const b = await makeTenant();
    const ra = await api().get('/api/analytics/hostel').set(bearer(await tokenFor(a.admin)));
    const rb = await api().get('/api/analytics/hostel').set(bearer(await tokenFor(b.admin)));
    expect(ra.body.kpis.total).toBe(6);
    expect(rb.body.kpis.total).toBe(0);
  });

  it('reflects status changes immediately after the assistant completes an issue', async () => {
    const t = await makeTenant();
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id, status: 'IN_PROGRESS' });
    const admin = await tokenFor(t.admin);
    expect((await api().get('/api/analytics/hostel').set(bearer(admin))).body.kpis.done).toBe(0);
    await api().post(`/api/issues/${issue.id}/status`).set(bearer(await tokenFor(t.assistantA))).send({ status: 'DONE', resolutionNotes: 'Fixed', attachments: [MEDIA] }).expect(200);
    expect((await api().get('/api/analytics/hostel').set(bearer(admin))).body.kpis).toMatchObject({ done: 1, inProgress: 0, completionRate: 100 });
  });
});

describe('platform and personal analytics', () => {
  it('platform analytics aggregates across hostels', async () => {
    const admin = await tokenFor(await platformAdmin());
    const before = (await api().get('/api/analytics/platform').set(bearer(admin))).body;
    const t = await seedHostelData();
    // platform cache is invalidated by API writes only; trigger one
    await api().post('/api/issues').set(bearer(await tokenFor(t.studentA))).send({ title: 'Bump platform cache', description: 'Triggers cache invalidation', category: 'OTHER' }).expect(201);
    const after = (await api().get('/api/analytics/platform').set(bearer(admin))).body;
    expect(after.kpis.totalIssues - before.kpis.totalIssues).toBe(7);
    expect(after.kpis.approvedHostels - before.kpis.approvedHostels).toBe(1);
    expect(after.kpis.students - before.kpis.students).toBe(2);
    expect(after.kpis.assistants - before.kpis.assistants).toBe(2);
    const row = after.hostels.find((h: { id: string }) => h.id === t.hostel.id);
    expect(row).toMatchObject({ total: 7, done: 3, inProgress: 1, yetToStart: 3 });
    const filtered = (await api().get('/api/analytics/platform').query({ hostelId: t.hostel.id }).set(bearer(admin))).body;
    expect(filtered.kpis.totalIssues).toBe(7);
    expect(filtered.hostels).toHaveLength(1);
  });

  it('personal summaries are scoped to the user', async () => {
    const t = await makeTenant();
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id, status: 'DONE' });
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantB.id, status: 'IN_PROGRESS' });
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id });
    const student = await api().get('/api/analytics/me').set(bearer(await tokenFor(t.studentA)));
    expect(student.body).toEqual({ total: 2, yetToStart: 0, inProgress: 1, done: 1, open: 1 });
    const assistant = await api().get('/api/analytics/me').set(bearer(await tokenFor(t.assistantA)));
    expect(assistant.body).toMatchObject({ total: 1, done: 1 });
  });
});
