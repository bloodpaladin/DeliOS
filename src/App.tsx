import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import ImportRouteSheet from './pages/ImportRouteSheet';
import './App.css';

function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <h1 className="text-xl font-semibold mb-2">RoutePilot Caribbean</h1>
      <p className="text-sm text-slate-400 mb-6">
        Delivery route optimizer for Trinidad &amp; Tobago
      </p>
      <Link
        to="/import"
        className="block w-full rounded-xl bg-emerald-600 py-4 text-center font-medium"
      >
        Import route sheet
      </Link>
      <p className="mt-6 text-xs text-slate-500">
        Map, optimization, and active navigation screens ship in later prompts.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/import" element={<ImportRouteSheet />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
