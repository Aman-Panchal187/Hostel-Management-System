import type { ApprovalStatus, ApprovalType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import { AppError } from '../../shared/errors/app-error';
import type { AuthContext } from '../../shared/middleware/authenticate';
import { requireHostelId } from '../../shared/middleware/authenticate';
import { invalidateScopes } from '../../shared/redis/cache';
import { pageArgs, pageMeta } from '../../shared/utils/pagination';
import { recordAudit } from '../audit/audit.service';

export type Decision = 'APPROVED' | 'REJECTED';

const HOSTEL_TYPE: ApprovalType = 'HOSTEL_REGISTRATION';

/** Which approval types an actor may see and decide. Pure, unit-tested. */
export function canDecide(actor: Pick<AuthContext, 'role' | 'hostelId'>, request: { type: ApprovalType; hostelId: string }): boolean {
  if (actor.role === 'PLATFORM_ADMIN') return request.type === HOSTEL_TYPE;
  if (actor.role === 'HOSTEL_ADMIN') return request.type !== HOSTEL_TYPE && actor.hostelId === request.hostelId;
  return false;
}

const auditAction = (type: ApprovalType, decision: Decision) => {
  const subject = { HOSTEL_REGISTRATION: 'HOSTEL', ASSISTANT_REGISTRATION: 'ASSISTANT', STUDENT_REGISTRATION: 'STUDENT' }[type];
  return `${subject}_${decision}`;
};

export async function listApprovals(
  actor: AuthContext,
  query: { page: number; pageSize: number; status?: ApprovalStatus; type?: ApprovalType },
) {
  const scope: Prisma.ApprovalRequestWhereInput =
    actor.role === 'PLATFORM_ADMIN'
      ? { type: HOSTEL_TYPE }
      : { hostelId: requireHostelId(actor), type: { in: ['ASSISTANT_REGISTRATION', 'STUDENT_REGISTRATION'] } };
  const where: Prisma.ApprovalRequestWhereInput = {
    ...scope,
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { AND: [{ type: query.type }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.approvalRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      ...pageArgs(query),
      select: {
        id: true,
        type: true,
        status: true,
        reason: true,
        createdAt: true,
        decidedAt: true,
        hostel: { select: { id: true, name: true, city: true, contactEmail: true, contactPhone: true } },
        user: {
          select: { id: true, name: true, email: true, role: true, membership: { select: { room: { select: { number: true } } } } },
        },
      },
    }),
    prisma.approvalRequest.count({ where }),
  ]);
  const data = rows.map(({ user, ...rest }) => ({
    ...rest,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, roomNumber: user.membership?.room?.number ?? null },
  }));
  return { data, meta: pageMeta(query.page, query.pageSize, total) };
}

export async function decide(actor: AuthContext, requestId: string, decision: Decision, reason?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({
      where: { id: requestId },
      select: { id: true, type: true, hostelId: true, userId: true },
    });
    // Out-of-scope requests look identical to missing ones to avoid leaking IDs across tenants.
    if (!request || !canDecide(actor, request)) throw AppError.notFound('Approval request not found');

    // Compare-and-set on PENDING makes concurrent duplicate decisions safe.
    const claimed = await tx.approvalRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: { status: decision, decidedById: actor.userId, decidedAt: new Date(), reason: reason ?? null },
    });
    if (claimed.count !== 1) throw AppError.conflict('This request has already been decided', 'ALREADY_DECIDED');

    await tx.user.update({ where: { id: request.userId }, data: { status: decision } });
    if (request.type === HOSTEL_TYPE) {
      await tx.hostel.update({ where: { id: request.hostelId }, data: { status: decision } });
    }
    if (decision === 'REJECTED') {
      await tx.refreshToken.updateMany({ where: { userId: request.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await recordAudit(tx, {
      hostelId: request.hostelId,
      actorId: actor.userId,
      action: auditAction(request.type, decision),
      entityType: 'ApprovalRequest',
      entityId: request.id,
      metadata: { subjectUserId: request.userId, reason: reason ?? null },
    });
    return request;
  });
  await invalidateScopes({ kind: 'platform' }, { kind: 'hostel', hostelId: result.hostelId });
  return { id: result.id, status: decision };
}
