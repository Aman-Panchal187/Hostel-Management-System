import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import type { AuthContext } from '../../shared/middleware/authenticate';
import { requireHostelId } from '../../shared/middleware/authenticate';
import { cached } from '../../shared/redis/cache';
import { fillDailySeries, percentage, roundHours, toStatusCounts } from './analytics.logic';
import type { HostelAnalyticsQuery, PlatformAnalyticsQuery } from './analytics.schemas';

const DEFAULT_RANGE_DAYS = 90;
const DAY_MS = 86_400_000;

interface Range {
  from: Date;
  to: Date;
}

function resolveRange(from?: Date, to?: Date): Range {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  return { from: start, to: end };
}

/** Composes the parameterized WHERE fragment. Every value is bound, never interpolated. */
function issueFilter(hostelId: string | null, range: Range, extra: { status?: string; category?: string; assigneeId?: string }): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`i.created_at >= ${range.from} AND i.created_at <= ${range.to}`];
  if (hostelId) parts.push(Prisma.sql`i.hostel_id = ${hostelId}`);
  if (extra.status) parts.push(Prisma.sql`i.status = ${extra.status}::"IssueStatus"`);
  if (extra.category) parts.push(Prisma.sql`i.category = ${extra.category}::"IssueCategory"`);
  if (extra.assigneeId) parts.push(Prisma.sql`i.assignee_id = ${extra.assigneeId}`);
  return Prisma.join(parts, ' AND ');
}

type CountRow = { key: string; count: number };
type DayRow = { day: string; count: number };

const countBy = (column: 'status' | 'category' | 'priority', where: Prisma.Sql) =>
  prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT i.${Prisma.raw(column)}::text AS key, COUNT(*)::int AS count
    FROM issues i WHERE ${where}
    GROUP BY 1 ORDER BY 2 DESC`);

const createdPerDay = (where: Prisma.Sql) =>
  prisma.$queryRaw<DayRow[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', i.created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
    FROM issues i WHERE ${where} GROUP BY 1 ORDER BY 1`);

