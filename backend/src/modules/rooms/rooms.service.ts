import { prisma } from '../../shared/database/prisma';
import { AppError } from '../../shared/errors/app-error';
import { invalidateScopes } from '../../shared/redis/cache';

export interface RoomInput {
  number: string;
  floor: number;
  capacity: number;
}

const roomSelect = { id: true, number: true, floor: true, capacity: true, _count: { select: { memberships: true } } } as const;

export async function listRooms(hostelId: string) {
  const rooms = await prisma.room.findMany({
    where: { hostelId },
    orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    select: roomSelect,
    take: 500,
  });
  return rooms.map(({ _count, ...room }) => ({ ...room, occupants: _count.memberships }));
}

export async function createRoom(hostelId: string, input: RoomInput) {
  const exists = await prisma.room.findUnique({
    where: { hostelId_number: { hostelId, number: input.number } },
    select: { id: true },
  });
  if (exists) throw AppError.conflict('Room number already exists in this hostel', 'ROOM_EXISTS');
  const room = await prisma.room.create({ data: { ...input, hostelId }, select: { id: true, number: true, floor: true, capacity: true } });
  await invalidateScopes({ kind: 'hostel', hostelId });
  return room;
}

export async function updateRoom(hostelId: string, id: string, input: Partial<RoomInput>) {
  // Tenant filter lives in the WHERE clause, so foreign room IDs simply match nothing.
  const updated = await prisma.room.updateMany({ where: { id, hostelId }, data: input });
  if (updated.count !== 1) throw AppError.notFound('Room not found');
  return prisma.room.findFirstOrThrow({ where: { id, hostelId }, select: { id: true, number: true, floor: true, capacity: true } });
}

export async function deleteRoom(hostelId: string, id: string) {
  const room = await prisma.room.findFirst({
    where: { id, hostelId },
    select: { id: true, _count: { select: { memberships: true, issues: true } } },
  });
  if (!room) throw AppError.notFound('Room not found');
  if (room._count.memberships > 0 || room._count.issues > 0) {
    throw AppError.conflict('Room has residents or issues and cannot be deleted', 'ROOM_IN_USE');
  }
  await prisma.room.delete({ where: { id } });
}
