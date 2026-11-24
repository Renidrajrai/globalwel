import { createHash, randomBytes } from 'crypto';
import type { CookieOptions } from 'express';
import type { Session, User } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../config/env';

export const SESSION_COOKIE = 'sid';

export type Auth = { user: User; session: Session; roles: string[]; permissions: Set<string> };

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.NODE_ENV === 'production',
  path: '/',
});

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      csrfToken: randomBytes(24).toString('base64url'),
      expiresAt: new Date(now + env.SESSION_ABSOLUTE_HOURS * 3_600_000),
      ip,
      userAgent: userAgent?.slice(0, 255),
    },
  });
  return token;
}

export async function resolveSession(token: string): Promise<Auth | null> {
  const found = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  });
  if (!found) return null;

  const now = Date.now();
  const idleMs = env.SESSION_IDLE_MINUTES * 60_000;
  if (
    found.revokedAt ||
    found.expiresAt.getTime() <= now ||
    now - found.lastSeenAt.getTime() > idleMs ||
    found.user.status !== 'ACTIVE'
  ) {
    return null;
  }

  if (now - found.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: found.id }, data: { lastSeenAt: new Date() } });
  }

  const { user, ...session } = found;
  return {
    user,
    session,
    roles: user.roles.map((r) => r.role.code),
    permissions: new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
  };
}

export async function revokeSession(id: string) {
  await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
}
