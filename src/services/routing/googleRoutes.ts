/**
 * Google Maps Platform Routes API (v2) client.
 * Prefer server-side proxy for production keys; browser key works if HTTP-referrer restricted
 * and Routes API is enabled.
 *
 * Never invent roads or claim global legal optimality.
 */
import type {
  LatLng,
  OptimizedLeg,
  OptimizedRoute,
  RouteMatrixCell,
  RouteMatrixResult,
  RouteObjective,
  RouteStopInput,
  RoutingProvider,
  VehicleProfile,
} from '../../types/routing';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

// Waypoint limit for a single computeRoutes request (Google: 25 intermediate for most plans)
const MAX_INTERMEDIATE_WAYPOINTS = 23;

function travelMode(_vehicle?: VehicleProfile): string {
  // DRIVE is the legal-road driving mode. Two-wheeler etc. require specific product enablement.
  return 'DRIVE';
}

function routingPreference(objective: RouteObjective, traffic: boolean): string {
  if (traffic) return 'TRAFFIC_AWARE';
  if (objective === 'distance') return 'SHORTER'; // may not always be available
  return 'TRAFFIC_UNAWARE';
}

function routeModifiers(vehicle?: VehicleProfile) {
  if (!vehicle) return undefined;
  return {
    avoidTolls: vehicle.avoidTolls ?? false,
    avoidHighways: vehicle.avoidHighways ?? false,
    avoidFerries: vehicle.avoidFerries ?? false,
  };
}

async function postRoutes<T>(url: string, body: unknown, fieldMask: string): Promise<T> {
  if (!API_KEY) {
    throw new Error(
      'VITE_GOOGLE_MAPS_API_KEY is not set. Enable Routes API on a restricted browser key (or proxy via Edge Function).'
    );
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text)?.error?.message ?? text;
    } catch {
      /* keep text */
    }
    throw new Error(`Routes API ${res.status}: ${detail}`);
  }
  return JSON.parse(text) as T;
}

