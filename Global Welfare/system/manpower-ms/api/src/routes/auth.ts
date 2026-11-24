import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { audit } from '../lib/audit';
import { dummyVerify, verifyPassword } from '../lib/password';
import { requireAuth } from '../auth/middleware';
import {
  SESSION_COOKIE, cookieOptions, createSession, resolveSession, revokeSession, type Auth,
} from '../auth/session';

export const authRouter = Router();

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

const loginBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

const mePayload = (a: Auth) => ({
  user: { id: a.user.id, email: a.user.email, fullName: a.user.fullName },
  roles: a.roles,
  permissions: [...a.permissions].sort(),
  csrfToken: a.session.csrfToken,
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await audit(req, 'LOGIN_BLOCKED_LOCKED', { actorUserId: user.id });
      return res.status(429).json({
        error: `This account is locked after too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`,
      });
    }

    let ok = false;
    if (user && user.status === 'ACTIVE') ok = await verifyPassword(user.passwordHash, password);
    else await dummyVerify(password);

    if (!user || !ok) {
      if (user) {
        const fails = user.failedLogins + 1;
        await prisma.user.update({
          where: { id: user.id },
          data:
            fails >= MAX_FAILS
              ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
              : { failedLogins: fails },
        });
      }
      await audit(req, 'LOGIN_FAILED', { actorUserId: user?.id ?? null });
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const token = await createSession(user.id, req.ip, req.get('user-agent'));
    const auth = await resolveSession(token);
    if (!auth) return res.status(500).json({ error: 'Could not start your session. Try again.' });

    res.cookie(SESSION_COOKIE, token, cookieOptions());
    await audit(req, 'LOGIN_SUCCESS', { actorUserId: user.id });
    res.json(mePayload(auth));
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, (req: Request, res) => {
  res.json(mePayload(req.auth!));
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await revokeSession(req.auth!.session.id);
    await audit(req, 'LOGOUT');
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
