/**
 * Sign-in / create-account screen for drivers.
 */
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { safeRedirectPath } from '../auth/safeRedirect';

type Mode = 'sign-in' | 'sign-up';

export function AuthPage() {
  const { status, signIn, signUp } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const redirectTo = safeRedirectPath(params.get('redirect'));

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">
        <p className="text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to={redirectTo} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const em = email.trim();
    if (!em || !password) {
      setError('Email and password are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'sign-up') {
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
      setBusy(true);
      const result = await signUp(em, password);
      setBusy(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.needsEmailConfirmation) {
        setInfo(
          'Account created. Check your email for a confirmation link before signing in. If no email arrives, ask your admin to disable email confirmation for this project or resend from the dashboard.'
        );
        setMode('sign-in');
        setPassword('');
        setConfirm('');
        return;
      }
      navigate(redirectTo, { replace: true });
      return;
    }

    setBusy(true);
    const result = await signIn(em, password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(redirectTo, { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="px-4 py-4 border-b border-slate-800">
        <Link to="/" className="text-sm text-slate-400">
          ← RoutePilot Caribbean
        </Link>
        <h1 className="text-lg font-semibold mt-2">
          {mode === 'sign-in' ? 'Driver sign in' : 'Create driver account'}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Your deliveries are private to your account (RLS).
        </p>
      </header>

      <main className="flex-1 p-4 max-w-md w-full mx-auto">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Email</span>
            <input
              type="email"
              autoComplete="email"
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-slate-400">Password</span>
            <input
              type="password"
              autoComplete={
                mode === 'sign-in' ? 'current-password' : 'new-password'
              }
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {mode === 'sign-up' && (
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
              />
            </label>
          )}

          {error && (
            <div className="rounded-lg bg-red-950/80 border border-red-800 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-200">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-600 py-4 text-base font-semibold disabled:opacity-50"
          >
            {busy
              ? 'Please wait…'
              : mode === 'sign-in'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-sm text-slate-400 underline"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'sign-in'
            ? 'Need an account? Create one'
            : 'Already have an account? Sign in'}
        </button>
      </main>
    </div>
  );
}

export default AuthPage;
