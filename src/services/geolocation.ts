/**
 * Device GPS with permission handling and stale-cache labelling.
 */
import type { StartPosition, StartPositionSource } from '../types/routing';

const CACHE_KEY = 'routepilot_last_position';
const STALE_MS = 5 * 60 * 1000; // 5 minutes

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function getPermissionState(): Promise<GeoPermission> {
  if (!navigator.geolocation) return 'unsupported';
  if (!navigator.permissions?.query) return 'prompt';
  try {
    const r = await navigator.permissions.query({ name: 'geolocation' });
    return r.state as GeoPermission;
  } catch {
    return 'prompt';
  }
}

function readCache(): StartPosition | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StartPosition;
  } catch {
    return null;
  }
}

function writeCache(pos: StartPosition): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(pos));
  } catch {
    /* ignore quota */
  }
}

export function getCachedPosition(): StartPosition | null {
  const c = readCache();
  if (!c) return null;
  const age = Date.now() - new Date(c.capturedAt).getTime();
  return {
    ...c,
    source: 'gps_cached',
    isStale: age > STALE_MS,
  };
}

export function getCurrentPosition(options?: {
  timeoutMs?: number;
  highAccuracy?: boolean;
}): Promise<StartPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const result: StartPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'gps_live',
          accuracyMeters: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
          isStale: false,
        };
        writeCache(result);
        resolve(result);
      },
      (err) => {
        const cached = getCachedPosition();
        if (cached) {
          resolve({ ...cached, isStale: true });
          return;
        }
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. Choose a manual pin or saved depot.'
              : err.code === err.TIMEOUT
                ? 'Location request timed out.'
                : 'Unable to retrieve location.'
          )
        );
      },
      {
        enableHighAccuracy: options?.highAccuracy ?? true,
        timeout: options?.timeoutMs ?? 15000,
        maximumAge: 30000,
      }
    );
  });
}

export function manualPinPosition(
  lat: number,
  lng: number,
  address?: string
): StartPosition {
  return {
    lat,
    lng,
    address: address ?? null,
    source: 'manual_pin',
    capturedAt: new Date().toISOString(),
    isStale: false,
  };
}

export function depotPosition(
  lat: number,
  lng: number,
  address?: string
): StartPosition {
  return {
    lat,
    lng,
    address: address ?? null,
    source: 'depot' as StartPositionSource,
    capturedAt: new Date().toISOString(),
    isStale: false,
  };
}
