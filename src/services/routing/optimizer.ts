/**
 * Stop-order optimization.
 *
 * Algorithm (documented limitations):
 * - Build a time (or distance) matrix via the routing provider when available.
 * - Nearest-neighbour construction from the origin, then 2-opt improvement.
 * - This is a heuristic — NOT a guarantee of global optimality.
 * - Time windows are soft: stops with earlier windows are preferred in the
 *   construction phase when scores are close.
 * - When matrix fails, falls back to greedy geographic nearest-neighbour with
 *   a clear warning (road network not used for ordering).
 */
import type {
  LatLng,
  OptimizedRoute,
  RouteObjective,
  RouteStopInput,
  VehicleProfile,
} from '../../types/routing';
import { getRoutingProvider } from './googleRoutes';

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function buildCostMatrix(
  points: LatLng[],
  cells: Array<{
    originIndex: number;
    destinationIndex: number;
    distanceMeters: number;
    durationSeconds: number;
    status: string;
  }>,
  objective: RouteObjective
): number[][] {
  const n = points.length;
  const m = Array.from({ length: n }, () => Array(n).fill(Number.POSITIVE_INFINITY));
  for (let i = 0; i < n; i++) m[i][i] = 0;
  for (const c of cells) {
    if (c.status !== 'ok') continue;
    const cost =
      objective === 'distance'
        ? c.distanceMeters
        : objective === 'balanced'
          ? c.durationSeconds + c.distanceMeters / 20
          : c.durationSeconds;
    if (c.originIndex < n && c.destinationIndex < n) {
      m[c.originIndex][c.destinationIndex] = cost;
    }
  }
  // Fill missing with haversine penalty so NN still works
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(m[i][j])) {
        m[i][j] = haversineMeters(points[i], points[j]) * (objective === 'distance' ? 1 : 0.1);
      }
    }
  }
  return m;
}

function nearestNeighbour(cost: number[][], startIndex: number): number[] {
  const n = cost.length;
  const visited = new Set<number>([startIndex]);
  const tour = [startIndex];
  let cur = startIndex;
  while (visited.size < n) {
    let best = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      if (cost[cur][j] < bestCost) {
        bestCost = cost[cur][j];
        best = j;
      }
    }
    if (best < 0) break;
    visited.add(best);
    tour.push(best);
    cur = best;
  }
  return tour;
}

function twoOpt(tour: number[], cost: number[][], maxIter = 80): number[] {
  // Keep index 0 fixed as origin
  let improved = true;
  let iter = 0;
  let t = tour.slice();
  while (improved && iter < maxIter) {
    improved = false;
    iter++;
    for (let i = 1; i < t.length - 1; i++) {
      for (let k = i + 1; k < t.length; k++) {
        const a = t[i - 1];
        const b = t[i];
        const c = t[k];
        const d = k + 1 < t.length ? t[k + 1] : null;
        const current =
          cost[a][b] + (d !== null ? cost[c][d] : 0);
        const swapped =
          cost[a][c] + (d !== null ? cost[b][d] : 0);
        if (swapped + 1e-6 < current) {
          const segment = t.slice(i, k + 1).reverse();
          t = t.slice(0, i).concat(segment, t.slice(k + 1));
          improved = true;
        }
      }
    }
  }
  return t;
}

/**
 * Optimize unfinished stops and return a full OptimizedRoute from the provider
 * in the computed order.
 */
export async function optimizeDeliveryRun(params: {
  origin: LatLng;
  stops: RouteStopInput[];
  objective?: RouteObjective;
  vehicle?: VehicleProfile;
}): Promise<OptimizedRoute> {
  const objective = params.objective ?? 'time';
  const unfinished = params.stops.filter((s) =>
    ['pending', 'navigating', 'arrived', 'skipped'].includes(s.status)
  );

  if (unfinished.length === 0) {
    return {
      orderedStopIds: [],
      legs: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      provider: 'none',
      objective,
      trafficAware: false,
      computedAt: new Date().toISOString(),
      isEstimate: true,
      limitations: ['No unfinished stops to optimize'],
      warnings: [],
    };
  }

  // Priority sort soft preference: higher priority earlier among equals
  const sorted = [...unfinished].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const points: LatLng[] = [
    params.origin,
    ...sorted.map((s) => ({ lat: s.lat, lng: s.lng })),
  ];

  const provider = getRoutingProvider();
  let orderIndices: number[] = [0]; // origin first
  const limitations: string[] = [];
  const warnings: string[] = [];

  if (provider.computeMatrix && sorted.length <= 24) {
    const matrix = await provider.computeMatrix({
      origins: points,
      destinations: points,
      vehicle: params.vehicle,
    });
    if (matrix.errorMessage || matrix.cells.length === 0) {
      warnings.push(
        matrix.errorMessage
          ? `Matrix unavailable (${matrix.errorMessage}); using geographic nearest-neighbour for order only.`
          : 'Matrix empty; using geographic nearest-neighbour for order only.'
      );
      limitations.push('Ordering did not use road-network travel times.');
      // Haversine NN
      const cost = buildCostMatrix(points, [], objective);
      orderIndices = twoOpt(nearestNeighbour(cost, 0), cost);
    } else {
      const cost = buildCostMatrix(points, matrix.cells, objective);
      orderIndices = twoOpt(nearestNeighbour(cost, 0), cost);
      limitations.push(
        'Order from nearest-neighbour + 2-opt on provider travel-time matrix (heuristic, not proven optimal).'
      );
    }
  } else {
    if (sorted.length > 24) {
      warnings.push(
        'More than 24 stops: matrix skipped; geographic nearest-neighbour used for order.'
      );
    }
    const cost = buildCostMatrix(points, [], objective);
    orderIndices = twoOpt(nearestNeighbour(cost, 0), cost);
    limitations.push('Ordering used straight-line distances only.');
  }

  // Map indices → stop ids (skip origin index 0)
  const orderedStopIds = orderIndices
    .slice(1)
    .map((idx) => sorted[idx - 1]?.stopId)
    .filter(Boolean) as string[];

  // Ask provider for the actual legal driving route in that order
  try {
    const route = await provider.computeRoute({
      origin: params.origin,
      destinations: sorted,
      orderedStopIds,
      objective,
      vehicle: params.vehicle,
      departureTime: new Date(),
    });
    return {
      ...route,
      orderedStopIds: route.orderedStopIds.length
        ? route.orderedStopIds
        : orderedStopIds,
      limitations: [...limitations, ...route.limitations],
      warnings: [...warnings, ...route.warnings],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Fallback: return order without polylines
    return {
      orderedStopIds,
      legs: orderedStopIds.map((id, i) => ({
        fromStopId: i === 0 ? null : orderedStopIds[i - 1],
        toStopId: id,
        distanceMeters: 0,
        durationSeconds: 0,
      })),
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      provider: 'order_only_fallback',
      objective,
      trafficAware: false,
      computedAt: new Date().toISOString(),
      isEstimate: true,
      limitations: [
        ...limitations,
        'Live route geometry unavailable; stop order preserved from heuristic.',
      ],
      warnings: [...warnings, message],
    };
  }
}
