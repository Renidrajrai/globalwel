import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { APP_NAME } from '../lib/modules';
import { Button } from '../components/Button';
import { Field } from '../components/Field';

export default function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="rise w-full max-w-sm">
        <p className="title-3 text-muted">{APP_NAME}</p>
        <h1 className="heading-5 mt-2">Sign in</h1>
        <p className="body-6 mt-2 text-muted">Recruitment and manpower management.</p>

        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4 rounded-2xl border border-line p-6">
          <Field
            id="email" label="Email" type="email" autoComplete="username" inputMode="email"
            value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} autoFocus
          />
          <Field
            id="password" label="Password" type={show ? 'text' : 'password'} autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!error}
            trailing={
              <button
                type="button" onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="rounded-lg p-1 text-muted transition-colors duration-300 ease-weighted hover:text-fg focus-visible:outline-2 focus-visible:outline-fg"
              >
                {show ? <EyeSlash size={20} /> : <Eye size={20} />}
              </button>
            }
          />
          {error && (
            <p role="alert" className="body-6 text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in' : 'Sign in'}
          </Button>
        </form>

        <p className="caption-5 mt-4 text-muted">Authorised staff only. Activity on this system is logged.</p>
      </div>
    </main>
  );
}
