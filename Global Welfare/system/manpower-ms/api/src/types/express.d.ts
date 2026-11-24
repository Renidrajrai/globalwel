import type { Auth } from '../auth/session';

declare global {
  namespace Express {
    interface Request {
      auth?: Auth;
    }
  }
}

export {};
