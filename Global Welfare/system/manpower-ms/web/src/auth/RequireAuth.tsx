import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center px-4" aria-busy="true">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-surface" />
          <div className="h-6 w-full animate-pulse rounded-lg bg-surface" />
          <div className="h-6 w-5/6 animate-pulse rounded-lg bg-surface" />
        </div>
      </div>
    );
  }
  if (status === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
