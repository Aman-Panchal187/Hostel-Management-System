import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

/** Applies migrations to the disposable test database once per run. */
export default async function setup() {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/\/[^/?]*_test(\?|$)/.test(url)) {
    throw new Error('TEST_DATABASE_URL must point to a database whose name ends with "_test"');
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  // Start every run from an empty schema so aggregate assertions are exact.
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE audit_logs, issue_status_history, issue_attachments, issues, approval_requests, refresh_tokens, hostel_memberships, rooms, hostels, users RESTART IDENTITY CASCADE',
    );
  } finally {
    await prisma.$disconnect();
  }
}
