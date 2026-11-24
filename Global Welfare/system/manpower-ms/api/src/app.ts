import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { checkOrigin, loadSession, requireCsrf, requireAuth } from './auth/middleware';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { resourcesRouter, financeRouter, analyticsRouter } from './routes/resources';
import { intakeRouter } from './routes/intake';
import { catalogueRouter } from './routes/catalogue';

export const app = express();

app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(checkOrigin);
app.use(loadSession);
app.use(requireCsrf);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/intake', intakeRouter);
app.use('/api/catalogue', requireAuth, catalogueRouter);
app.use('/api/resource/candidates', rateLimit({
  windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req as any).auth?.user?.id ?? 'anon',
}));
app.use('/api/resource', resourcesRouter);
app.use('/api/finance', financeRouter);
app.use('/api/analytics', analyticsRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});
