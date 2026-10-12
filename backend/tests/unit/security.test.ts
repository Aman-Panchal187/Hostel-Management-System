import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../../src/config/env';
import { hashPassword, verifyPassword } from '../../src/shared/security/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/shared/security/tokens';
import { loginSchema, passwordSchema, registerStudentSchema } from '../../src/modules/auth/auth.schemas';

describe('password hashing', () => {
  it('hashes with bcrypt and verifies', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    expect(hash).not.toContain('Sup3rSecret');
    expect(hash.startsWith('$2')).toBe(true);
    expect(await verifyPassword('Sup3rSecret!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces different hashes for the same password (salted)', async () => {
    expect(await hashPassword('Same1234')).not.toBe(await hashPassword('Same1234'));
  });
});

describe('access tokens', () => {
  it('round-trips subject and role', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'STUDENT' });
    expect(verifyAccessToken(token)).toEqual({ sub: 'user-1', role: 'STUDENT' });
  });

  it('rejects expired tokens with TOKEN_EXPIRED', () => {
    const token = jwt.sign({ sub: 'u', role: 'STUDENT' }, config.jwt.accessSecret, { expiresIn: -10 });
    expect(() => verifyAccessToken(token)).toThrowError(expect.objectContaining({ code: 'TOKEN_EXPIRED', status: 401 }));
  });

  it('rejects tokens signed with a different secret', () => {
    const token = jwt.sign({ sub: 'u', role: 'STUDENT' }, 'another-secret-another-secret-another');
    expect(() => verifyAccessToken(token)).toThrowError(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('rejects alg=none tokens', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'u', role: 'PLATFORM_ADMIN' })).toString('base64url');
    expect(() => verifyAccessToken(`${header}.${body}.`)).toThrowError(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('rejects garbage', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrowError(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });
});

describe('refresh tokens', () => {
  it('generates unique high-entropy tokens', () => {
    const a = generateRefreshToken();
    expect(a.length).toBeGreaterThanOrEqual(60);
    expect(a).not.toBe(generateRefreshToken());
  });

  it('stores only a deterministic keyed hash', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toContain(token);
    expect(hashRefreshToken(token)).toHaveLength(64);
  });
});

describe('input validation', () => {
  it('normalizes login email', () => {
    expect(loginSchema.parse({ email: '  USER@Example.COM ', password: 'x' }).email).toBe('user@example.com');
  });

  it.each(['short1', 'alllettersonly', '12345678'])('rejects weak password %s', (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });

  it('rejects passwords longer than bcrypt limit', () => {
    expect(passwordSchema.safeParse(`a1${'x'.repeat(80)}`).success).toBe(false);
  });

  it('requires a valid hostel id and room for students', () => {
    const base = { name: 'Test Student', email: 'a@b.co', password: 'Passw0rd!x' };
    expect(registerStudentSchema.safeParse({ ...base, hostelId: 'nope', roomNumber: '101' }).success).toBe(false);
    expect(registerStudentSchema.safeParse({ ...base, hostelId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', roomNumber: '' }).success).toBe(false);
    expect(registerStudentSchema.safeParse({ ...base, hostelId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', roomNumber: '101' }).success).toBe(true);
  });
});
