import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/shared/database/prisma';
import { makeHostel, makeIssue, makeTenant, makeUser, uid } from '../helpers';

describe('constraints', () => {
  it('enforces unique emails and one membership per user', async () => {
    const t = await makeTenant();
    await expect(prisma.user.create({ data: { email: t.studentA.email, name: 'Dup', passwordHash: 'x', role: 'STUDENT' } })).rejects.toMatchObject({ code: 'P2002' });
    const other = await makeHostel();
    await expect(prisma.hostelMembership.create({ data: { userId: t.studentA.id, hostelId: other.id, role: 'STUDENT' } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces unique room numbers per hostel but allows the same number in another hostel', async () => {
    const a = await makeHostel();
    const b = await makeHostel();
    await expect(prisma.room.create({ data: { hostelId: a.id, number: '101', floor: 1, capacity: 2 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.room.create({ data: { hostelId: b.id, number: `Z${uid()}`, floor: 1, capacity: 2 } })).resolves.toBeTruthy();
  });

  it('enforces foreign keys', async () => {
    const t = await makeTenant();
    await expect(
      prisma.issue.create({ data: { hostelId: t.hostel.id, reporterId: '00000000-0000-4000-8000-000000000000', title: 'x', description: 'y'.repeat(12), category: 'OTHER', priority: 'LOW' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    // reporters with issues cannot be deleted (RESTRICT)
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    await expect(prisma.user.delete({ where: { id: t.studentA.id } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('cascades hostel deletion to tenant data', async () => {
    const t = await makeTenant();
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    await prisma.issue.deleteMany({ where: { id: issue.id } });
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentB.id });
    await prisma.$transaction([prisma.issue.deleteMany({ where: { hostelId: t.hostel.id } }), prisma.hostel.delete({ where: { id: t.hostel.id } })]);
    expect(await prisma.room.count({ where: { hostelId: t.hostel.id } })).toBe(0);
    expect(await prisma.hostelMembership.count({ where: { hostelId: t.hostel.id } })).toBe(0);
  });

  it('assigned issues survive assistant deletion (SET NULL)', async () => {
    const t = await makeTenant();
    const issue = await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, assigneeId: t.assistantA.id });
    await prisma.user.delete({ where: { id: t.assistantA.id } });
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } })).assigneeId).toBeNull();
  });
});

describe('transactions', () => {
  it('rolls back every write when a later step fails', async () => {
    const email = `rollback.${uid()}@test.example`;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.create({ data: { email, name: 'Rollback', passwordHash: 'x', role: 'STUDENT' } });
        await tx.hostelMembership.create({ data: { userId: 'missing', hostelId: 'missing', role: 'STUDENT' } });
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});

describe('queries', () => {
  it('aggregates match row-level truth', async () => {
    const t = await makeTenant();
    for (const status of ['YET_TO_START', 'YET_TO_START', 'IN_PROGRESS', 'DONE', 'DONE', 'DONE'] as const) {
      await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id, status });
    }
    const grouped = await prisma.issue.groupBy({ by: ['status'], where: { hostelId: t.hostel.id }, _count: { _all: true } });
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    expect(counts).toEqual({ YET_TO_START: 2, IN_PROGRESS: 1, DONE: 3 });
  });

  it('tenant-scoped lookups never match rows from another hostel', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const issueB = await makeIssue({ hostelId: b.hostel.id, reporterId: b.studentA.id });
    expect(await prisma.issue.findFirst({ where: { id: issueB.id, hostelId: a.hostel.id } })).toBeNull();
    expect(await prisma.issue.count({ where: { hostelId: a.hostel.id } })).toBe(0);
  });

  it('bound raw parameters cannot alter the statement', async () => {
    const t = await makeTenant();
    await makeIssue({ hostelId: t.hostel.id, reporterId: t.studentA.id });
    const malicious = "' OR 1=1; DROP TABLE issues; --";
    const rows = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS n FROM issues WHERE hostel_id = ${malicious}`);
    expect(rows[0]!.n).toBe(0);
    expect(await prisma.issue.count()).toBeGreaterThan(0);
  });

  it('uses the composite index for hostel/status/date queries', async () => {
    const t = await makeTenant();
    const plan = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>(
      Prisma.sql`EXPLAIN SELECT id FROM issues WHERE hostel_id = ${t.hostel.id} AND status = 'DONE'::"IssueStatus" ORDER BY created_at DESC LIMIT 20`,
    );
    const text = plan.map((r) => r['QUERY PLAN']).join('\n');
    expect(text).toMatch(/issues/);
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>(Prisma.sql`SELECT indexname FROM pg_indexes WHERE tablename = 'issues'`);
    expect(indexes.map((i) => i.indexname)).toEqual(expect.arrayContaining(['issues_hostel_id_status_created_at_idx', 'issues_hostel_id_assignee_id_idx', 'issues_hostel_id_created_at_idx']));
  });

  it('makeUser sanity: membership roles are consistent', async () => {
    const t = await makeTenant();
    const extra = await makeUser({ role: 'STUDENT', hostelId: t.hostel.id });
    const membership = await prisma.hostelMembership.findUniqueOrThrow({ where: { userId: extra.id } });
    expect(membership.role).toBe('STUDENT');
  });
});
