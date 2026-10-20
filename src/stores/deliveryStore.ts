/**
 * Active delivery run: load, optimize, complete/fail/skip, resume.
 * Completed stops never re-enter the pending optimization set.
 */
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { DeliveryRun, DeliveryStop, BusinessLocation } from '../types/database';
import type {
  OptimizedRoute,
  RouteObjective,
  RouteStopInput,
  StartPosition,
  StopDeliveryStatus,
  VehicleProfile,
  NavigationTarget,
} from '../types/routing';
import { optimizeDeliveryRun } from '../services/routing/optimizer';
import { getCurrentPosition, getCachedPosition } from '../services/geolocation';

export interface EnrichedStop extends DeliveryStop {
  business?: BusinessLocation | null;
}

interface DeliveryState {
  run: DeliveryRun | null;
  stops: EnrichedStop[];
  startPosition: StartPosition | null;
  optimizedRoute: OptimizedRoute | null;
  activeStopId: string | null;
  objective: RouteObjective;
  vehicle: VehicleProfile;
  isOptimizing: boolean;
  isPersisting: boolean;
  error: string | null;
  lastOptimizedAt: string | null;

  // actions
  loadRun: (runId: string) => Promise<void>;
  setStartPosition: (pos: StartPosition) => void;
  acquireGps: () => Promise<void>;
  setObjective: (o: RouteObjective) => void;
  setVehicle: (v: Partial<VehicleProfile>) => void;
  optimize: (opts?: { force?: boolean }) => Promise<void>;
  setActiveStop: (stopId: string | null) => void;
  markStatus: (
    stopId: string,
    status: StopDeliveryStatus,
    opts?: { failureReason?: string; idempotencySuffix?: string }
  ) => Promise<void>;
  selectNextPending: () => void;
  getNavigationTarget: (stopId?: string | null) => NavigationTarget | null;
  pendingStops: () => EnrichedStop[];
  reset: () => void;
}

function toRouteInput(s: EnrichedStop): RouteStopInput | null {
  const lat = s.business?.latitude;
  const lng = s.business?.longitude;
  if (lat == null || lng == null) return null;
  return {
    stopId: s.id,
    businessLocationId: s.business_location_id,
    name:
      s.business?.canonical_business_name ||
      s.customer_name_raw ||
      'Stop',
    address:
      s.business?.normalized_address ||
      s.business?.original_address ||
      s.address_raw ||
      '',
    lat,
    lng,
    placeId: s.business?.place_id,
    verificationStatus: s.business?.verification_status,
    priority: s.priority,
    status: s.delivery_status as StopDeliveryStatus,
  };
}

/** Stops that participate in remaining-route optimization */
function optimizable(stops: EnrichedStop[]): EnrichedStop[] {
  return stops.filter((s) =>
    ['pending', 'navigating', 'arrived', 'skipped'].includes(s.delivery_status)
  );
}

