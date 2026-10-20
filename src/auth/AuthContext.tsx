/**
 * Auth state for RoutePilot — restores persisted Supabase sessions and
 * subscribes to onAuthStateChange. Unsubscribes on unmount.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapAuthError(message: string | undefined): string {
  if (!message) return 'Authentication failed. Please try again.';
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email before signing in. Check your inbox for a confirmation link.';
  }
  if (m.includes('user already registered')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (m.includes('password')) {
    return message;
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;
    let resolvedBySubscription = false;

    // Prefer onAuthStateChange (including INITIAL_SESSION) as the source of truth.
    // getSession only fills state if still loading and the subscription has not run yet.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      resolvedBySubscription = true;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || resolvedBySubscription) return;
      if (error) {
        console.warn('[auth] getSession:', error.message);
        setSession(null);
        setUser(null);
        setStatus('unauthenticated');
        return;
      }
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setStatus(data.session ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { error: mapAuthError(error.message) };
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      return { error: mapAuthError(error.message), needsEmailConfirmation: false };
    }
    // When email confirmation is required, session may be null until confirmed
    const needsEmailConfirmation = !data.session;
    return { error: null, needsEmailConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return { error: mapAuthError(error.message) };
    return { error: null };
  }, []);

  const value = useMemo(
    () => ({ status, session, user, signIn, signUp, signOut }),
    [status, session, user, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
