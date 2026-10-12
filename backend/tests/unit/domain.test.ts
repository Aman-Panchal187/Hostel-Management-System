import { describe, expect, it } from 'vitest';
import { canDecide } from '../../src/modules/approvals/approvals.service';
import { fillDailySeries, percentage, roundHours, toStatusCounts } from '../../src/modules/analytics/analytics.logic';
import {
  assertAssignable,
  assertCompletionEvidence,
  assertTransition,
  canTransition,
  resolutionHours,
} from '../../src/modules/issues/issue-rules';
import { buildCacheKey, hashFilters } from '../../src/shared/redis/cache';
import { listIssuesSchema } from '../../src/modules/issues/issues.schemas';

describe('issue status transitions', () => {
  it('allows only the forward lifecycle', () => {
    expect(canTransition('YET_TO_START', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'DONE')).toBe(true);
  });

  it.each([
    ['YET_TO_START', 'DONE'],
    ['IN_PROGRESS', 'YET_TO_START'],
    ['DONE', 'IN_PROGRESS'],
    ['DONE', 'YET_TO_START'],
    ['YET_TO_START', 'YET_TO_START'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrowError(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  it('requires notes and evidence to complete', () => {
    expect(() => assertCompletionEvidence('', 1)).toThrowError(expect.objectContaining({ code: 'RESOLUTION_NOTES_REQUIRED' }));
    expect(() => assertCompletionEvidence('   ', 1)).toThrowError(expect.objectContaining({ code: 'RESOLUTION_NOTES_REQUIRED' }));
    expect(() => assertCompletionEvidence('Fixed', 0)).toThrowError(expect.objectContaining({ code: 'RESOLUTION_EVIDENCE_REQUIRED' }));
    expect(() => assertCompletionEvidence('Fixed', 1)).not.toThrow();
  });

  it('blocks reassigning completed issues', () => {
    expect(() => assertAssignable('DONE')).toThrowError(expect.objectContaining({ code: 'ISSUE_ALREADY_DONE' }));
    expect(() => assertAssignable('IN_PROGRESS')).not.toThrow();
  });

  it('computes resolution duration in hours', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    expect(resolutionHours(created, new Date('2026-01-01T05:30:00Z'))).toBe(5.5);
    expect(resolutionHours(created, null)).toBeNull();
  });
});

describe('approval authorization rules', () => {
  const hostelA = 'a';
  it('platform admin decides only hostel registrations', () => {
    const actor = { role: 'PLATFORM_ADMIN', hostelId: null } as const;
    expect(canDecide(actor, { type: 'HOSTEL_REGISTRATION', hostelId: hostelA })).toBe(true);
    expect(canDecide(actor, { type: 'STUDENT_REGISTRATION', hostelId: hostelA })).toBe(false);
  });

  it('hostel admin decides only members of their own hostel', () => {
    const actor = { role: 'HOSTEL_ADMIN', hostelId: hostelA } as const;
    expect(canDecide(actor, { type: 'STUDENT_REGISTRATION', hostelId: hostelA })).toBe(true);
    expect(canDecide(actor, { type: 'ASSISTANT_REGISTRATION', hostelId: hostelA })).toBe(true);
    expect(canDecide(actor, { type: 'STUDENT_REGISTRATION', hostelId: 'b' })).toBe(false);
    expect(canDecide(actor, { type: 'HOSTEL_REGISTRATION', hostelId: hostelA })).toBe(false);
  });

  it('other roles never decide', () => {
    expect(canDecide({ role: 'STUDENT', hostelId: hostelA }, { type: 'STUDENT_REGISTRATION', hostelId: hostelA })).toBe(false);
    expect(canDecide({ role: 'ASSISTANT', hostelId: hostelA }, { type: 'STUDENT_REGISTRATION', hostelId: hostelA })).toBe(false);
  });
});

describe('analytics calculations', () => {
  it('computes percentages safely', () => {
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(5, 5)).toBe(100);
  });

  it('rounds hours and keeps null', () => {
    expect(roundHours(2.345)).toBe(2.3);
    expect(roundHours(null)).toBeNull();
  });

  it('builds status counts including missing statuses', () => {
    expect(toStatusCounts([{ status: 'DONE', count: 4 }, { status: 'IN_PROGRESS', count: 1 }])).toEqual({
      YET_TO_START: 0,
      IN_PROGRESS: 1,
      DONE: 4,
      total: 5,
    });
  });

  it('fills gaps in daily series', () => {
    const series = fillDailySeries([{ day: '2026-01-02', count: 3 }], new Date('2026-01-01T10:00:00Z'), new Date('2026-01-03T01:00:00Z'));
    expect(series).toEqual([
      { day: '2026-01-01', count: 0 },
      { day: '2026-01-02', count: 3 },
      { day: '2026-01-03', count: 0 },
    ]);
  });
});

describe('cache keys', () => {
  it('hash is stable regardless of key order and ignores empty values', () => {
    expect(hashFilters({ a: 1, b: 2 })).toBe(hashFilters({ b: 2, a: 1, c: undefined, d: '' }));
    expect(hashFilters({ a: 1 })).not.toBe(hashFilters({ a: 2 }));
  });

  it('namespaces by tenant and version', () => {
    const a = buildCacheKey('analytics', { kind: 'hostel', hostelId: 'h1' }, '3', { x: 1 });
    const b = buildCacheKey('analytics', { kind: 'hostel', hostelId: 'h2' }, '3', { x: 1 });
    expect(a).toMatch(/^analytics:hostel:h1:v3:[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(buildCacheKey('analytics', { kind: 'platform' }, '0')).toMatch(/^analytics:platform:v0:/);
  });
});

describe('list query validation (sorting allowlist)', () => {
  it('rejects unknown sort fields (no SQL injection through ORDER BY)', () => {
    expect(listIssuesSchema.safeParse({ sortBy: 'createdAt; DROP TABLE issues' }).success).toBe(false);
    expect(listIssuesSchema.safeParse({ sortBy: 'priority', sortDir: 'asc' }).success).toBe(true);
  });

  it('bounds page size', () => {
    expect(listIssuesSchema.safeParse({ pageSize: 1000 }).success).toBe(false);
    expect(listIssuesSchema.parse({}).pageSize).toBe(20);
  });
});
