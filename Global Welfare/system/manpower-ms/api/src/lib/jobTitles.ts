import type { Prisma } from '@prisma/client';
import { HttpError } from './http';

const clean = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ');
export const normalizeTitle = (value: string) => clean(value).toLowerCase();

export async function resolveJobTitle(tx: Prisma.TransactionClient, input: { jobTitleId?: string; newJobTitle?: string }) {
  if (input.jobTitleId) {
    const title = await tx.jobTitle.findUnique({ where: { id: input.jobTitleId } });
    if (!title?.active) throw new HttpError(400, 'Choose an active job title.', { positions: 'A job title is unavailable.' });
    return { id: title.id, created: false };
  }
  const title = clean(input.newJobTitle ?? '');
  if (title.length < 2 || title.length > 100) throw new HttpError(400, 'Job title must be 2 to 100 characters.', { positions: 'Invalid job title.' });
  const normalizedTitle = normalizeTitle(title);
  const found = await tx.jobTitle.findUnique({ where: { normalizedTitle } });
  const row = await tx.jobTitle.upsert({ where: { normalizedTitle }, create: { title, normalizedTitle }, update: {} });
  if (!row.active) await tx.jobTitle.update({ where: { id: row.id }, data: { active: true } });
  return { id: row.id, created: !found };
}
