import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../shared/middleware/authenticate';
import { publicLimiter, userLimiter } from '../../shared/middleware/rate-limit';
import { validate } from '../../shared/middleware/validate';
import { asyncHandler } from '../../shared/utils/async-handler';
import { paginationSchema } from '../../shared/utils/pagination';
import { listHostels, listPublicHostels, listPublicRooms } from './hostels.service';

const publicQuery = z.object({ search: z.string().trim().max(80).optional() });
const idParams = z.object({ id: z.string().uuid() });
const adminQuery = paginationSchema.extend({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

/** Unauthenticated lookups used by the registration forms (approved hostels only). */
export const publicRouter = Router();
publicRouter.use(publicLimiter);

publicRouter.get(
  '/hostels',
  validate(publicQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ data: await listPublicHostels((req.query as { search?: string }).search) });
  }),
);

publicRouter.get(
  '/hostels/:id/rooms',
  validate(idParams, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ data: await listPublicRooms(req.params.id as string) });
  }),
);

export const hostelsRouter = Router();
hostelsRouter.use(authenticate, userLimiter, requireRole('PLATFORM_ADMIN'));

hostelsRouter.get(
  '/',
  validate(adminQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listHostels(req.query as unknown as z.infer<typeof adminQuery>));
  }),
);
