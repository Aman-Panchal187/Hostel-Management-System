import type { ApprovalStatus, Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import { AppError } from '../../shared/errors/app-error';
import { pageArgs, pageMeta } from '../../shared/utils/pagination';

export function listPublicHostels(search?: string) {
  return prisma.hostel.findMany({
    where: {
      status: 'APPROVED',
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { city: { contains: search, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { name: 'asc' },
    take: 50,
    select: { id: true, name: true, city: true },
  });
}

export async function listPublicRooms(hostelId: string) {
  const hostel = await prisma.hostel.findFirst({ where: { id: hostelId, status: 'APPROVED' }, select: { id: true } });
  if (!hostel) throw AppError.notFound('Hostel not found');
  return prisma.room.findMany({
    where: { hostelId },
    orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    take: 200,
    select: { id: true, number: true, floor: true },
  });
}

export async function listHostels(query: {
  page: number;
  pageSize: number;
  search?: string;
  status?: ApprovalStatus;
}) {
  const where: Prisma.HostelWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { city: { contains: query.search, mode: 'insensitive' } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.hostel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(query),
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        contactEmail: true,
        contactPhone: true,
        status: true,
        isDemo: true,
        createdAt: true,
        _count: { select: { issues: true, memberships: true } },
      },
    }),
    prisma.hostel.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(query.page, query.pageSize, total) };
}
