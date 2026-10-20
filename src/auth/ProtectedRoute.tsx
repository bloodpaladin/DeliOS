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
      <div className="rp-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p className="rp-muted animate-pulse">Checking session…</p>
      </div>
    );
  }

  if (status !== 'authenticated') {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={buildSignInPath(from)} replace />;
  }

  return <>{children}</>;
}