function parseDurationSeconds(duration: string | undefined): number {
  if (!duration) return 0;
  // "123s" or number-as-string
  const m = /^(\d+(?:\.\d+)?)s$/.exec(duration);
  if (m) return Math.round(parseFloat(m[1]));
  const n = Number(duration);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export class GoogleRoutesProvider implements RoutingProvider {
  readonly name = 'google_routes_v2';

  async computeRoute(params: {
    origin: LatLng;
    destinations: RouteStopInput[];
    orderedStopIds?: string[];
    objective: RouteObjective;
    vehicle?: VehicleProfile;
    departureTime?: Date;
  }): Promise<OptimizedRoute> {
    const unfinished = params.destinations.filter(
      (d) => d.status === 'pending' || d.status === 'navigating' || d.status === 'arrived' || d.status === 'skipped'
    );
    // skipped remains outstanding per product rules; include in optimization set
    const active = unfinished.filter((d) => d.status !== 'skipped' || true);

    if (active.length === 0) {
      return {
        orderedStopIds: [],
        legs: [],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        provider: this.name,
        objective: params.objective,
        trafficAware: false,
        computedAt: new Date().toISOString(),
        isEstimate: true,
        limitations: ['No unfinished stops'],
        warnings: [],
      };
    }

    // Order: forced sequence or current list order (optimizer supplies order)
    const orderIds =
      params.orderedStopIds?.filter((id) => active.some((a) => a.stopId === id)) ??
      active.map((a) => a.stopId);

    const orderedStops = orderIds
      .map((id) => active.find((a) => a.stopId === id))
      .filter(Boolean) as RouteStopInput[];

    if (orderedStops.length > MAX_INTERMEDIATE_WAYPOINTS + 1) {
      // Chunk: route origin → first N, then sequential pairwise for remainder
      return this.computeChunked(params.origin, orderedStops, params);
    }

    const intermediates = orderedStops.slice(0, -1).map((s) => ({
      location: { latLng: { latitude: s.lat, longitude: s.lng } },
    }));
    const destination = orderedStops[orderedStops.length - 1];

    const body: Record<string, unknown> = {
      origin: {
        location: {
          latLng: { latitude: params.origin.lat, longitude: params.origin.lng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: destination.lat, longitude: destination.lng },
        },
      },
      intermediates: intermediates.length ? intermediates : undefined,
      travelMode: travelMode(params.vehicle),
      routingPreference: routingPreference(params.objective, true),
      computeAlternativeRoutes: false,
      routeModifiers: routeModifiers(params.vehicle),
      languageCode: 'en-TT',
      units: 'METRIC',
    };

    if (params.departureTime) {
      body.departureTime = params.departureTime.toISOString();
    }

    const fieldMask = [
      'routes.duration',
      'routes.distanceMeters',
      'routes.polyline.encodedPolyline',
      'routes.legs.duration',
      'routes.legs.distanceMeters',
      'routes.legs.polyline.encodedPolyline',
      'routes.warnings',
      'routes.routeLabels',
    ].join(',');

    type RoutesResponse = {
      routes?: Array<{
        duration?: string;
        distanceMeters?: number;
        polyline?: { encodedPolyline?: string };
        legs?: Array<{
          duration?: string;
          distanceMeters?: number;
          polyline?: { encodedPolyline?: string };
        }>;
        warnings?: string[];
      }>;
    };

    const data = await postRoutes<RoutesResponse>(ROUTES_URL, body, fieldMask);
    const route = data.routes?.[0];
    if (!route) {
      throw new Error('Routes API returned no route for the requested waypoints.');
    }

    const legs: OptimizedLeg[] = [];
    const apiLegs = route.legs ?? [];
    for (let i = 0; i < orderedStops.length; i++) {
      const leg = apiLegs[i];
      legs.push({
        fromStopId: i === 0 ? null : orderedStops[i - 1].stopId,
        toStopId: orderedStops[i].stopId,
        distanceMeters: leg?.distanceMeters ?? 0,
        durationSeconds: parseDurationSeconds(leg?.duration),
        encodedPolyline: leg?.polyline?.encodedPolyline,
        warnings: undefined,
      });
    }

    const limitations = [
      'Result is a provider-supported estimate using the Google Routes API road network and restrictions available to the API key.',
      'Not a mathematical proof of global optimality under all legal constraints.',
      'Private roads, temporary closures, and vehicle-specific bans may be incomplete.',
    ];

    return {
      orderedStopIds: orderedStops.map((s) => s.stopId),
      legs,
      totalDistanceMeters: route.distanceMeters ?? legs.reduce((s, l) => s + l.distanceMeters, 0),
      totalDurationSeconds:
        parseDurationSeconds(route.duration) ||
        legs.reduce((s, l) => s + l.durationSeconds, 0),
      provider: this.name,
      objective: params.objective,
      trafficAware: true,
      computedAt: new Date().toISOString(),
      isEstimate: true,
      limitations,
      warnings: route.warnings ?? [],
      rawProviderMeta: { legCount: apiLegs.length },
    };
  }

  private async computeChunked(
    origin: LatLng,
    orderedStops: RouteStopInput[],
    params: {
      objective: RouteObjective;
      vehicle?: VehicleProfile;
      departureTime?: Date;
    }
  ): Promise<OptimizedRoute> {
    const allLegs: OptimizedLeg[] = [];
    let cursor = origin;
    let totalDist = 0;
    let totalDur = 0;
    const warnings: string[] = [
      `Stop count (${orderedStops.length}) exceeds single-request waypoint limit; route computed in sequential chunks.`,
    ];

    for (let i = 0; i < orderedStops.length; i += MAX_INTERMEDIATE_WAYPOINTS) {
      const chunk = orderedStops.slice(i, i + MAX_INTERMEDIATE_WAYPOINTS);
      const partial = await this.computeRoute({
        origin: cursor,
        destinations: chunk,
        orderedStopIds: chunk.map((c) => c.stopId),
        objective: params.objective,
        vehicle: params.vehicle,
        departureTime: params.departureTime,
      });
      allLegs.push(...partial.legs);
      totalDist += partial.totalDistanceMeters;
      totalDur += partial.totalDurationSeconds;
      warnings.push(...partial.warnings);
      const last = chunk[chunk.length - 1];
      cursor = { lat: last.lat, lng: last.lng };
    }

    return {
      orderedStopIds: orderedStops.map((s) => s.stopId),
      legs: allLegs,
      totalDistanceMeters: totalDist,
      totalDurationSeconds: totalDur,
      provider: this.name,
      objective: params.objective,
      trafficAware: true,
      computedAt: new Date().toISOString(),
      isEstimate: true,
      limitations: [
        'Chunked multi-request route; overall order was fixed before chunking.',
        'Not a single global optimization pass.',
      ],
      warnings,
    };
  }

  async computeMatrix(params: {
    origins: LatLng[];
    destinations: LatLng[];
    vehicle?: VehicleProfile;
  }): Promise<RouteMatrixResult> {
    if (!API_KEY) {
      return {
        cells: [],
        provider: this.name,
        computedAt: new Date().toISOString(),
        errorMessage: 'VITE_GOOGLE_MAPS_API_KEY missing',
      };
    }

    // Route Matrix has its own element limits; batch if needed (simplified here)
    const body = {
      origins: params.origins.map((o) => ({
        waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
      })),
      destinations: params.destinations.map((d) => ({
        waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
      })),
      travelMode: travelMode(params.vehicle),
      routingPreference: 'TRAFFIC_AWARE',
    };

    const fieldMask = 'originIndex,destinationIndex,duration,distanceMeters,status,condition';

    try {
      // Matrix API returns a stream of objects (NDJSON-like) or array depending on version
      const res = await fetch(MATRIX_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Matrix ${res.status}: ${text}`);
      }

      const cells: RouteMatrixCell[] = [];
      // Response may be a JSON array
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // NDJSON
        for (const line of text.split('\n').filter(Boolean)) {
          const row = JSON.parse(line) as {
            originIndex: number;
            destinationIndex: number;
            duration?: string;
            distanceMeters?: number;
            status?: string;
          };
          cells.push({
            originIndex: row.originIndex,
            destinationIndex: row.destinationIndex,
            distanceMeters: row.distanceMeters ?? 0,
            durationSeconds: parseDurationSeconds(row.duration),
            status: row.status === 'OK' || !row.status ? 'ok' : 'error',
          });
        }
        return { cells, provider: this.name, computedAt: new Date().toISOString() };
      }

      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const row of arr as Array<{
        originIndex: number;
        destinationIndex: number;
        duration?: string;
        distanceMeters?: number;
      }>) {
        cells.push({
          originIndex: row.originIndex,
          destinationIndex: row.destinationIndex,
          distanceMeters: row.distanceMeters ?? 0,
          durationSeconds: parseDurationSeconds(row.duration),
          status: 'ok',
        });
      }
      return { cells, provider: this.name, computedAt: new Date().toISOString() };
    } catch (e) {
      return {
        cells: [],
        provider: this.name,
        computedAt: new Date().toISOString(),
        errorMessage: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

let active: RoutingProvider = new GoogleRoutesProvider();

export function getRoutingProvider(): RoutingProvider {
  return active;
}

export function setRoutingProvider(p: RoutingProvider): void {
  active = p;
}
