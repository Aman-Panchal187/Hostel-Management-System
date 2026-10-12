import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import type { TxClient } from '../../shared/database/prisma';
import { pageArgs, pageMeta } from '../../shared/utils/pagination';
import type { AuthContext } from '../../shared/middleware/authenticate';

export interface AuditEntry {
  hostelId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

/** Writes an audit record inside the caller's transaction so it commits atomically with the change. */
export async function recordAudit(tx: TxClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      hostelId: entry.hostelId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
    },
  });
}

export async function listAudit(
  actor: AuthContext,
  query: { page: number; pageSize: number; entityType?: string; action?: string },
) {
  const where: Prisma.AuditLogWhereInput = {
    ...(actor.role === 'HOSTEL_ADMIN' ? { hostelId: actor.hostelId } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.action ? { action: query.action } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(query),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, name: true, role: true } },
        hostel: { select: { id: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(query.page, query.pageSize, total) };
}
