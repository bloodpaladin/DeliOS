import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { buildSignInPath } from './safeRedirect';

/**
 * Renders children only when authenticated; otherwise redirects to sign-in
 * with a safe return path.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-4">
        <p className="text-sm animate-pulse">Checking session…</p>
      </div>
    );
  }

  if (status !== 'authenticated') {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={buildSignInPath(from)} replace />;
  }

  return <>{children}</>;
}
