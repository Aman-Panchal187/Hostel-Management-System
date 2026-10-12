import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function pageArgs({ page, pageSize }: { page: number; pageSize: number }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Build a typed allowlisted sort: unknown fields are rejected by the schema. */
export function sortSchema<T extends readonly [string, ...string[]]>(fields: T, fallback: T[number]) {
  return z.object({
    sortBy: z.enum(fields).default(fallback),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
  });
}
