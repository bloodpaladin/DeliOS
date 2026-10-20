/**
 * Active delivery: stop list + route summary + Waze/Google nav + mark delivered.
 * Map pins use a lightweight list-synced view; full Google Map embed needs API key + @react-google-maps/api.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDeliveryStore } from '../stores/deliveryStore';
import {
  buildWazeUrl,
  buildGoogleMapsNavUrl,
  openExternalNav,
} from '../services/navigation';
import { manualPinPosition } from '../services/geolocation';
import { LogoutButton } from '../components/LogoutButton';
import { ThemeToggle } from '../components/ThemeToggle';
import { BackButton } from '../components/BackButton';
import { StatusBadge } from '../components/StatusBadge';

function formatKm(m: number): string {
  if (!m) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatMins(s: number): string {
  if (!s) return '—';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function ActiveDelivery() {
  const { runId } = useParams<{ runId: string }>();
  const store = useDeliveryStore();
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [showFail, setShowFail] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  useEffect(() => {
    if (runId) {
      store.loadRun(runId);
    }
    return () => {
      /* keep state for resume */
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const active = store.stops.find((s) => s.id === store.activeStopId);
  const target = store.getNavigationTarget();
  const pending = store.pendingStops();

  const legToActive = useMemo(() => {
    if (!store.optimizedRoute || !store.activeStopId) return null;
    return store.optimizedRoute.legs.find((l) => l.toStopId === store.activeStopId);
  }, [store.optimizedRoute, store.activeStopId]);

  const orderedPending = useMemo(() => {
    const order = store.optimizedRoute?.orderedStopIds;
    if (!order) return pending;
    const map = new Map(pending.map((s) => [s.id, s]));
    const sorted = order.map((id) => map.get(id)).filter(Boolean) as typeof pending;
    const rest = pending.filter((p) => !order.includes(p.id));
    return [...sorted, ...rest];
  }, [pending, store.optimizedRoute]);

  if (!runId) {
    return (
      <div className="p-4 text-slate-300">
        Missing run id. <Link to="/">Home</Link>
      </div>
    );
  }

  return (
    <div className="rp-page">
      <header className="rp-topbar">
        <div className="flex items-center gap-3 min-w-0">
          <BackButton fallback="/" />
          <div className="min-w-0">
            <h1 className="rp-topbar-title truncate">
              {store.run?.run_name || 'Delivery run'}
            </h1>
            <p className="rp-topbar-sub">
              {pending.length} remaining ·{' '}
              {store.stops.filter((s) => s.delivery_status === 'delivered').length}{' '}
              delivered
            </p>
          </div>
        </div>
        <div className="rp-row shrink-0">
          <Link to="/" className="rp-btn rp-btn-ghost rp-btn-sm">
            Home
          </Link>
          <ThemeToggle />
        <LogoutButton compact />
        </div>
      </header>

      <div className="rp-shell" style={{ paddingTop: '0.75rem' }}>
      <div className="rp-driving-banner" role="note">
        Park safely before using the app. Use Waze or Google Maps for turn-by-turn while driving.
      </div>

      {store.error && (
        <div className="rp-alert rp-alert-error" role="alert">
          {store.error}
        </div>
      )}

      {/* Start position */}
      <section className="p-4 space-y-2 border-b border-slate-800">
        <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          Starting point
        </h2>
        {store.startPosition ? (
          <p className="text-sm">
            {store.startPosition.lat.toFixed(5)}, {store.startPosition.lng.toFixed(5)}
            <span className="text-slate-500 text-xs ml-2">
              ({store.startPosition.source}
              {store.startPosition.isStale ? ' · possibly stale' : ''})
            </span>
          </p>
        ) : (
          <p className="text-sm text-amber-300">No start position set</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-700 px-3 py-2 text-xs"
            onClick={() => store.acquireGps()}
          >
            Use GPS
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-700 px-3 py-2 text-xs"
            onClick={() => {
              const lat = parseFloat(manualLat);
              const lng = parseFloat(manualLng);
              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                store.setStartPosition(manualPinPosition(lat, lng));
              }
            }}
          >
            Set pin
          </button>
          <input
            className="w-24 rounded-lg bg-slate-800 border border-slate-600 px-2 py-1 text-xs"
            placeholder="lat"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
          />
          <input
            className="w-24 rounded-lg bg-slate-800 border border-slate-600 px-2 py-1 text-xs"
            placeholder="lng"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={store.isOptimizing || !store.startPosition}
          className="rp-btn rp-btn-primary rp-btn-block" 
          onClick={() => store.optimize({ force: true })}
        >
          {store.isOptimizing ? 'Optimizing…' : 'Optimize remaining route'}
        </button>
        {store.optimizedRoute && (
          <div className="text-xs text-slate-400 space-y-1">
            <div>
              Est. {formatKm(store.optimizedRoute.totalDistanceMeters)} ·{' '}
              {formatMins(store.optimizedRoute.totalDurationSeconds)} ·{' '}
              {store.optimizedRoute.provider}
              {store.optimizedRoute.trafficAware ? ' · traffic-aware' : ''}
            </div>
            <div className="text-amber-300/90">
              Provider-supported estimate — not a proven global legal optimum.
            </div>
            {store.optimizedRoute.warnings.slice(0, 2).map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        )}
      </section>

      {/* Current stop */}
      {active && target && (
        <section className="p-4 space-y-3 border-b border-slate-800 bg-slate-900/50">
          <div className="text-xs text-emerald-400 font-medium">NEXT STOP</div>
          <h2 className="text-lg font-semibold">{target.name}</h2>
          <p className="text-sm text-slate-300">{target.address}</p>
          {active.business?.verification_status && (
            <p className="text-xs text-slate-500">
              Verification: {active.business.verification_status}
            </p>
          )}
          {legToActive && (
            <p className="text-sm text-slate-400">
              Leg: {formatKm(legToActive.distanceMeters)} ·{' '}
              {formatMins(legToActive.durationSeconds)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rp-btn rp-btn-sky rp-btn-lg rp-btn-block"
              onClick={() => {
                store.markStatus(active.id, 'navigating');
                openExternalNav(buildWazeUrl(target));
              }}
            >
              Navigate · Waze
            </button>
            <button
              type="button"
              className="rp-btn rp-btn-secondary rp-btn-lg rp-btn-block"
              onClick={() => {
                store.markStatus(active.id, 'navigating');
                openExternalNav(buildGoogleMapsNavUrl(target));
              }}
            >
              Navigate · Google
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Turn-by-turn is provided by Waze or Google Maps, not by this app&apos;s
            overview route.
          </p>

          {!confirmDeliver ? (
            <button
              type="button"
              className="rp-btn rp-btn-primary rp-btn-lg rp-btn-block"
              onClick={() => setConfirmDeliver(true)}
            >
              Mark Delivered
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                className="rp-btn rp-btn-primary rp-btn-lg" style={{ flex: 1 }}
                disabled={store.isPersisting}
                onClick={async () => {
                  await store.markStatus(active.id, 'delivered', {
                    idempotencySuffix: `tap-${Date.now()}`,
                  });
                  setConfirmDeliver(false);
                }}
              >
                Confirm delivered
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-700 px-4 py-4"
                onClick={() => setConfirmDeliver(false)}
              >
                Cancel
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-lg bg-slate-800 py-3 text-xs"
              onClick={() => store.markStatus(active.id, 'skipped')}
            >
              Skip (keep outstanding)
            </button>
            <button
              type="button"
              className="rounded-lg bg-red-900/80 py-3 text-xs"
              onClick={() => setShowFail(true)}
            >
              Failed / cannot deliver
            </button>
          </div>

          {showFail && (
            <div className="space-y-2 rounded-xl border border-red-800 p-3">
              <textarea
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm min-h-[60px]"
                placeholder="Reason required"
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
              />
              <button
                type="button"
                className="w-full rounded-lg bg-red-700 py-2 text-sm"
                disabled={!failReason.trim()}
                onClick={async () => {
                  await store.markStatus(active.id, 'failed', {
                    failureReason: failReason.trim(),
                  });
                  setShowFail(false);
                  setFailReason('');
                }}
              >
                Submit failure
              </button>
            </div>
          )}
        </section>
      )}

      {/* Synchronized stop list */}
      <section className="p-4 space-y-2">
        <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          Stops (list ↔ map order)
        </h2>
        {store.stops.map((s, idx) => {
          const isActive = s.id === store.activeStopId;
          const done = s.delivery_status === 'delivered';
          const failed = s.delivery_status === 'failed';
          const skipped = s.delivery_status === 'skipped';
          const orderIdx = store.optimizedRoute?.orderedStopIds.indexOf(s.id);
          const number =
            orderIdx != null && orderIdx >= 0 ? orderIdx + 1 : idx + 1;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (['pending', 'navigating', 'arrived', 'skipped'].includes(s.delivery_status)) {
                  store.setActiveStop(s.id);
                }
              }}
              className={`w-full text-left rounded-xl border px-3 py-3 ${
                isActive
                  ? 'border-emerald-500 bg-emerald-950/40'
                  : done
                    ? 'border-slate-800 bg-slate-900/40 opacity-60'
                    : failed
                      ? 'border-red-900/50 bg-red-950/20'
                      : 'border-slate-700 bg-slate-900'
              }`}
            >
              <div className="flex gap-3 items-start">
                <span
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    done
                      ? 'bg-slate-700 text-slate-400'
                      : isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {done ? '✓' : number}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {s.business?.canonical_business_name ||
                      s.customer_name_raw ||
                      'Stop'}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {s.business?.normalized_address || s.address_raw}
                  </div>
                  <div className="rp-row" style={{ marginTop: '0.35rem', gap: '0.35rem' }}>
                    <StatusBadge status={s.delivery_status} />
                    {s.business?.verification_status && (
                      <StatusBadge status={s.business.verification_status} />
                    )}
                    {skipped && (
                      <span className="rp-hint">Still outstanding</span>
                    )}
                    {failed && s.failure_reason && (
                      <span className="rp-hint">{s.failure_reason}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Mini map placeholder – coordinates list for offline-tolerant overview */}
      <section className="p-4">
        <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
          Map overview
        </h2>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400 space-y-1 max-h-48 overflow-auto">
          {store.startPosition && (
            <div>
              Start ({store.startPosition.source}): {store.startPosition.lat.toFixed(4)},{' '}
              {store.startPosition.lng.toFixed(4)}
            </div>
          )}
          {orderedPending.map((s, i) => (
            <div
              key={s.id}
              className={s.id === store.activeStopId ? 'text-emerald-400' : ''}
            >
              #{i + 1}{' '}
              {s.business?.latitude?.toFixed(4) ?? '?'},{' '}
              {s.business?.longitude?.toFixed(4) ?? '?'} —{' '}
              {s.business?.canonical_business_name || s.customer_name_raw}
            </div>
          ))}
          {!store.startPosition && orderedPending.length === 0 && (
            <div>No coordinates yet. Import a sheet and verify addresses first.</div>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Map tiles need a Google Maps JavaScript API key. Until configured, use this coordinate list. Route order uses the Routes API only when optimization succeeds with a valid key.
        </p>
      </section>
      </div>
    </div>
  );
}

export default ActiveDelivery;
