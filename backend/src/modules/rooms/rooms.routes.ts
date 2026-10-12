import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAuth, requireHostelId, requireRole } from '../../shared/middleware/authenticate';
import { userLimiter } from '../../shared/middleware/rate-limit';
import { validate } from '../../shared/middleware/validate';
import { asyncHandler } from '../../shared/utils/async-handler';
import { createRoom, deleteRoom, listRooms, updateRoom } from './rooms.service';

const roomBody = z.object({
  number: z.string().trim().min(1).max(20),
  floor: z.coerce.number().int().min(0).max(100),
  capacity: z.coerce.number().int().min(1).max(20),
});
const idParams = z.object({ id: z.string().uuid() });

export const roomsRouter = Router();
roomsRouter.use(authenticate, userLimiter, requireRole('HOSTEL_ADMIN', 'ASSISTANT', 'STUDENT'));

roomsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await listRooms(requireHostelId(requireAuth(req))) });
  }),
);

roomsRouter.post(
  '/',
  requireRole('HOSTEL_ADMIN'),
  validate(roomBody),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createRoom(requireHostelId(requireAuth(req)), req.body));
  }),
);

roomsRouter.patch(
  '/:id',
  requireRole('HOSTEL_ADMIN'),
  validate(idParams, 'params'),
  validate(roomBody.partial()),
  asyncHandler(async (req, res) => {
    res.json(await updateRoom(requireHostelId(requireAuth(req)), req.params.id as string, req.body));
  }),
);

roomsRouter.delete(
  '/:id',
  requireRole('HOSTEL_ADMIN'),
  validate(idParams, 'params'),
  asyncHandler(async (req, res) => {
    await deleteRoom(requireHostelId(requireAuth(req)), req.params.id as string);
    res.status(204).end();
  }),
);
