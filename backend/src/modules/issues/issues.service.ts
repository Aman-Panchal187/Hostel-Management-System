import { randomUUID } from 'node:crypto';
import type { AttachmentKind, Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import type { TxClient } from '../../shared/database/prisma';
import { AppError } from '../../shared/errors/app-error';
import type { AuthContext } from '../../shared/middleware/authenticate';
import { requireHostelId } from '../../shared/middleware/authenticate';
import { invalidateScopes } from '../../shared/redis/cache';
import { pageArgs, pageMeta } from '../../shared/utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { getMediaProvider } from '../media/media.factory';
import type { MediaInput } from '../media/media.types';
import { assertAssignable, assertCompletionEvidence, assertTransition } from './issue-rules';
import type { AttachmentInput, CreateIssueInput, ListIssuesQuery, StatusInput } from './issues.schemas';

const MAX_ATTACHMENTS_PER_ISSUE = 12;

const listSelect = {
  id: true,
  title: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  assignedAt: true,
  startedAt: true,
  completedAt: true,
  reporter: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  room: { select: { number: true } },
} satisfies Prisma.IssueSelect;

const detailSelect = {
  ...listSelect,
  description: true,
  resolutionNotes: true,
  updatedAt: true,
  attachments: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, mediaType: true, url: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
  },
  history: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true, changedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.IssueSelect;

/** Tenant + role scoping for every issue read. PLATFORM_ADMIN has no issue-level access. */
export function issueScope(actor: AuthContext): Prisma.IssueWhereInput {
  const hostelId = requireHostelId(actor);
  switch (actor.role) {
    case 'HOSTEL_ADMIN':
      return { hostelId };
    case 'STUDENT':
      return { hostelId, reporterId: actor.userId };
    case 'ASSISTANT':
      return { hostelId, assigneeId: actor.userId };
    default:
      throw AppError.forbidden('Platform administrators cannot access hostel issues', 'INSUFFICIENT_ROLE');
  }
}

const invalidate = (hostelId: string) => invalidateScopes({ kind: 'platform' }, { kind: 'hostel', hostelId });

function resolveMedia(items: MediaInput[], hostelId: string, issueId?: string) {
  const provider = getMediaProvider();
  return items.map((item) => provider.resolve(item, { hostelId, issueId }));
}

export async function createIssue(actor: AuthContext, input: CreateIssueInput) {
  const hostelId = requireHostelId(actor);
  let roomId: string | null = null;
  if (actor.role === 'STUDENT') {
    roomId = actor.roomId;
  } else if (input.roomId) {
    const room = await prisma.room.findFirst({ where: { id: input.roomId, hostelId }, select: { id: true } });
    if (!room) throw AppError.badRequest('Room not found in your hostel', 'ROOM_NOT_FOUND');
    roomId = room.id;
  }
  const id = randomUUID();
  const media = resolveMedia(input.attachments, hostelId);

  await prisma.$transaction(async (tx) => {
    await tx.issue.create({
      data: {
        id,
        hostelId,
        roomId,
        reporterId: actor.userId,
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
      },
    });
    await tx.issueStatusHistory.create({ data: { issueId: id, fromStatus: null, toStatus: 'YET_TO_START', changedById: actor.userId, note: 'Issue created' } });
    if (media.length > 0) {
      await tx.issueAttachment.createMany({
        data: media.map((m) => ({ issueId: id, uploadedById: actor.userId, kind: 'REFERENCE' as const, mediaType: m.mediaType, url: m.url, providerAssetId: m.providerAssetId })),
      });
    }
  });
  await invalidate(hostelId);
  return getIssue(actor, id);
}

export async function listIssues(actor: AuthContext, query: ListIssuesQuery) {
  const where: Prisma.IssueWhereInput = {
    ...issueScope(actor),
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.assigneeId && actor.role === 'HOSTEL_ADMIN' ? { assigneeId: query.assigneeId } : {}),
    ...(query.unassigned && actor.role === 'HOSTEL_ADMIN' ? { assigneeId: null } : {}),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      select: listSelect,
      orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
      ...pageArgs(query),
    }),
    prisma.issue.count({ where }),
  ]);
  return { data, meta: pageMeta(query.page, query.pageSize, total) };
}

export async function getIssue(actor: AuthContext, id: string) {
  const issue = await prisma.issue.findFirst({ where: { id, ...issueScope(actor) }, select: detailSelect });
  if (!issue) throw AppError.notFound('Issue not found');
  return issue;
}

export async function assignIssue(actor: AuthContext, id: string, assigneeId: string) {
  const hostelId = requireHostelId(actor);
  await prisma.$transaction(async (tx) => {
    const issue = await tx.issue.findFirst({
      where: { id, hostelId },
      select: { id: true, status: true, assigneeId: true, version: true },
    });
    if (!issue) throw AppError.notFound('Issue not found');
    assertAssignable(issue.status);
    if (issue.assigneeId === assigneeId) throw AppError.conflict('Issue is already assigned to this assistant', 'ALREADY_ASSIGNED');

    const assistant = await tx.hostelMembership.findFirst({
      where: { userId: assigneeId, hostelId, role: 'ASSISTANT', user: { status: 'APPROVED' } },
      select: { userId: true },
    });
    if (!assistant) throw AppError.badRequest('Assignee must be an approved assistant of your hostel', 'INVALID_ASSIGNEE');

    // Optimistic lock: a concurrent change bumps version and this update then matches nothing.
    const updated = await tx.issue.updateMany({
      where: { id, hostelId, version: issue.version },
      data: { assigneeId, assignedAt: new Date(), version: { increment: 1 } },
    });
    if (updated.count !== 1) throw AppError.conflict('Issue was modified by someone else; reload and retry', 'CONCURRENT_MODIFICATION');

    await recordAudit(tx, {
      hostelId,
      actorId: actor.userId,
      action: issue.assigneeId ? 'ISSUE_REASSIGNED' : 'ISSUE_ASSIGNED',
      entityType: 'Issue',
      entityId: id,
      metadata: { fromAssigneeId: issue.assigneeId, toAssigneeId: assigneeId },
    });
  });
  await invalidate(hostelId);
  return getIssue(actor, id);
}

