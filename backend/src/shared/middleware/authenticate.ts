import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../database/prisma';
import { AppError } from '../errors/app-error';
import { verifyAccessToken } from '../security/tokens';
import { asyncHandler } from '../utils/async-handler';

export interface AuthContext {
  userId: string;
  role: Role;
  name: string;
  email: string;
  /** Tenant derived from membership in the database, never from client input. */
  hostelId: string | null;
  roomId: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

/**
 * Verifies the bearer token, then re-loads account state from the database so
 * rejected/pending accounts and unapproved hostels lose access immediately,
 * even while holding a still-valid JWT.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw AppError.unauthorized();
  const payload = verifyAccessToken(header.slice(7));

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      status: true,
      membership: { select: { hostelId: true, roomId: true, hostel: { select: { status: true } } } },
    },
  });
  if (!user) throw AppError.unauthorized('Account no longer exists', 'INVALID_TOKEN');
  if (user.status !== 'APPROVED') {
    throw AppError.forbidden(`Account is ${user.status.toLowerCase()}`, user.status === 'PENDING' ? 'ACCOUNT_PENDING' : 'ACCOUNT_REJECTED');
  }
  if (user.role !== 'PLATFORM_ADMIN') {
    if (!user.membership || user.membership.hostel.status !== 'APPROVED') {
      throw AppError.forbidden('Hostel is not approved', 'HOSTEL_NOT_APPROVED');
    }
  }
  req.auth = {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    hostelId: user.membership?.hostelId ?? null,
    roomId: user.membership?.roomId ?? null,
  };
  next();
});

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden('Your role cannot perform this action', 'INSUFFICIENT_ROLE'));
    return next();
  };

/** Guarantees a tenant is bound to the request and returns it for service calls. */
export function requireAuth(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

export function requireHostelId(auth: AuthContext): string {
  if (!auth.hostelId) throw AppError.forbidden('No hostel membership', 'NO_HOSTEL_MEMBERSHIP');
  return auth.hostelId;
}
