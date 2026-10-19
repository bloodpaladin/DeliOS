import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import ImportRouteSheet from './pages/ImportRouteSheet';
import ActiveDelivery from './pages/ActiveDelivery';
import './App.css';

function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 space-y-4">
      <h1 className="text-xl font-semibold mb-2">RoutePilot Caribbean</h1>
      <p className="text-sm text-slate-400 mb-4">
        Delivery route optimizer for Trinidad &amp; Tobago
      </p>
      <Link
        to="/import"
        className="block w-full rounded-xl bg-emerald-600 py-4 text-center font-medium"
      >
        Import route sheet
      </Link>
      <p className="text-xs text-slate-500 pt-2">
        After saving a run from import, open it from history or paste the run id:
      </p>
      <RunIdOpener />
      <p className="mt-4 text-xs text-slate-500">
        Routing uses Google Routes API (real responses only). Waze / Google Maps
        open as separate navigation hand-offs.
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/import" element={<ImportRouteSheet />} />
        <Route path="/run/:runId" element={<ActiveDelivery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
