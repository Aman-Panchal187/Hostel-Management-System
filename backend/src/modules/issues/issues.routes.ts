import { Router } from 'express';
import { authenticate, requireAuth, requireRole } from '../../shared/middleware/authenticate';
import { userLimiter } from '../../shared/middleware/rate-limit';
import { validate } from '../../shared/middleware/validate';
import { asyncHandler } from '../../shared/utils/async-handler';
import {
  assignSchema,
  attachmentSchema,
  createIssueSchema,
  issueIdParams,
  listIssuesSchema,
  statusSchema,
} from './issues.schemas';
import type { ListIssuesQuery } from './issues.schemas';
import * as issues from './issues.service';

export const issuesRouter = Router();
issuesRouter.use(authenticate, userLimiter, requireRole('HOSTEL_ADMIN', 'ASSISTANT', 'STUDENT'));

const idParam = validate(issueIdParams, 'params');
const idOf = (req: { params: Record<string, string | undefined> }) => req.params.id as string;

issuesRouter.get(
  '/',
  validate(listIssuesSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await issues.listIssues(requireAuth(req), req.query as unknown as ListIssuesQuery));
  }),
);

issuesRouter.post(
  '/',
  requireRole('STUDENT', 'HOSTEL_ADMIN'),
  validate(createIssueSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await issues.createIssue(requireAuth(req), req.body));
  }),
);

issuesRouter.get(
  '/:id',
  idParam,
  asyncHandler(async (req, res) => {
    res.json(await issues.getIssue(requireAuth(req), idOf(req)));
  }),
);

issuesRouter.post(
  '/:id/assign',
  requireRole('HOSTEL_ADMIN'),
  idParam,
  validate(assignSchema),
  asyncHandler(async (req, res) => {
    res.json(await issues.assignIssue(requireAuth(req), idOf(req), req.body.assigneeId));
  }),
);

issuesRouter.post(
  '/:id/status',
  requireRole('ASSISTANT'),
  idParam,
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    res.json(await issues.changeStatus(requireAuth(req), idOf(req), req.body));
  }),
);

issuesRouter.post(
  '/:id/attachments',
  idParam,
  validate(attachmentSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await issues.addAttachment(requireAuth(req), idOf(req), req.body));
  }),
);

issuesRouter.post(
  '/:id/media/signature',
  idParam,
  asyncHandler(async (req, res) => {
    res.json(await issues.createUploadSignature(requireAuth(req), idOf(req)));
  }),
);
