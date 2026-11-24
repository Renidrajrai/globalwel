import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setCsrf } from '../lib/api';

export type Me = {
  user: { id: string; email: string; fullName: string };
  roles: string[];
  permissions: string[];
  csrfToken: string;
};

type AuthValue = {
  status: 'loading' | 'anon' | 'authed';
  me: Me | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...anyOf: string[]) => boolean;
};

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: AuthValue['status']; me: Me | null }>({
    status: 'loading',
    me: null,
  });

  const apply = (me: Me | null) => {
    setCsrf(me?.csrfToken ?? '');
    setState(me ? { status: 'authed', me } : { status: 'anon', me: null });
  };

  useEffect(() => {
    api<Me>('/auth/me').then(apply).catch(() => apply(null));
  }, []);

  const value: AuthValue = {
    ...state,
    login: async (email, password) => apply(await api<Me>('/auth/login', { method: 'POST', body: { email, password } })),
    logout: async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
      } finally {
        apply(null);
      }
    },
    can: (...anyOf) => !!state.me && anyOf.some((c) => state.me!.permissions.includes(c)),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