const initial = {
  run: null as DeliveryRun | null,
  stops: [] as EnrichedStop[],
  startPosition: null as StartPosition | null,
  optimizedRoute: null as OptimizedRoute | null,
  activeStopId: null as string | null,
  objective: 'time' as RouteObjective,
  vehicle: { type: 'car' as const },
  isOptimizing: false,
  isPersisting: false,
  error: null as string | null,
  lastOptimizedAt: null as string | null,
};

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  ...initial,

  pendingStops: () =>
    get().stops.filter((s) =>
      ['pending', 'navigating', 'arrived', 'skipped'].includes(s.delivery_status)
    ),

  reset: () => set({ ...initial }),

  loadRun: async (runId) => {
    set({ error: null });
    const { data: run, error: runErr } = await supabase
      .from('delivery_runs')
      .select('*')
      .eq('id', runId)
      .single();
    if (runErr || !run) {
      set({ error: runErr?.message ?? 'Run not found' });
      return;
    }

    const { data: stops, error: stopErr } = await supabase
      .from('delivery_stops')
      .select('*')
      .eq('delivery_run_id', runId)
      .order('stop_number', { ascending: true, nullsFirst: false });

    if (stopErr) {
      set({ error: stopErr.message });
      return;
    }

    const bizIds = [
      ...new Set(
        (stops ?? [])
          .map((s) => s.business_location_id)
          .filter(Boolean) as string[]
      ),
    ];
    let bizMap = new Map<string, BusinessLocation>();
    if (bizIds.length) {
      const { data: biz } = await supabase
        .from('business_locations')
        .select('*')
        .in('id', bizIds);
      for (const b of biz ?? []) bizMap.set(b.id, b);
    }

    const enriched: EnrichedStop[] = (stops ?? []).map((s) => ({
      ...s,
      business: s.business_location_id
        ? bizMap.get(s.business_location_id) ?? null
        : null,
    }));

    // Restore active stop: first pending/navigating/arrived in optimized order or sheet order
    const active =
      enriched.find((s) =>
        ['navigating', 'arrived'].includes(s.delivery_status)
      ) ??
      enriched.find((s) => s.delivery_status === 'pending') ??
      enriched.find((s) => s.delivery_status === 'skipped') ??
      null;

    // Start position: run start coords or cache
    let start: StartPosition | null = null;
    if (run.starting_latitude != null && run.starting_longitude != null) {
      start = {
        lat: run.starting_latitude,
        lng: run.starting_longitude,
        address: run.starting_address,
        source: 'manual_pin',
        capturedAt: run.updated_at,
        isStale: true,
      };
    } else {
      start = getCachedPosition();
    }

    // Restore last route snapshot if present
    let optimized: OptimizedRoute | null = null;
    const { data: snap } = await supabase
      .from('route_snapshots')
      .select('*')
      .eq('delivery_run_id', runId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snap?.ordered_stop_ids) {
      const ids = snap.ordered_stop_ids as string[];
      optimized = {
        orderedStopIds: ids,
        legs: [],
        totalDistanceMeters: Number(snap.estimated_distance_meters) || 0,
        totalDurationSeconds: Number(snap.estimated_duration_seconds) || 0,
        provider: snap.route_provider,
        objective: (snap.optimization_objective as RouteObjective) || 'time',
        trafficAware: false,
        computedAt: snap.created_at,
        isEstimate: true,
        limitations: ['Restored from last snapshot; re-optimize for live traffic.'],
        warnings: [],
      };
    }

    set({
      run,
      stops: enriched,
      startPosition: start,
      activeStopId: active?.id ?? null,
      optimizedRoute: optimized,
      objective: (run.optimization_objective as RouteObjective) || 'time',
    });
  },

  setStartPosition: (pos) => set({ startPosition: pos }),

  acquireGps: async () => {
    try {
      const pos = await getCurrentPosition({ highAccuracy: true });
      set({ startPosition: pos });
      const run = get().run;
      if (run) {
        await supabase
          .from('delivery_runs')
          .update({
            starting_latitude: pos.lat,
            starting_longitude: pos.lng,
          })
          .eq('id', run.id);
      }
    } catch (e) {
      const cached = getCachedPosition();
      if (cached) {
        set({
          startPosition: { ...cached, isStale: true },
          error: `GPS unavailable (${e instanceof Error ? e.message : String(e)}). Using last known position.`,
        });
      } else {
        set({
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  },

  setObjective: (objective) => set({ objective }),
  setVehicle: (v) => set({ vehicle: { ...get().vehicle, ...v } }),

  optimize: async (opts) => {
    const { startPosition, stops, objective, vehicle, run, activeStopId } = get();
    if (!startPosition) {
      set({ error: 'Set a starting position (GPS or map pin) before optimizing.' });
      return;
    }

    const pool = optimizable(stops);
    const inputs = pool
      .map(toRouteInput)
      .filter(Boolean) as RouteStopInput[];

    if (!inputs.length) {
      set({
        optimizedRoute: {
          orderedStopIds: [],
          legs: [],
          totalDistanceMeters: 0,
          totalDurationSeconds: 0,
          provider: 'none',
          objective,
          trafficAware: false,
          computedAt: new Date().toISOString(),
          isEstimate: true,
          limitations: ['No unfinished stops with coordinates'],
          warnings: [],
        },
      });
      return;
    }

    // Do not reorder away from the currently active destination unless forced
    let preferFirst: string | undefined;
    if (!opts?.force && activeStopId && inputs.some((i) => i.stopId === activeStopId)) {
      preferFirst = activeStopId;
    }

    set({ isOptimizing: true, error: null });
    try {
      let ordered = inputs;
      if (preferFirst) {
        ordered = [
          inputs.find((i) => i.stopId === preferFirst)!,
          ...inputs.filter((i) => i.stopId !== preferFirst),
        ];
      }

      const route = await optimizeDeliveryRun({
        origin: { lat: startPosition.lat, lng: startPosition.lng },
        stops: ordered,
        objective,
        vehicle,
      });

      // If we locked the active stop first, ensure it stays first when not forcing
      if (preferFirst && route.orderedStopIds[0] !== preferFirst) {
        route.orderedStopIds = [
          preferFirst,
          ...route.orderedStopIds.filter((id) => id !== preferFirst),
        ];
        route.warnings.push(
          'Active destination kept first; remaining stops re-ordered.'
        );
      }

      // Persist stop_number on pending set
      const updates = route.orderedStopIds.map((id, idx) =>
        supabase
          .from('delivery_stops')
          .update({ stop_number: idx + 1 })
          .eq('id', id)
      );
      await Promise.all(updates);

      // Snapshot
      if (run) {
        await supabase.from('route_snapshots').insert({
          delivery_run_id: run.id,
          ordered_stop_ids: route.orderedStopIds,
          route_provider: route.provider,
          optimization_objective: objective,
          estimated_distance_meters: route.totalDistanceMeters,
          estimated_duration_seconds: route.totalDurationSeconds,
          provider_response_metadata: {
            limitations: route.limitations,
            warnings: route.warnings,
            trafficAware: route.trafficAware,
          },
        });
      }

      // Local stop order for UI
      const byId = new Map(get().stops.map((s) => [s.id, s]));
      const reordered = [
        ...route.orderedStopIds.map((id) => byId.get(id)).filter(Boolean),
        ...get().stops.filter((s) => !route.orderedStopIds.includes(s.id)),
      ] as EnrichedStop[];

      set({
        optimizedRoute: route,
        stops: reordered,
        lastOptimizedAt: route.computedAt,
        activeStopId:
          get().activeStopId &&
          route.orderedStopIds.includes(get().activeStopId!)
            ? get().activeStopId
            : route.orderedStopIds[0] ?? null,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ isOptimizing: false });
    }
  },

  setActiveStop: (stopId) => set({ activeStopId: stopId }),

  markStatus: async (stopId, status, opts) => {
    const { run, stops, isPersisting } = get();
    if (!run) return;

    const current = stops.find((s) => s.id === stopId);
    // Already in a terminal success state — skip duplicate completion writes
    if (
      current &&
      (current.delivery_status === 'delivered' ||
        current.delivery_status === 'cancelled') &&
      (status === 'delivered' || status === 'cancelled')
    ) {
      return;
    }
    if (isPersisting) return;

    set({ isPersisting: true, error: null });
    const idempotencyKey = `status-${stopId}-${status}-${opts?.idempotencySuffix ?? 'v1'}`;

    try {
      const patch: Record<string, unknown> = {
        delivery_status: status,
        updated_at: new Date().toISOString(),
      };
      if (status === 'delivered' || status === 'failed' || status === 'cancelled') {
        patch.completed_at = new Date().toISOString();
      }
      if (status === 'arrived') {
        patch.arrived_at = new Date().toISOString();
      }
      if (status === 'failed' && opts?.failureReason) {
        patch.failure_reason = opts.failureReason;
      }

      const { error } = await supabase
        .from('delivery_stops')
        .update(patch)
        .eq('id', stopId);
      if (error) throw error;

      // Idempotent event
      const eventType =
        status === 'delivered'
          ? 'delivered'
          : status === 'failed'
            ? 'failed'
            : status === 'skipped'
              ? 'skipped'
              : status === 'arrived'
                ? 'arrived'
                : 'status_changed';

      await supabase.rpc('record_delivery_event', {
        p_stop_id: stopId,
        p_run_id: run.id,
        p_event_type: eventType,
        p_metadata: {
          status,
          failure_reason: opts?.failureReason ?? null,
        },
        p_idempotency_key: idempotencyKey,
        p_actor_id: (await supabase.auth.getUser()).data.user?.id ?? null,
      });

      const nextStops = stops.map((s) =>
        s.id === stopId
          ? {
              ...s,
              delivery_status: status,
              failure_reason: opts?.failureReason ?? s.failure_reason,
              completed_at:
                status === 'delivered' || status === 'failed'
                  ? new Date().toISOString()
                  : s.completed_at,
            }
          : s
      );
      set({ stops: nextStops, isPersisting: false });

      // Auto-advance when completed or failed (failed stays outstanding? Prompt says failed remains outstanding)
      // Prompt: "A failed delivery remains outstanding." → keep in list but not auto-complete away
      // "Remove it from the pending-stop optimization set" applies to Delivered
      if (status === 'delivered' || status === 'cancelled') {
        get().selectNextPending();
        // Recalculate remaining
        await get().optimize({ force: true });
      } else if (status === 'skipped') {
        get().selectNextPending();
        await get().optimize({ force: true });
      } else if (status === 'navigating' || status === 'arrived') {
        set({ activeStopId: stopId });
      }
    } catch (e) {
      set({
        isPersisting: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  selectNextPending: () => {
    const { stops, optimizedRoute, activeStopId } = get();
    const pending = optimizable(stops);
    if (!pending.length) {
      set({ activeStopId: null });
      return;
    }
    const order = optimizedRoute?.orderedStopIds ?? pending.map((s) => s.id);
    // Next after current in order, else first pending
    let next: string | null = null;
    if (activeStopId) {
      const idx = order.indexOf(activeStopId);
      for (let i = idx + 1; i < order.length; i++) {
        if (pending.some((p) => p.id === order[i])) {
          next = order[i];
          break;
        }
      }
    }
    if (!next) {
      next = order.find((id) => pending.some((p) => p.id === id)) ?? pending[0].id;
    }
    set({ activeStopId: next });
  },

  getNavigationTarget: (stopId) => {
    const id = stopId ?? get().activeStopId;
    if (!id) return null;
    const s = get().stops.find((x) => x.id === id);
    if (!s) return null;
    return {
      stopId: s.id,
      name:
        s.business?.canonical_business_name ||
        s.customer_name_raw ||
        'Stop',
      address:
        s.business?.normalized_address ||
        s.business?.original_address ||
        s.address_raw ||
        '',
      lat: s.business?.latitude ?? null,
      lng: s.business?.longitude ?? null,
      placeId: s.business?.place_id,
    };
  },
}));
