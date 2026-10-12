import { z } from 'zod';
import { ISSUE_CATEGORIES, ISSUE_STATUSES } from '../issues/issues.schemas';

const dateRange = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const hostelAnalyticsSchema = z
  .object({
    ...dateRange,
    status: z.enum(ISSUE_STATUSES).optional(),
    category: z.enum(ISSUE_CATEGORIES).optional(),
    assigneeId: z.string().uuid().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'from must be before to', path: ['from'] });

export const platformAnalyticsSchema = z
  .object({
    ...dateRange,
    hostelId: z.string().uuid().optional(),
    status: z.enum(ISSUE_STATUSES).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'from must be before to', path: ['from'] });

export type HostelAnalyticsQuery = z.infer<typeof hostelAnalyticsSchema>;
export type PlatformAnalyticsQuery = z.infer<typeof platformAnalyticsSchema>;
