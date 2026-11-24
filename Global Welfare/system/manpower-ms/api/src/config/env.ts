import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGINS: z.string().optional(),
  WEB_ORIGIN: z.string().url().optional(),
  SESSION_IDLE_MINUTES: z.coerce.number().default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().default(12),
  PASSPORT_HMAC_KEY: z.string().min(1),
  PASSPORT_ENC_KEY: z.string().min(1),
});

export const env = schema.parse(process.env);
if (env.NODE_ENV === 'production' && !env.WEB_ORIGINS && !env.WEB_ORIGIN)
  throw new Error('Configure WEB_ORIGINS with the exact production frontend origin(s).');
export const trustedWebOrigins = new Set([
  ...(env.WEB_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ...(env.WEB_ORIGIN ? [env.WEB_ORIGIN] : []),
  ...(env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
]);
