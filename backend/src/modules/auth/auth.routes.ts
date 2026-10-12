import { Router } from 'express';
import type { Response } from 'express';
import { config } from '../../config/env';
import { authenticate, requireAuth } from '../../shared/middleware/authenticate';
import { csrfGuard } from '../../shared/middleware/csrf';
import { loginLimiter, refreshLimiter, registerLimiter, userLimiter } from '../../shared/middleware/rate-limit';
import { validate } from '../../shared/middleware/validate';
import { asyncHandler } from '../../shared/utils/async-handler';
import {
  loginSchema,
  registerAssistantSchema,
  registerHostelSchema,
  registerStudentSchema,
} from './auth.schemas';
import * as authService from './auth.service';

export const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/auth';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: COOKIE_PATH,
    maxAge: config.jwt.refreshTtlMs,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: COOKIE_PATH,
  });
}

export const authRouter = Router();

authRouter.post(
  '/register/hostel',
  registerLimiter,
  validate(registerHostelSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await authService.registerHostel(req.body));
  }),
);

authRouter.post(
  '/register/assistant',
  registerLimiter,
  validate(registerAssistantSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await authService.registerAssistant(req.body));
  }),
);

authRouter.post(
  '/register/student',
  registerLimiter,
  validate(registerStudentSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await authService.registerStudent(req.body));
  }),
);

authRouter.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const session = await authService.login(req.body);
    setRefreshCookie(res, session.refreshToken);
    res.json({ accessToken: session.accessToken, user: session.user });
  }),
);

authRouter.post(
  '/refresh',
  csrfGuard,
  refreshLimiter,
  asyncHandler(async (req, res) => {
    try {
      const session = await authService.refresh(req.cookies?.[REFRESH_COOKIE]);
      setRefreshCookie(res, session.refreshToken);
      res.json({ accessToken: session.accessToken, user: session.user });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }),
);

authRouter.post(
  '/logout',
  csrfGuard,
  asyncHandler(async (req, res) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  userLimiter,
  asyncHandler(async (req, res) => {
    res.json({ user: await authService.getProfile(requireAuth(req).userId) });
  }),
);
