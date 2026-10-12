import { createHmac, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../../config/env';
import { AppError } from '../errors/app-error';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.accessExpiry as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.role !== 'string') {
      throw AppError.unauthorized('Invalid token', 'INVALID_TOKEN');
    }
    return { sub: decoded.sub, role: decoded.role as Role };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) throw AppError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw AppError.unauthorized('Invalid token', 'INVALID_TOKEN');
  }
}

/** Opaque, high-entropy refresh token. Only its keyed hash is stored. */
export const generateRefreshToken = (): string => randomBytes(48).toString('base64url');

export const hashRefreshToken = (token: string): string =>
  createHmac('sha256', config.jwt.refreshSecret).update(token).digest('hex');
