import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requireRole } from '../../shared/middleware/authenticate';
import { userLimiter } from '../../shared/middleware/rate-limit';
import { validate } from '../../shared/middleware/validate';
import { asyncHandler } from '../../shared/utils/async-handler';
import { paginationSchema } from '../../shared/utils/pagination';
import { listAudit } from './audit.service';

const querySchema = paginationSchema.extend({
  entityType: z.string().max(50).optional(),
  action: z.string().max(60).optional(),
});

export const auditRouter = Router();
auditRouter.use(authenticate, userLimiter, requireRole('HOSTEL_ADMIN', 'PLATFORM_ADMIN'));

auditRouter.get(
  '/',
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listAudit(requireAuth(req), req.query as unknown as z.infer<typeof querySchema>));
  }),
);
