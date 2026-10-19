/**
 * Routing, optimization, and navigation types
 */

export type RouteObjective = 'time' | 'distance' | 'balanced';

export type StopDeliveryStatus =
  | 'pending'
  | 'navigating'
  | 'arrived'
  | 'delivered'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface VehicleProfile {
  type: 'car' | 'van' | 'truck' | 'motorcycle';
  heightMeters?: number;
  widthMeters?: number;
  lengthMeters?: number;
  weightKg?: number;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidFerries?: boolean;
}

export interface RouteStopInput {
  stopId: string;
  businessLocationId: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId?: string | null;
  verificationStatus?: string;
  priority?: number;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  status: StopDeliveryStatus;
}

export interface OptimizedLeg {
  fromStopId: string | null; // null = origin
  toStopId: string;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline?: string;
  warnings?: string[];
}

export interface OptimizedRoute {
  orderedStopIds: string[];
  legs: OptimizedLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  provider: string;
  objective: RouteObjective;
  trafficAware: boolean;
  computedAt: string;
  isEstimate: true; // always true unless a proven global optimum
  limitations: string[];
  warnings: string[];
  rawProviderMeta?: unknown;
}

export interface RouteMatrixCell {
  originIndex: number;
  destinationIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  status: 'ok' | 'zero_results' | 'error';
}

export interface RouteMatrixResult {
  cells: RouteMatrixCell[];
  provider: string;
  computedAt: string;
  errorMessage?: string;
}

export interface RoutingProvider {
  readonly name: string;
  /**
   * Compute a multi-stop driving route in the given order (or optimize if supported).
   * Must return real provider data or a clear error — never invented paths.
   */
  computeRoute(params: {
    origin: LatLng;
    destinations: RouteStopInput[]; // already filtered to unfinished
    orderedStopIds?: string[]; // if provided, force this order
    objective: RouteObjective;
    vehicle?: VehicleProfile;
    departureTime?: Date;
  }): Promise<OptimizedRoute>;

  /**
   * Distance/duration matrix between points (for local TSP heuristics).
   */
  computeMatrix?(params: {
    origins: LatLng[];
    destinations: LatLng[];
    vehicle?: VehicleProfile;
  }): Promise<RouteMatrixResult>;
}

export type StartPositionSource =
  | 'gps_live'
  | 'gps_cached'
  | 'manual_pin'
  | 'depot'
  | 'unknown';

export interface StartPosition {
  lat: number;
  lng: number;
  address?: string | null;
  source: StartPositionSource;
  accuracyMeters?: number | null;
  capturedAt: string;
  isStale?: boolean;
}

export interface NavigationTarget {
  stopId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  placeId?: string | null;
}
