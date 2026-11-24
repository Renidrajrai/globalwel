import crypto from 'node:crypto';
import { env } from '../config/env';
import { dateKey, todayKathmandu } from './dates';

const hmacKey = Buffer.from(env.PASSPORT_HMAC_KEY, 'base64');
const encKey = Buffer.from(env.PASSPORT_ENC_KEY, 'base64');
if (hmacKey.length !== 32 || encKey.length !== 32 || hmacKey.equals(encKey)) {
  throw new Error('PASSPORT_HMAC_KEY and PASSPORT_ENC_KEY must be different base64 values of 32 bytes');
}

export const PASSPORT_KEY_VERSION = 1;

export const normalizePassport = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');

export const passportHmac = (n: string, iso2 = 'NP') =>
  crypto.createHmac('sha256', hmacKey).update(`${iso2.toUpperCase()}|${normalizePassport(n)}`).digest('hex');

export function encryptPassport(n: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const ct = Buffer.concat([c.update(normalizePassport(n), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function decryptPassport(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', encKey, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

export function passportStatus(expiry: Date, isCurrent: boolean): 'CURRENT' | 'HISTORICAL' | 'EXPIRED' {
  if (dateKey(expiry) < todayKathmandu()) return 'EXPIRED';
  return isCurrent ? 'CURRENT' : 'HISTORICAL';
}

export const ICAO_GENERIC = /^[A-Z0-9]{6,9}$/;
export const NEPAL_PATTERNS: RegExp[] = [
  /^[A-Z]{1,2}\d{6,8}$/,
  /^\d{6,9}$/,
];

export function passportNumberProblem(raw: string, iso2: string | null): string | null {
  const n = normalizePassport(raw ?? '');
  if (!n) return 'Passport number is required.';
  if (!ICAO_GENERIC.test(n) || !/\d/.test(n))
    return 'Passport number must be 6 to 9 letters or digits and include at least one digit.';
  if (iso2 === 'NP' && !NEPAL_PATTERNS.some((re) => re.test(n)))
    return 'Nepali passport numbers are 1 to 2 letters followed by 6 to 8 digits, or 6 to 9 digits for older passports.';
  return null;
}

export const looksLikePassport = (q: string) => {
  const n = normalizePassport(q);
  return ICAO_GENERIC.test(n) && /\d/.test(n);
};

export function passportDateProblems(d: { dob?: string | null; issue: string; expiry: string }, today = todayKathmandu()) {
  const out: { issueDate?: string; expiryDate?: string } = {};
  if (d.issue > today) out.issueDate = 'Issue date cannot be in the future.';
  else if (d.dob && d.issue < d.dob) out.issueDate = 'Issue date cannot be before the date of birth.';

  if (d.expiry <= d.issue) out.expiryDate = 'Expiry date must be later than the issue date.';
  else if (d.dob && d.expiry < d.dob) out.expiryDate = 'Expiry date cannot be before the date of birth.';
  else if (d.expiry < today) out.expiryDate = 'This passport has already expired.';
  return out;
}
