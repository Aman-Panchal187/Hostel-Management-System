import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from './app-error';
import { logger } from '../utils/logger';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound('Route not found', 'ROUTE_NOT_FOUND'));
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return AppError.badRequest(
      'Validation failed',
      'VALIDATION_ERROR',
      err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return AppError.conflict('A record with these values already exists', 'DUPLICATE');
    if (err.code === 'P2025') return AppError.notFound();
    if (err.code === 'P2003') return AppError.badRequest('Referenced record does not exist', 'INVALID_REFERENCE');
  }
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (status === 413) return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  if (err instanceof SyntaxError && status === 400) return AppError.badRequest('Malformed JSON body', 'MALFORMED_JSON');
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  }
  const retryAfter = (appError.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
  if (appError.status === 429 && retryAfter) res.setHeader('Retry-After', String(retryAfter));
  res.status(appError.status).json({
    error: { code: appError.code, message: appError.message, details: appError.details },
  });
};
