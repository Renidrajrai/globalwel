import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { House, List, Moon, SignOut, Sun, X } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../lib/theme';
import { APP_NAME, MODULES, ROLE_LABELS } from '../lib/modules';
import { Button } from './Button';

export function AppShell() {
  const { me, logout, can } = useAuth();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const visible = MODULES.filter((m) => m.path && can(...m.anyOf));
  const roles = (me?.roles ?? []).map((r) => ROLE_LABELS[r] ?? r).join(', ');

  return (
    <div className="min-h-dvh md:flex">
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface p-4',
          'transition-transform duration-500 ease-weighted md:sticky md:top-0 md:h-dvh md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          <span className="title-3">{APP_NAME}</span>
          <button className="rounded-lg p-1 md:hidden" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Main" className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto">
          <NavLink
            to="/" end onClick={() => setOpen(false)}
            className={({ isActive }) =>
              [
                'body-5 flex items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-300 ease-weighted',
                isActive ? 'bg-bg' : 'hover:bg-bg',
              ].join(' ')
            }
          >
            <House size={20} /> Home
          </NavLink>
          {visible.map((m) => (
            <NavLink
              key={m.key}
              to={m.path!}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                [
                  'body-5 flex items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-300 ease-weighted',
                  isActive ? 'bg-bg' : 'hover:bg-bg',
                ].join(' ')
              }
            >
              <m.icon size={20} />
              <span className="flex-1">{m.title}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line pt-4">
          <p className="title-4">{me?.user.fullName}</p>
          <p className="caption-5 mt-1 text-muted">{roles}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={toggle} aria-label="Toggle dark mode">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button variant="secondary" size="sm" onClick={logout} className="flex-1">
              <SignOut size={16} /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3 md:hidden">
          <button className="rounded-lg p-1" aria-label="Open menu" onClick={() => setOpen(true)}>
            <List size={24} />
          </button>
          <span className="title-3">{APP_NAME}</span>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