async function countResolutionAttachments(tx: TxClient, issueId: string) {
  return tx.issueAttachment.count({ where: { issueId, kind: 'RESOLUTION' } });
}

export async function changeStatus(actor: AuthContext, id: string, input: StatusInput) {
  const hostelId = requireHostelId(actor);
  await prisma.$transaction(async (tx) => {
    // Assistants only ever see issues assigned to them; anything else is "not found".
    const issue = await tx.issue.findFirst({
      where: { id, hostelId, assigneeId: actor.userId },
      select: { id: true, status: true, version: true, startedAt: true },
    });
    if (!issue) throw AppError.notFound('Issue not found');
    assertTransition(issue.status, input.status);

    const media = resolveMedia(input.attachments, hostelId, id);
    if (input.status === 'DONE') {
      assertCompletionEvidence(input.resolutionNotes, (await countResolutionAttachments(tx, id)) + media.length);
    }
    const now = new Date();
    const updated = await tx.issue.updateMany({
      where: { id, hostelId, assigneeId: actor.userId, status: issue.status, version: issue.version },
      data: {
        status: input.status,
        version: { increment: 1 },
        ...(input.status === 'IN_PROGRESS' ? { startedAt: now } : { completedAt: now, resolutionNotes: input.resolutionNotes, startedAt: issue.startedAt ?? now }),
      },
    });
    if (updated.count !== 1) throw AppError.conflict('Issue was modified by someone else; reload and retry', 'CONCURRENT_MODIFICATION');

    if (media.length > 0) {
      await tx.issueAttachment.createMany({
        data: media.map((m) => ({ issueId: id, uploadedById: actor.userId, kind: 'RESOLUTION' as const, mediaType: m.mediaType, url: m.url, providerAssetId: m.providerAssetId })),
      });
    }
    await tx.issueStatusHistory.create({
      data: { issueId: id, fromStatus: issue.status, toStatus: input.status, changedById: actor.userId, note: input.resolutionNotes ?? null },
    });
    await recordAudit(tx, {
      hostelId,
      actorId: actor.userId,
      action: 'ISSUE_STATUS_CHANGED',
      entityType: 'Issue',
      entityId: id,
      metadata: { from: issue.status, to: input.status },
    });
  });
  await invalidate(hostelId);
  return getIssue(actor, id);
}

/** Who may attach which kind of media to an issue, expressed as a scope + allowed kind. */
function attachmentRule(actor: AuthContext): { kind: AttachmentKind; extra: Prisma.IssueWhereInput } {
  switch (actor.role) {
    case 'STUDENT':
      return { kind: 'REFERENCE', extra: { reporterId: actor.userId } };
    case 'ASSISTANT':
      return { kind: 'RESOLUTION', extra: { assigneeId: actor.userId, status: { not: 'DONE' } } };
    case 'HOSTEL_ADMIN':
      return { kind: 'REFERENCE', extra: {} };
    default:
      throw AppError.forbidden('Your role cannot attach media', 'INSUFFICIENT_ROLE');
  }
}

async function findAttachableIssue(actor: AuthContext, id: string) {
  const hostelId = requireHostelId(actor);
  const rule = attachmentRule(actor);
  const issue = await prisma.issue.findFirst({ where: { id, hostelId, ...rule.extra }, select: { id: true } });
  if (!issue) throw AppError.notFound('Issue not found');
  return { hostelId, rule };
}

export async function addAttachment(actor: AuthContext, id: string, input: AttachmentInput) {
  const { hostelId, rule } = await findAttachableIssue(actor, id);
  if (input.kind !== rule.kind) {
    throw AppError.forbidden(`Your role may only add ${rule.kind.toLowerCase()} media`, 'ATTACHMENT_KIND_FORBIDDEN');
  }
  const media = getMediaProvider().resolve(input, { hostelId, issueId: id });
  const attachment = await prisma.$transaction(async (tx) => {
    const count = await tx.issueAttachment.count({ where: { issueId: id } });
    if (count >= MAX_ATTACHMENTS_PER_ISSUE) throw AppError.unprocessable('Attachment limit reached for this issue', 'ATTACHMENT_LIMIT');
    return tx.issueAttachment.create({
      data: { issueId: id, uploadedById: actor.userId, kind: rule.kind, mediaType: media.mediaType, url: media.url, providerAssetId: media.providerAssetId },
      select: { id: true, kind: true, mediaType: true, url: true, createdAt: true },
    });
  });
  return attachment;
}

export async function createUploadSignature(actor: AuthContext, id: string) {
  const { hostelId } = await findAttachableIssue(actor, id);
  const signature = getMediaProvider().createUploadSignature({ hostelId, issueId: id });
  if (!signature) throw AppError.badRequest('Direct uploads are disabled; provide an external HTTPS URL instead', 'UPLOAD_NOT_SUPPORTED');
  return signature;
}
