/**
 * In-app back control. Does not affect Supabase auth.
 */
import { useNavigate } from 'react-router-dom';

type Props = {
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
      className={className || 'rp-btn rp-btn-ghost rp-btn-sm'}
      aria-label={label}
    >
      ← {label}
    </button>
  );
}
