import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config/env';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { approvalsRouter } from './modules/approvals/approvals.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { hostelsRouter, publicRouter } from './modules/hostels/hostels.routes';
import { issuesRouter } from './modules/issues/issues.routes';
import { roomsRouter } from './modules/rooms/rooms.routes';
import { usersRouter } from './modules/users/users.routes';
import { prisma } from './shared/database/prisma';
import { errorHandler, notFoundHandler } from './shared/errors/error-handler';
import { pingRedis } from './shared/redis/redis';
import { logger } from './shared/utils/logger';

export function createApp(): Express {
  const app = express();

  // Exactly N trusted proxy hops (Nginx): client-supplied X-Forwarded-For entries beyond that are ignored.
  app.set('trust proxy', config.trustProxyHops);
  app.disable('x-powered-by');

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
      pingRedis(),
    ]);
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? (redisOk ? 'ok' : 'degraded') : 'down',
      database: dbOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/hostels', hostelsRouter);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/issues', issuesRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/audit', auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
