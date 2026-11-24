import type { Prisma } from '@prisma/client';
import { looksLikePassport, normalizePassport, passportHmac } from './passport';

export function candidateSearchWhere(raw: string, canSearchPassport: boolean, passportIssuingCountries: string[] = ['NP']): Prisma.CandidateWhereInput | null {
  const q = raw.trim().replace(/\s+/g, ' ');
  if (!q) return null;
  const or: Prisma.CandidateWhereInput[] = [];

  const words = q.toLowerCase().split(' ').filter(Boolean).slice(0, 5);
  or.push({ AND: words.map((w) => ({ nameNormalized: { contains: w, mode: 'insensitive' as const } })) });
  or.push({ candidateCode: { contains: q, mode: 'insensitive' } });

  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && /^[\d\s()+\-.]+$/.test(q)) {
    or.push({ phoneDigits: { contains: digits } }, { altPhoneDigits: { contains: digits } });
  }

  if (canSearchPassport && looksLikePassport(q)) {
    const hashes = passportIssuingCountries.map((iso2) => passportHmac(normalizePassport(q), iso2));
    if (hashes.length) or.push({ passports: { some: { passportLookupHmac: { in: hashes } } } });
  }
  return { OR: or };
}
