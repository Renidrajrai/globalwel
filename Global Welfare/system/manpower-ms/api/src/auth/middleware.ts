import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { trustedWebOrigins } from '../config/env';
import { SESSION_COOKIE, resolveSession } from './session';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) req.auth = (await resolveSession(token)) ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}

export function checkOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin');
  if (origin && !trustedWebOrigins.has(origin)) {
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE.has(req.method) || !req.auth || req.path === '/api/auth/login') return next();
  const sent = Buffer.from(req.get('x-csrf-token') ?? '');
  const expected = Buffer.from(req.auth.session.csrfToken);
  if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
    return res.status(403).json({ error: 'Security check failed. Refresh the page and try again.' });
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'You are not signed in.' });
  next();
}

export const requirePermission =
  (...codes: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'You are not signed in.' });
    if (!codes.every((c) => req.auth!.permissions.has(c))) {
      return res.status(403).json({ error: 'Your role does not allow this action.' });
    }
    next();
  };
