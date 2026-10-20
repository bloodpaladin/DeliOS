/**
 * Shared logout control — signs out via Supabase Auth and returns to sign-in.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type Props = {
  /** Compact style for dense headers */
  compact?: boolean;
  className?: string;
};

export function LogoutButton({ compact = false, className = '' }: Props) {
  const { signOut, status } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (status !== 'authenticated') return null;

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    const { error } = await signOut();
    setBusy(false);
    if (error) {
      // Still leave protected areas if session is unclear
      console.warn('[auth] signOut:', error);
    }
    navigate('/sign-in', { replace: true });
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={busy}
      className={
        className ||
        (compact
          ? 'rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-50'
          : 'rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 disabled:opacity-50')
      }
    >
      {busy ? 'Signing out…' : 'Log out'}
    </button>
  );
}
