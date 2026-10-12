import { PrismaClient } from '@prisma/client';
import { config } from '../../config/env';

export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
  // Interactive transactions can queue behind row locks under contention; give them room before failing.
  transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  log: config.isTest ? [] : ['warn', 'error'],
});

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
