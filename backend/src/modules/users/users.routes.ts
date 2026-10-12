import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import { authenticate, requireAuth, requireHostelId, requireRole } from '../../shared/middleware/authenticate';
import { userLimiter } from '../../shared/middleware/rate-limit';
import { validate } from '../../shared/middleware/validate';
import { asyncHandler } from '../../shared/utils/async-handler';
import { pageArgs, pageMeta, paginationSchema } from '../../shared/utils/pagination';

const listQuery = paginationSchema.extend({
  role: z.enum(['ASSISTANT', 'STUDENT']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  search: z.string().trim().max(80).optional(),
});

export const usersRouter = Router();
usersRouter.use(authenticate, userLimiter, requireRole('HOSTEL_ADMIN'));

/** Members of the caller's own hostel (tenant derived from the authenticated membership). */
usersRouter.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuery>;
    const hostelId = requireHostelId(requireAuth(req));
    const where: Prisma.UserWhereInput = {
      membership: { is: { hostelId, role: query.role ?? { in: ['ASSISTANT', 'STUDENT'] } } },
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          membership: { select: { room: { select: { number: true } } } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    const data = rows.map(({ membership, ...user }) => ({ ...user, roomNumber: membership?.room?.number ?? null }));
    res.json({ data, meta: pageMeta(query.page, query.pageSize, total) });
  }),
);
