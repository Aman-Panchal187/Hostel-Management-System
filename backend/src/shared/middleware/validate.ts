import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

/** Validates and replaces the given request part with the parsed (stripped) value. */
export const validate =
  (schema: ZodTypeAny, source: Source = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    // Express 4 allows reassigning query; cast keeps the typed result.
    (req as unknown as Record<Source, unknown>)[source] = result.data;
    return next();
  };
