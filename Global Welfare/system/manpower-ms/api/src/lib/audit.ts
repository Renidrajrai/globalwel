import type { Request } from 'express';
import { prisma } from '../db';

export async function audit(
  req: Request,
  action: string,
  opts: { actorUserId?: string | null; entityType?: string; entityId?: string; detail?: object } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        actorUserId: opts.actorUserId ?? req.auth?.user.id ?? null,
        entityType: opts.entityType,
        entityId: opts.entityId,
        detail: opts.detail,
        ip: req.ip,
        userAgent: req.get('user-agent')?.slice(0, 255),
      },
    });
  } catch (err) {
    console.error('Audit write failed', err);
  }
}
