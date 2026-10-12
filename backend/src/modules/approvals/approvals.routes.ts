import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requireRole } from '../../shared/middleware/authenticate';
import { userLimiter } from '../../shared/middleware/rate-limit';
import { validate } from '../../shared/middleware/validate';
import { asyncHandler } from '../../shared/utils/async-handler';
import { paginationSchema } from '../../shared/utils/pagination';
import { decide, listApprovals } from './approvals.service';

const listQuery = paginationSchema.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  type: z.enum(['HOSTEL_REGISTRATION', 'ASSISTANT_REGISTRATION', 'STUDENT_REGISTRATION']).optional(),
});
const idParams = z.object({ id: z.string().uuid() });
const decisionBody = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().max(500).optional(),
});

export const approvalsRouter = Router();
approvalsRouter.use(authenticate, userLimiter, requireRole('PLATFORM_ADMIN', 'HOSTEL_ADMIN'));

approvalsRouter.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listApprovals(requireAuth(req), req.query as unknown as z.infer<typeof listQuery>));
  }),
);

approvalsRouter.post(
  '/:id/decision',
  validate(idParams, 'params'),
  validate(decisionBody),
  asyncHandler(async (req, res) => {
    const { decision, reason } = req.body as z.infer<typeof decisionBody>;
    res.json(await decide(requireAuth(req), req.params.id as string, decision, reason));
  }),
);
