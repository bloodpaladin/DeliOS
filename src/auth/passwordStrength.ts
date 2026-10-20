/**
 * Simple client-side password strength score (0–4).
 * Guidance only — Supabase still enforces its own min length.
 */

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthLevel;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  tips: string[];
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const tips: string[] = [];
  if (!password) {
    return { score: 0, label: 'Too short', tips: ['Enter a password'] };
  }

  let score = 0;

  if (password.length >= 6) score += 1;
  else tips.push('Use at least 6 characters');

  if (password.length >= 10) score += 1;
  else if (password.length >= 6) tips.push('Longer passwords are stronger');

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else tips.push('Mix upper and lower case');

  if (/\d/.test(password)) score += 1;
  else tips.push('Add a number');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else tips.push('Add a symbol (!@#$…)');

  // Cap at 4 and map empty/short to 0–1
  if (password.length < 6) {
    return { score: 0, label: 'Too short', tips };
  }

  const clamped = Math.min(4, score) as StrengthLevel;
  const label =
    clamped <= 1 ? 'Weak' : clamped === 2 ? 'Fair' : clamped === 3 ? 'Good' : 'Strong';

  return {
    score: clamped,
    label,
    tips: clamped >= 3 ? [] : tips.slice(0, 2),
  };
}
