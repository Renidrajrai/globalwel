import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { HttpError } from './http';
import { audit } from './audit';

export const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err: unknown) => {
      if (err instanceof HttpError)
        return res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
        if (err.code === 'P2002') return res.status(409).json({ error: 'A record with these details already exists.' });
        if (err.code === 'P2023') return res.status(400).json({ error: 'Invalid identifier.' });
        if (err.code === 'P2003' || err.code === 'P2014') return res.status(400).json({ error: 'A related record does not exist.' });
      }
      next(err);
    });
  };

export function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = i.path.join('.') || '_';
    if (!fields[k]) fields[k] = i.message;
  }
  throw new HttpError(400, 'Please correct the highlighted fields.', fields);
}

export const actorId = (req: Request) => req.auth!.user.id;

export const A = (req: Request, action: string, entityType: string, entityId: string | null, detail: object = {}) =>
  audit(req, action, { entityType, entityId: entityId ?? undefined, detail });
