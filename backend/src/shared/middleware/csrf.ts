import type { RequestHandler } from 'express';
import { config } from '../../config/env';
import { AppError } from '../errors/app-error';

/**
 * CSRF defence for cookie-authenticated endpoints (refresh / logout).
 * Requires a custom header (forces a CORS preflight, which only allowlisted
 * origins pass) and rejects any browser Origin outside the allowlist.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) {
    return next(AppError.forbidden('Origin not allowed', 'CSRF_ORIGIN'));
  }
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return next(AppError.forbidden('Missing CSRF header', 'CSRF_HEADER'));
  }
  return next();
};
