import { z } from 'zod';
import { paginationSchema, sortSchema } from '../../shared/utils/pagination';

export const ISSUE_CATEGORIES = ['ELECTRICAL', 'PLUMBING', 'FURNITURE', 'CLEANING', 'INTERNET', 'WATER_SUPPLY', 'OTHER'] as const;
export const ISSUE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const ISSUE_STATUSES = ['YET_TO_START', 'IN_PROGRESS', 'DONE'] as const;

export const mediaInputSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  mediaType: z.enum(['IMAGE', 'VIDEO']),
  publicId: z.string().max(300).optional(),
  bytes: z.number().int().positive().optional(),
  format: z.string().max(10).optional(),
});

export const createIssueSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(4000),
  category: z.enum(ISSUE_CATEGORIES),
  priority: z.enum(ISSUE_PRIORITIES).default('MEDIUM'),
  roomId: z.string().uuid().optional(),
  attachments: z.array(mediaInputSchema).max(5).default([]),
});

export const issueIdParams = z.object({ id: z.string().uuid() });

export const assignSchema = z.object({ assigneeId: z.string().uuid() });

export const statusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'DONE']),
  resolutionNotes: z.string().trim().max(4000).optional(),
  attachments: z.array(mediaInputSchema).max(5).default([]),
});

export const attachmentSchema = mediaInputSchema.extend({
  kind: z.enum(['REFERENCE', 'RESOLUTION']),
});

export const listIssuesSchema = paginationSchema
  .merge(sortSchema(['createdAt', 'updatedAt', 'priority', 'status'] as const, 'createdAt'))
  .extend({
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    category: z.enum(ISSUE_CATEGORIES).optional(),
    assigneeId: z.string().uuid().optional(),
    unassigned: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    search: z.string().trim().max(100).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  });

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type StatusInput = z.infer<typeof statusSchema>;
export type AttachmentInput = z.infer<typeof attachmentSchema>;
export type ListIssuesQuery = z.infer<typeof listIssuesSchema>;
