import { randomUUID } from 'node:crypto';
import type { ApprovalStatus, IssueCategory, IssuePriority, IssueStatus, Role } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/shared/database/prisma';
import { getRedis } from '../src/shared/redis/redis';
import { hashPassword } from '../src/shared/security/password';

export const app = createApp();
export const PASSWORD = 'Passw0rd!test';
let cachedHash: string | null = null;
const passwordHash = async () => (cachedHash ??= await hashPassword(PASSWORD));

export const uid = () => randomUUID().slice(0, 8);
export const api = () => request(app);

/** Each test file/call may use its own client IP so rate-limit buckets never collide. */
export const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

export async function resetRedis() {
  const redis = getRedis();
  for (let i = 0; i < 50 && redis.status !== 'ready'; i++) await new Promise((r) => setTimeout(r, 100));
  await redis.flushdb();
}

export async function makeUser(opts: { role: Role; status?: ApprovalStatus; hostelId?: string; roomId?: string; name?: string }) {
  const id = randomUUID();
  const email = `${opts.role.toLowerCase()}.${uid()}@test.example`;
  const user = await prisma.user.create({
    data: {
      id,
      email,
      name: opts.name ?? `Test ${opts.role}`,
      role: opts.role,
      status: opts.status ?? 'APPROVED',
      passwordHash: await passwordHash(),
      ...(opts.hostelId
        ? { membership: { create: { hostelId: opts.hostelId, role: opts.role, roomId: opts.roomId ?? null } } }
        : {}),
    },
    select: { id: true, email: true, role: true },
  });
  return user;
}

export async function makeHostel(status: ApprovalStatus = 'APPROVED') {
  const hostel = await prisma.hostel.create({
    data: {
      name: `Test Hostel ${uid()}`,
      address: '1 Test Street, Testville',
      city: 'Pune',
      contactEmail: `office.${uid()}@test.example`,
      contactPhone: '+91 90000 00000',
      status,
      rooms: { create: [{ number: '101', floor: 1, capacity: 2 }, { number: '102', floor: 1, capacity: 2 }] },
    },
    select: { id: true, name: true, rooms: { select: { id: true, number: true } } },
  });
  const admin = await makeUser({ role: 'HOSTEL_ADMIN', status, hostelId: hostel.id });
  return { ...hostel, admin };
}

/** Fully-populated approved tenant: admin, two assistants, two students. */
export async function makeTenant() {
  const hostel = await makeHostel('APPROVED');
  const [room1, room2] = hostel.rooms;
  const assistantA = await makeUser({ role: 'ASSISTANT', hostelId: hostel.id });
  const assistantB = await makeUser({ role: 'ASSISTANT', hostelId: hostel.id });
  const studentA = await makeUser({ role: 'STUDENT', hostelId: hostel.id, roomId: room1?.id });
  const studentB = await makeUser({ role: 'STUDENT', hostelId: hostel.id, roomId: room2?.id });
  return { hostel, admin: hostel.admin, assistantA, assistantB, studentA, studentB };
}

export async function platformAdmin() {
  return makeUser({ role: 'PLATFORM_ADMIN' });
}

export async function login(email: string, password = PASSWORD) {
  const res = await api().post('/api/auth/login').set('X-Forwarded-For', randomIp()).send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, cookies: res.headers['set-cookie'] as unknown as string[] };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function tokenFor(user: { email: string }) {
  return (await login(user.email)).token;
}

export async function makeIssue(opts: {
  hostelId: string;
  reporterId: string;
  assigneeId?: string | null;
  status?: IssueStatus;
  category?: IssueCategory;
  priority?: IssuePriority;
  roomId?: string | null;
  title?: string;
  createdAt?: Date;
  completedAt?: Date | null;
}) {
  const status = opts.status ?? 'YET_TO_START';
  const createdAt = opts.createdAt ?? new Date();
  return prisma.issue.create({
    data: {
      hostelId: opts.hostelId,
      reporterId: opts.reporterId,
      assigneeId: opts.assigneeId ?? null,
      roomId: opts.roomId ?? null,
      title: opts.title ?? `Issue ${uid()}`,
      description: 'Automated test issue description',
      category: opts.category ?? 'ELECTRICAL',
      priority: opts.priority ?? 'MEDIUM',
      status,
      createdAt,
      assignedAt: opts.assigneeId ? createdAt : null,
      startedAt: status !== 'YET_TO_START' ? createdAt : null,
      completedAt: status === 'DONE' ? (opts.completedAt ?? new Date(createdAt.getTime() + 3_600_000 * 5)) : null,
      history: { create: { fromStatus: null, toStatus: 'YET_TO_START', changedById: opts.reporterId, note: 'Issue created' } },
    },
    select: { id: true, hostelId: true, status: true },
  });
}

export const MEDIA = { url: 'https://picsum.photos/seed/test/800/600', mediaType: 'IMAGE' as const };
