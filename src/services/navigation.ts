/**
 * Waze Deep Links + Google Maps navigation URLs.
 * These hand off to the external app; we do not control their live route.
 */
import type { NavigationTarget } from '../types/routing';

/**
 * Documented Waze deep link:
 * https://developers.google.com/waze/deeplinks
 * Prefer lat/lng when confirmed; else search query.
 */
export function buildWazeUrl(target: NavigationTarget): string {
  if (target.lat != null && target.lng != null) {
    const u = new URL('https://waze.com/ul');
    u.searchParams.set('ll', `${target.lat},${target.lng}`);
    u.searchParams.set('navigate', 'yes');
    if (target.name) u.searchParams.set('q', target.name);
    return u.toString();
  }
  const q = [target.name, target.address].filter(Boolean).join(', ');
  const u = new URL('https://waze.com/ul');
  u.searchParams.set('q', q || target.address);
  u.searchParams.set('navigate', 'yes');
  return u.toString();
}

/**
 * Google Maps navigation URL (universal):
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function buildGoogleMapsNavUrl(target: NavigationTarget): string {
  const u = new URL('https://www.google.com/maps/dir/?api=1');
  u.searchParams.set('travelmode', 'driving');
  if (target.lat != null && target.lng != null) {
    u.searchParams.set('destination', `${target.lat},${target.lng}`);
  } else {
    u.searchParams.set(
      'destination',
      [target.name, target.address].filter(Boolean).join(', ')
    );
  }
  if (target.placeId) {
    u.searchParams.set('destination_place_id', target.placeId);
  }
  return u.toString();
}

export function openExternalNav(url: string): void {
  // Mobile-friendly: same window often hands off to installed app
  window.location.href = url;
}
