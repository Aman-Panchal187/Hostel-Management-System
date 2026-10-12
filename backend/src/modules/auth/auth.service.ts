import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { config } from '../../config/env';
import { prisma } from '../../shared/database/prisma';
import { AppError } from '../../shared/errors/app-error';
import { invalidateScopes } from '../../shared/redis/cache';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../shared/security/password';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../../shared/security/tokens';
import type {
  LoginInput,
  RegisterAssistantInput,
  RegisterHostelInput,
  RegisterStudentInput,
} from './auth.schemas';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  hostel: { id: string; name: string } | null;
  roomNumber: string | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export const PENDING_MESSAGE = 'Registration received. You will get access once it has been approved.';

async function withUniqueEmail<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}

export async function registerHostel(input: RegisterHostelInput) {
  const passwordHash = await hashPassword(input.password);
  const hostel = await withUniqueEmail(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, name: input.name, role: 'HOSTEL_ADMIN', status: 'PENDING' },
        select: { id: true },
      });
      const created = await tx.hostel.create({
        data: {
          name: input.hostelName,
          address: input.address,
          city: input.city,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          status: 'PENDING',
        },
        select: { id: true },
      });
      await tx.hostelMembership.create({ data: { userId: user.id, hostelId: created.id, role: 'HOSTEL_ADMIN' } });
      await tx.approvalRequest.create({ data: { type: 'HOSTEL_REGISTRATION', userId: user.id, hostelId: created.id } });
      return created;
    }),
  );
  await invalidateScopes({ kind: 'platform' });
  return { status: 'PENDING' as const, hostelId: hostel.id, message: PENDING_MESSAGE };
}

async function requireApprovedHostel(hostelId: string) {
  const hostel = await prisma.hostel.findFirst({ where: { id: hostelId, status: 'APPROVED' }, select: { id: true } });
  if (!hostel) throw AppError.badRequest('Selected hostel is not available for registration', 'HOSTEL_UNAVAILABLE');
}

export async function registerAssistant(input: RegisterAssistantInput) {
  await requireApprovedHostel(input.hostelId);
  const passwordHash = await hashPassword(input.password);
  await withUniqueEmail(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, name: input.name, role: 'ASSISTANT', status: 'PENDING' },
        select: { id: true },
      });
      await tx.hostelMembership.create({ data: { userId: user.id, hostelId: input.hostelId, role: 'ASSISTANT' } });
      await tx.approvalRequest.create({
        data: { type: 'ASSISTANT_REGISTRATION', userId: user.id, hostelId: input.hostelId },
      });
    }),
  );
  await invalidateScopes({ kind: 'hostel', hostelId: input.hostelId });
  return { status: 'PENDING' as const, message: PENDING_MESSAGE };
}

export async function registerStudent(input: RegisterStudentInput) {
  await requireApprovedHostel(input.hostelId);
  const room = await prisma.room.findUnique({
    where: { hostelId_number: { hostelId: input.hostelId, number: input.roomNumber } },
    select: { id: true },
  });
  if (!room) throw AppError.badRequest('Room not found in the selected hostel', 'ROOM_NOT_FOUND');
  const passwordHash = await hashPassword(input.password);
  await withUniqueEmail(() =>
    prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, name: input.name, role: 'STUDENT', status: 'PENDING' },
        select: { id: true },
      });
      await tx.hostelMembership.create({
        data: { userId: user.id, hostelId: input.hostelId, role: 'STUDENT', roomId: room.id },
      });
      await tx.approvalRequest.create({
        data: { type: 'STUDENT_REGISTRATION', userId: user.id, hostelId: input.hostelId },
      });
    }),
  );
  await invalidateScopes({ kind: 'hostel', hostelId: input.hostelId });
  return { status: 'PENDING' as const, message: PENDING_MESSAGE };
}

const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  membership: {
    select: {
      hostel: { select: { id: true, name: true, status: true } },
      room: { select: { number: true } },
    },
  },
} satisfies Prisma.UserSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof sessionUserSelect }>;

function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hostel: user.membership ? { id: user.membership.hostel.id, name: user.membership.hostel.name } : null,
    roomNumber: user.membership?.room?.number ?? null,
  };
}

async function issueSession(user: UserRecord, familyId: string = randomUUID()): Promise<Session> {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + config.jwt.refreshTtlMs),
    },
  });
  return { accessToken: signAccessToken({ sub: user.id, role: user.role }), refreshToken, user: toSessionUser(user) };
}

function assertAccountUsable(user: UserRecord) {
  if (user.status === 'PENDING') throw AppError.forbidden('Your registration is awaiting approval', 'ACCOUNT_PENDING');
  if (user.status === 'REJECTED') throw AppError.forbidden('Your registration was rejected', 'ACCOUNT_REJECTED');
  if (user.role !== 'PLATFORM_ADMIN' && user.membership?.hostel.status !== 'APPROVED') {
    throw AppError.forbidden('Your hostel is not approved', 'HOSTEL_NOT_APPROVED');
  }
}

export async function login(input: LoginInput): Promise<Session> {
  const record = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...sessionUserSelect, passwordHash: true },
  });
  if (!record) {
    await verifyAgainstDummy(input.password);
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  const { passwordHash, ...user } = record;
  if (!(await verifyPassword(input.password, passwordHash))) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  assertAccountUsable(user);
  return issueSession(user);
}

/**
 * Rotates a refresh token. Presenting an already-rotated/revoked token signals
 * theft, so the entire token family is revoked.
 */
export async function refresh(presented: string | undefined): Promise<Session> {
  if (!presented) throw AppError.unauthorized('Missing refresh token', 'NO_REFRESH_TOKEN');
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presented) },
    select: { id: true, familyId: true, revokedAt: true, expiresAt: true, user: { select: sessionUserSelect } },
  });
  if (!stored) throw AppError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw AppError.unauthorized('Refresh token reuse detected', 'REFRESH_TOKEN_REUSED');
  }
  if (stored.expiresAt <= new Date()) throw AppError.unauthorized('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
  assertAccountUsable(stored.user);

  // Atomic claim: only one concurrent request can rotate this token.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count !== 1) throw AppError.unauthorized('Refresh token already used', 'REFRESH_TOKEN_REUSED');
  return issueSession(stored.user, stored.familyId);
}

export async function logout(presented: string | undefined): Promise<void> {
  if (!presented) return;
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presented) },
    select: { familyId: true },
  });
  if (stored) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export async function getProfile(userId: string): Promise<SessionUser> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: sessionUserSelect });
  return toSessionUser(user);
}
