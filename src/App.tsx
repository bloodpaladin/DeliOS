import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import ImportRouteSheet from './pages/ImportRouteSheet';
import ActiveDelivery from './pages/ActiveDelivery';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LogoutButton } from './components/LogoutButton';
import './App.css';

function Dashboard() {
  const { status, user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold mb-1">RoutePilot Caribbean</h1>
          <p className="text-sm text-slate-400">
            Delivery route optimizer for Trinidad &amp; Tobago
          </p>
        </div>
        {status === 'authenticated' && user ? (
          <div className="text-right shrink-0 space-y-2">
            <div className="text-xs text-slate-400 truncate max-w-[10rem]">
              {user.email}
            </div>
            <LogoutButton compact />
          </div>
        ) : status === 'loading' ? (
          <span className="text-xs text-slate-500">…</span>
        ) : (
          <Link to="/sign-in" className="text-sm text-emerald-400 font-medium">
            Sign in
          </Link>
        )}
      </div>

      {status === 'authenticated' ? (
        <>
          <Link
            to="/import"
            className="block w-full rounded-xl bg-emerald-600 py-4 text-center font-medium"
          >
            Import route sheet
          </Link>
          <p className="text-xs text-slate-500 pt-2">
            After saving a run from import, open it with the run id:
          </p>
          <RunIdOpener />
        </>
      ) : status === 'unauthenticated' ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
          <p className="text-sm text-slate-300">
            Sign in to import route sheets and manage your deliveries. Data is
            protected per driver account.
          </p>
          <Link
            to="/sign-in"
            className="block w-full rounded-xl bg-emerald-600 py-4 text-center font-medium"
          >
            Sign in or create account
          </Link>
        </div>
      ) : (
        <p className="text-sm text-slate-500 animate-pulse">Checking session…</p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Routing uses Google Routes API when configured. Waze / Google Maps open
        as separate navigation hand-offs.
      </p>
    </div>
  );
}

function RunIdOpener() {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const id = String(fd.get('runId') || '').trim();
        if (id) window.location.href = `/run/${id}`;
      }}
    >
      <input
        name="runId"
        className="flex-1 rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
        placeholder="delivery_runs UUID"
      />
      <button
        type="submit"
        className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium"
      >
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
