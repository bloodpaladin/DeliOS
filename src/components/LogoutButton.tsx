/**
 * Shared logout — Supabase Auth signOut only.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type Props = {
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
    if (error) console.warn('[auth] signOut:', error);
    navigate('/sign-in', { replace: true });
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={busy}
      className={
        className ||
        `rp-btn rp-btn-ghost ${compact ? 'rp-btn-sm' : ''}`
      }
      aria-label="Log out"
    >
      {busy ? 'Signing out…' : 'Log out'}
    </button>
  );
}
