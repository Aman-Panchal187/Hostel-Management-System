import { Router } from 'express';
import { authenticate, requireAuth, requireRole } from '../../shared/middleware/authenticate';
import { userLimiter } from '../../shared/middleware/rate-limit';
import { validate } from '../../shared/middleware/validate';
import { asyncHandler } from '../../shared/utils/async-handler';
import { hostelAnalyticsSchema, platformAnalyticsSchema } from './analytics.schemas';
import type { HostelAnalyticsQuery, PlatformAnalyticsQuery } from './analytics.schemas';
import { hostelAnalytics, personalSummary, platformAnalytics } from './analytics.service';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, userLimiter);

analyticsRouter.get(
  '/platform',
  requireRole('PLATFORM_ADMIN'),
  validate(platformAnalyticsSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await platformAnalytics(req.query as unknown as PlatformAnalyticsQuery));
  }),
);

analyticsRouter.get(
  '/hostel',
  requireRole('HOSTEL_ADMIN'),
  validate(hostelAnalyticsSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await hostelAnalytics(requireAuth(req), req.query as unknown as HostelAnalyticsQuery));
  }),
);

analyticsRouter.get(
  '/me',
  requireRole('ASSISTANT', 'STUDENT'),
  asyncHandler(async (req, res) => {
    res.json(await personalSummary(requireAuth(req)));
  }),
);
