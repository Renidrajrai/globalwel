import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requirePermission } from '../auth/middleware';

export const adminRouter = Router();

adminRouter.get('/users', requireAuth, requirePermission('admin.users.manage'), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, email: true, fullName: true, status: true, lastLoginAt: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    res.json(users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.code) })));
  } catch (err) {
    next(err);
  }
});
