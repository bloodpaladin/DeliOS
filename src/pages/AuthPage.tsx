/**
 * Sign-in / create-account screen for drivers (Supabase Auth only).
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { safeRedirectPath } from '../auth/safeRedirect';
import { BackButton } from '../components/BackButton';
import { ThemeToggle } from '../components/ThemeToggle';
import { evaluatePasswordStrength } from '../auth/passwordStrength';

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

  const strength = evaluatePasswordStrength(password);
  const passwordsMatch =
    confirm.length > 0 && password.length > 0 && password === confirm;

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <p className="auth-muted animate-pulse">Loading…</p>
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
          'Account created. Check your email for a confirmation link before signing in.'
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

  function switchMode() {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
    setError(null);
    setInfo(null);
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <div className="rp-row" style={{ justifyContent: 'space-between' }}>
          <BackButton fallback="/" label="Home" />
          <ThemeToggle />
        </div>
        <h1 className="auth-title">
          {mode === 'sign-in' ? 'Driver sign in' : 'Create driver account'}
        </h1>
        <p className="auth-subtitle">
          Use your Supabase email and password. Your deliveries stay private to
          your account.
        </p>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'sign-in'}
              className={
                mode === 'sign-in' ? 'auth-tab auth-tab-active' : 'auth-tab'
              }
              onClick={() => {
                setMode('sign-in');
                setError(null);
                setInfo(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'sign-up'}
              className={
                mode === 'sign-up' ? 'auth-tab auth-tab-active' : 'auth-tab'
              }
              onClick={() => {
                setMode('sign-up');
                setError(null);
                setInfo(null);
              }}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input
                className="auth-input"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="driver@example.com"
                required
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                className="auth-input"
                type="password"
                name="password"
                autoComplete={
                  mode === 'sign-in' ? 'current-password' : 'new-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                aria-describedby={password ? 'password-strength' : undefined}
              />
              {password.length > 0 && (
                <div
                  id="password-strength"
                  className="pwd-strength"
                  aria-live="polite"
                >
                  <div className="pwd-strength-bars" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={
                          'pwd-strength-bar' +
                          (i < strength.score
                            ? ` pwd-strength-bar-${strength.score}`
                            : '')
                        }
                      />
                    ))}
                  </div>
                  <div className="pwd-strength-meta">
                    <span
                      className={`pwd-strength-label pwd-strength-label-${strength.score}`}
                    >
                      {strength.label}
                    </span>
                    {mode === 'sign-up' && strength.tips.length > 0 && (
                      <span className="pwd-strength-tip">
                        {strength.tips[0]}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </label>

            {mode === 'sign-up' && (
              <label className="auth-field">
                <span className="auth-label">Confirm password</span>
                <input
                  className="auth-input"
                  type="password"
                  name="confirm"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                  minLength={6}
                />
                {confirm.length > 0 && (
                  <span
                    className={
                      passwordsMatch
                        ? 'pwd-match pwd-match-ok'
                        : 'pwd-match pwd-match-bad'
                    }
                  >
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </span>
                )}
              </label>
            )}

            {error && (
              <div className="auth-alert auth-alert-error" role="alert">
                {error}
              </div>
            )}
            {info && (
              <div className="auth-alert auth-alert-info" role="status">
                {info}
              </div>
            )}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'sign-in' ? (
              <>
                Need an account?{' '}
                <button type="button" className="auth-link" onClick={switchMode}>
                  Create one
                </button>
              </>
            ) : (
              <>
                Already registered?{' '}
                <button type="button" className="auth-link" onClick={switchMode}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}

export default AuthPage;
