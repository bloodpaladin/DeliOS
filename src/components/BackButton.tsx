/**
 * In-app back control. Does not affect Supabase auth.
 */
import { useNavigate } from 'react-router-dom';

type Props = {
  /** Fallback path when history is empty (default "/") */
  fallback?: string;
  label?: string;
  className?: string;
};

export function BackButton({
  fallback = '/',
  label = 'Back',
  className = '',
}: Props) {
  const navigate = useNavigate();

  function onBack() {
    // Prefer real browser history; fall back if user landed directly
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  }

  return (
    <button
      type="button"
      onClick={onBack}
      className={
        className ||
        'rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200'
      }
    >
      ← {label}
    </button>
  );
}
