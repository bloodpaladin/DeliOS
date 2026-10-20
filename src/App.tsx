import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ImportRouteSheet from './pages/ImportRouteSheet';
import ActiveDelivery from './pages/ActiveDelivery';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LogoutButton } from './components/LogoutButton';
import { supabase } from './lib/supabase';
import './App.css';

type RecentRun = {
  id: string;
  run_name: string | null;
  run_status: string;
  created_at: string;
  remaining?: number;
  completed?: number;
};

function Dashboard() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [activeRun, setActiveRun] = useState<RecentRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      setRecent([]);
      setActiveRun(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingRuns(true);
      setLoadError(null);
      try {
        const { data: runs, error } = await supabase
          .from('delivery_runs')
          .select('id, run_name, run_status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8);
        if (error) throw error;
        if (cancelled) return;

        const enriched: RecentRun[] = [];
        for (const r of runs ?? []) {
          const { data: stops } = await supabase
            .from('delivery_stops')
            .select('delivery_status')
            .eq('delivery_run_id', r.id);
          const list = stops ?? [];
          const completed = list.filter((s) => s.delivery_status === 'delivered').length;
          const remaining = list.filter((s) =>
            ['pending', 'navigating', 'arrived', 'skipped', 'failed'].includes(
              s.delivery_status
            )
          ).length;
          enriched.push({
            ...r,
            completed,
            remaining,
          });
        }
        if (cancelled) return;
        setRecent(enriched);
        const unfinished = enriched.find(
          (r) =>
            r.run_status !== 'completed' &&
            r.run_status !== 'cancelled' &&
            (r.remaining ?? 0) > 0
        );
        setActiveRun(unfinished ?? null);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error
              ? e.message
              : 'Could not load runs. Check connection or database setup.'
          );
        }
      } finally {
        if (!cancelled) setLoadingRuns(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  return (
    <div className="rp-page">
      <header className="rp-topbar">
        <div className="rp-brand">
          <span className="rp-brand-mark">Trinidad &amp; Tobago</span>
          <h1 className="rp-brand-name">RoutePilot Caribbean</h1>
        </div>
        {status === 'authenticated' && user ? (
          <div className="rp-row" style={{ justifyContent: 'flex-end' }}>
            <span
              className="rp-hint"
              style={{ maxWidth: '7.5rem', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={user.email ?? undefined}
            >
              {user.email}
            </span>
            <LogoutButton compact />
          </div>
        ) : status === 'loading' ? (
          <span className="rp-hint">…</span>
        ) : (
          <Link to="/sign-in" className="rp-btn rp-btn-primary rp-btn-sm">
            Sign in
          </Link>
        )}
      </header>

      <div className="rp-shell rp-stack">
        {status === 'loading' && (
          <p className="rp-muted animate-pulse">Checking session…</p>
        )}

        {status === 'unauthenticated' && (
          <section className="rp-card rp-card-elevated rp-stack">
            <h2 className="rp-topbar-title" style={{ margin: 0 }}>
              Deliver with clarity
            </h2>
            <p className="rp-muted" style={{ margin: 0 }}>
              Import a printed route sheet, confirm stops, then work through
              mini-mart deliveries across Trinidad and Tobago—one clear next
              step at a time.
            </p>
            <Link to="/sign-in" className="rp-btn rp-btn-primary rp-btn-lg rp-btn-block">
              Sign in to continue
            </Link>
            <p className="rp-hint" style={{ margin: 0, textAlign: 'center' }}>
              Accounts use Supabase Auth. Your runs stay private to your user.
            </p>
          </section>
        )}

        {status === 'authenticated' && (
          <>
            {/* Primary next action */}
            <section className="rp-stack">
              <p className="rp-section-title">What to do next</p>
              {activeRun ? (
                <div className="rp-card rp-card-elevated rp-stack">
                  <div>
                    <StatusLine
                      label="Active run"
                      value={activeRun.run_name || 'Delivery run'}
                    />
                    <p className="rp-muted" style={{ margin: '0.35rem 0 0' }}>
                      {activeRun.remaining ?? '—'} remaining ·{' '}
                      {activeRun.completed ?? 0} delivered
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rp-btn rp-btn-primary rp-btn-lg rp-btn-block"
                    onClick={() => navigate(`/run/${activeRun.id}`)}
                  >
                    Resume active run
                  </button>
                  <Link
                    to="/import"
                    className="rp-btn rp-btn-secondary rp-btn-block"
                  >
                    Import another route sheet
                  </Link>
                </div>
              ) : (
                <div className="rp-card rp-card-elevated rp-stack">
                  <p className="rp-muted" style={{ margin: 0 }}>
                    Start by photographing or uploading your printed delivery
                    list. Review every stop before you drive.
                  </p>
                  <Link
                    to="/import"
                    className="rp-btn rp-btn-primary rp-btn-lg rp-btn-block"
                  >
                    Import route sheet
                  </Link>
                </div>
              )}
            </section>

            {loadError && (
              <div className="rp-alert rp-alert-warn" role="status">
                {loadError}
                <div className="rp-hint" style={{ marginTop: '0.35rem' }}>
                  If tables are missing, apply Supabase migrations. Map and OCR
                  features need their keys configured separately.
                </div>
              </div>
            )}

            <section className="rp-section">
              <p className="rp-section-title">Recent runs</p>
              {loadingRuns && (
                <p className="rp-muted animate-pulse">Loading runs…</p>
              )}
              {!loadingRuns && recent.length === 0 && !loadError && (
                <div className="rp-empty rp-card">
                  <strong>No runs yet</strong>
                  Import a route sheet to create your first delivery run.
                </div>
              )}
              <div className="rp-stack-sm">
                {recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="rp-stop"
                    onClick={() => navigate(`/run/${r.id}`)}
                  >
                    <div className="rp-stop-body">
                      <p className="rp-stop-name">
                        {r.run_name || 'Delivery run'}
                      </p>
                      <p className="rp-stop-addr">
                        {r.completed ?? 0} delivered · {r.remaining ?? 0}{' '}
                        remaining · {formatDate(r.created_at)}
                      </p>
                    </div>
                    <span className="rp-badge rp-badge-pending">
                      {r.run_status}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <details className="rp-card">
              <summary className="rp-hint" style={{ cursor: 'pointer' }}>
                Advanced: open run by ID
              </summary>
              <RunIdOpener />
            </details>
          </>
        )}

        <p className="rp-hint" style={{ textAlign: 'center' }}>
          Park safely before using the app. Navigation opens in Waze or Google
          Maps—turn-by-turn is handled there, not in RoutePilot.
        </p>
      </div>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="rp-section-title" style={{ marginBottom: 0 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{value}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function RunIdOpener() {
  return (
    <form
      className="rp-stack-sm"
      style={{ marginTop: '0.75rem' }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const id = String(fd.get('runId') || '').trim();
        if (id) window.location.href = `/run/${id}`;
      }}
    >
      <label className="auth-field">
        <span className="auth-label">Run UUID</span>
        <input
          name="runId"
          className="auth-input"
          placeholder="Paste run id only if needed"
          autoComplete="off"
        />
      </label>
      <button type="submit" className="rp-btn rp-btn-secondary rp-btn-block">
        Open run
      </button>
    </form>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/sign-in" element={<AuthPage />} />
      <Route
        path="/import"
        element={
          <ProtectedRoute>
            <ImportRouteSheet />
          </ProtectedRoute>
        }
      />
      <Route
        path="/run/:runId"
        element={
          <ProtectedRoute>
            <ActiveDelivery />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