const resolvedPerDay = (where: Prisma.Sql) =>
  prisma.$queryRaw<DayRow[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', i.completed_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
    FROM issues i WHERE ${where} AND i.completed_at IS NOT NULL GROUP BY 1 ORDER BY 1`);

export async function hostelAnalytics(actor: AuthContext, query: HostelAnalyticsQuery) {
  const hostelId = requireHostelId(actor);
  const range = resolveRange(query.from, query.to);
  const filters = { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10), status: query.status, category: query.category, assigneeId: query.assigneeId };
  return cached('analytics', { kind: 'hostel', hostelId }, filters, async () => {
    const where = issueFilter(hostelId, range, query);
    const [statusRows, categoryRows, priorityRows, created, resolved, assistantRows, pendingApprovals] = await Promise.all([
      countBy('status', where),
      countBy('category', where),
      countBy('priority', where),
      createdPerDay(where),
      resolvedPerDay(where),
      prisma.$queryRaw<{ id: string; name: string; assigned: number; done: number; in_progress: number; avg_hours: number | null }[]>(Prisma.sql`
        SELECT u.id, u.name,
               COUNT(i.id)::int AS assigned,
               COUNT(i.id) FILTER (WHERE i.status = 'DONE')::int AS done,
               COUNT(i.id) FILTER (WHERE i.status = 'IN_PROGRESS')::int AS in_progress,
               AVG(EXTRACT(EPOCH FROM (i.completed_at - i.created_at)) / 3600.0)
                 FILTER (WHERE i.status = 'DONE' AND i.completed_at IS NOT NULL)::float8 AS avg_hours
        FROM hostel_memberships m
        JOIN users u ON u.id = m.user_id AND u.status = 'APPROVED'
        LEFT JOIN issues i ON i.assignee_id = u.id AND ${where}
        WHERE m.hostel_id = ${hostelId} AND m.role = 'ASSISTANT'
        GROUP BY u.id, u.name ORDER BY u.name`),
      prisma.approvalRequest.count({ where: { hostelId, status: 'PENDING', type: { in: ['ASSISTANT_REGISTRATION', 'STUDENT_REGISTRATION'] } } }),
    ]);
    const statusCounts = toStatusCounts(statusRows.map((r) => ({ status: r.key, count: r.count })));
    const avgRows = assistantRows.filter((r) => r.avg_hours !== null && r.done > 0);
    const totalDone = avgRows.reduce((sum, r) => sum + r.done, 0);
    const weightedHours = avgRows.reduce((sum, r) => sum + (r.avg_hours ?? 0) * r.done, 0);
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      kpis: {
        total: statusCounts.total,
        yetToStart: statusCounts.YET_TO_START,
        inProgress: statusCounts.IN_PROGRESS,
        done: statusCounts.DONE,
        completionRate: percentage(statusCounts.DONE, statusCounts.total),
        avgResolutionHours: totalDone > 0 ? roundHours(weightedHours / totalDone) : null,
        pendingApprovals,
      },
      byStatus: statusRows.map((r) => ({ name: r.key, value: r.count })),
      byCategory: categoryRows.map((r) => ({ name: r.key, value: r.count })),
      byPriority: priorityRows.map((r) => ({ name: r.key, value: r.count })),
      createdOverTime: fillDailySeries(created, range.from, range.to),
      resolvedOverTime: fillDailySeries(resolved, range.from, range.to),
      assistants: assistantRows.map((r) => ({
        id: r.id,
        name: r.name,
        assigned: r.assigned,
        inProgress: r.in_progress,
        completed: r.done,
        completionRate: percentage(r.done, r.assigned),
        avgResolutionHours: roundHours(r.avg_hours),
      })),
    };
  });
}

export async function platformAnalytics(query: PlatformAnalyticsQuery) {
  const range = resolveRange(query.from, query.to);
  const filters = { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10), hostelId: query.hostelId, status: query.status };
  return cached('analytics', { kind: 'platform' }, filters, async () => {
    const where = issueFilter(query.hostelId ?? null, range, { status: query.status });
    const [hostelRows, peopleRows, statusRows, created, perHostel] = await Promise.all([
      prisma.hostel.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.$queryRaw<{ role: string; count: number }[]>(Prisma.sql`
        SELECT role::text AS role, COUNT(*)::int AS count FROM users
        WHERE status = 'APPROVED' AND role IN ('STUDENT', 'ASSISTANT') GROUP BY role`),
      countBy('status', where),
      createdPerDay(where),
      prisma.$queryRaw<{ id: string; name: string; city: string; total: number; yet: number; progress: number; done: number; avg_hours: number | null }[]>(Prisma.sql`
        SELECT h.id, h.name, h.city,
               COUNT(i.id)::int AS total,
               COUNT(i.id) FILTER (WHERE i.status = 'YET_TO_START')::int AS yet,
               COUNT(i.id) FILTER (WHERE i.status = 'IN_PROGRESS')::int AS progress,
               COUNT(i.id) FILTER (WHERE i.status = 'DONE')::int AS done,
               AVG(EXTRACT(EPOCH FROM (i.completed_at - i.created_at)) / 3600.0)
                 FILTER (WHERE i.status = 'DONE' AND i.completed_at IS NOT NULL)::float8 AS avg_hours
        FROM hostels h
        LEFT JOIN issues i ON i.hostel_id = h.id AND ${where}
        WHERE h.status = 'APPROVED' ${query.hostelId ? Prisma.sql`AND h.id = ${query.hostelId}` : Prisma.empty}
        GROUP BY h.id, h.name, h.city ORDER BY total DESC, h.name`),
    ]);
    const hostelCount = (status: string) => hostelRows.find((r) => r.status === status)?._count._all ?? 0;
    const peopleCount = (role: string) => peopleRows.find((r) => r.role === role)?.count ?? 0;
    const statusCounts = toStatusCounts(statusRows.map((r) => ({ status: r.key, count: r.count })));
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      kpis: {
        totalHostels: hostelCount('APPROVED') + hostelCount('PENDING') + hostelCount('REJECTED'),
        approvedHostels: hostelCount('APPROVED'),
        pendingHostels: hostelCount('PENDING'),
        rejectedHostels: hostelCount('REJECTED'),
        students: peopleCount('STUDENT'),
        assistants: peopleCount('ASSISTANT'),
        totalIssues: statusCounts.total,
        completionRate: percentage(statusCounts.DONE, statusCounts.total),
      },
      byStatus: statusRows.map((r) => ({ name: r.key, value: r.count })),
      createdOverTime: fillDailySeries(created, range.from, range.to),
      hostels: perHostel.map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        total: r.total,
        yetToStart: r.yet,
        inProgress: r.progress,
        done: r.done,
        completionRate: percentage(r.done, r.total),
        avgResolutionHours: roundHours(r.avg_hours),
      })),
    };
  });
}

/** Personal summary for assistants and students (their own issues only). */
export async function personalSummary(actor: AuthContext) {
  const hostelId = requireHostelId(actor);
  const ownership: Prisma.IssueWhereInput = actor.role === 'ASSISTANT' ? { assigneeId: actor.userId } : { reporterId: actor.userId };
  const grouped = await prisma.issue.groupBy({ by: ['status'], where: { hostelId, ...ownership }, _count: { _all: true } });
  const counts = toStatusCounts(grouped.map((g) => ({ status: g.status, count: g._count._all })));
  return {
    total: counts.total,
    yetToStart: counts.YET_TO_START,
    inProgress: counts.IN_PROGRESS,
    done: counts.DONE,
    open: counts.YET_TO_START + counts.IN_PROGRESS,
  };
}
