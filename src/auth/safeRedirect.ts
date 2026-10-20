/**
 * Safe internal redirect paths only — prevents open redirects.
 */

const ALLOWED_PREFIXES = ['/', '/import', '/run/'] as const;

/**
 * Returns a safe path to navigate to after sign-in, or "/" if unsafe/missing.
 */
export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/';
  let path = raw.trim();
  // Reject absolute URLs and protocol-relative
  if (
    path.startsWith('http:') ||
    path.startsWith('https:') ||
    path.startsWith('//') ||
    path.includes('://')
  ) {
    return '/';
  }
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  // Only allow known app routes
  if (path === '/') return '/';
  if (path === '/import' || path.startsWith('/import?')) return path.split('#')[0];
  if (path.startsWith('/run/')) {
    // /run/{uuid} only — basic shape check
    const rest = path.slice('/run/'.length).split(/[?#]/)[0];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rest)) {
      return `/run/${rest}`;
    }
    return '/';
  }
  // Explicit allow-list prefix check
  for (const prefix of ALLOWED_PREFIXES) {
    if (path === prefix || (prefix !== '/' && path.startsWith(prefix))) {
      return path.split('#')[0];
    }
  }
  return '/';
}

export function buildSignInPath(from: string): string {
  const safe = safeRedirectPath(from);
  if (safe === '/') return '/sign-in';
  return `/sign-in?redirect=${encodeURIComponent(safe)}`;
}
