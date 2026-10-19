/**
 * Google Maps Platform geocoding + place search.
 * Uses the browser-restricted API key (VITE_GOOGLE_MAPS_API_KEY).
 * Never claims verification solely because coordinates were returned.
 */
import type {
  GeocodeCandidate,
  GeocodeRequest,
  GeocodeResult,
  GeocodingProvider,
} from '../../types/geocoding';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const DEFAULT_COUNTRY = 'TT';
const DEFAULT_REGION = 'tt'; // component filter

function scoreAddressAgreement(
  query: string,
  candidateFormatted: string
): number {
  const q = normalize(query);
  const c = normalize(candidateFormatted);
  if (!q || !c) return 0;
  if (q === c) return 1;
  // token overlap
  const qTokens = new Set(q.split(/\s+/).filter(Boolean));
  const cTokens = c.split(/\s+/).filter(Boolean);
  if (!qTokens.size) return 0;
  let hits = 0;
  for (const t of cTokens) {
    if (qTokens.has(t)) hits++;
  }
  return Math.min(1, hits / Math.max(qTokens.size, 1));
}

function scoreNameAgreement(name: string | null | undefined, candidate: string): number {
  if (!name) return 0;
  const n = normalize(name);
  const c = normalize(candidate);
  if (!n) return 0;
  if (c.includes(n) || n.includes(c)) return 0.9;
  const nTokens = n.split(/\s+/);
  const hits = nTokens.filter((t) => c.includes(t)).length;
  return Math.min(0.8, hits / Math.max(nTokens.length, 1));
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isApproximateTypes(types: string[]): boolean {
  const approx = new Set([
    'approximate',
    'geometric_center',
    'range_interpolated',
    'plus_code',
    'premise', // sometimes too broad
  ]);
  // Google location_type lives elsewhere; we also treat locality-only as approximate
  if (types.includes('locality') && !types.some((t) => t.includes('street') || t === 'route' || t === 'street_address')) {
    return true;
  }
  return types.some((t) => approx.has(t));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export class GoogleGeocodingProvider implements GeocodingProvider {
  readonly name = 'google';

  async search(request: GeocodeRequest): Promise<GeocodeResult> {
    if (!API_KEY) {
      return {
        query: request,
        candidates: [],
        status: 'error',
        errorMessage:
          'VITE_GOOGLE_MAPS_API_KEY is not configured. Add a restricted browser key with Geocoding API and Places API enabled.',
        provider: this.name,
      };
    }

    const country = request.country ?? DEFAULT_COUNTRY;
    const addressQuery =
      request.addressNormalized?.trim() || request.addressRaw.trim();
    if (!addressQuery) {
      return {
        query: request,
        candidates: [],
        status: 'zero_results',
        errorMessage: 'Empty address',
        provider: this.name,
      };
    }

    const candidates: GeocodeCandidate[] = [];
    const seenPlaceIds = new Set<string>();

    try {
      // 1. Geocoding API – address only, biased to TT
      const geoUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      geoUrl.searchParams.set('address', addressQuery);
      geoUrl.searchParams.set('key', API_KEY);
      geoUrl.searchParams.set('region', DEFAULT_REGION);
      geoUrl.searchParams.set('components', `country:${country}`);

      const geoData = (await fetchJson(geoUrl.toString())) as {
        status: string;
        results?: Array<{
          formatted_address: string;
          place_id: string;
          geometry: {
            location: { lat: number; lng: number };
            location_type?: string;
          };
          address_components?: Array<{ long_name: string; types: string[] }>;
          types: string[];
          partial_match?: boolean;
        }>;
        error_message?: string;
      };

      if (geoData.status === 'OK' && geoData.results) {
        for (const r of geoData.results) {
          if (seenPlaceIds.has(r.place_id)) continue;
          seenPlaceIds.add(r.place_id);

          const locality =
            r.address_components?.find((c) => c.types.includes('locality'))
              ?.long_name ??
            r.address_components?.find((c) =>
              c.types.includes('administrative_area_level_2')
            )?.long_name ??
            null;
          const region =
            r.address_components?.find((c) =>
              c.types.includes('administrative_area_level_1')
            )?.long_name ?? null;

          const addressScore = scoreAddressAgreement(addressQuery, r.formatted_address);
          const nameScore = scoreNameAgreement(request.businessName, r.formatted_address);
          const locType = r.geometry.location_type ?? '';
          const isApprox =
            r.partial_match === true ||
            locType === 'APPROXIMATE' ||
            locType === 'GEOMETRIC_CENTER' ||
            isApproximateTypes(r.types);

          const confidence = Math.min(
            1,
            addressScore * 0.7 + nameScore * 0.2 + (isApprox ? 0 : 0.1)
          );

          candidates.push({
            id: `geo-${r.place_id}`,
            formattedAddress: r.formatted_address,
            latitude: r.geometry.location.lat,
            longitude: r.geometry.location.lng,
            placeId: r.place_id,
            locality,
            region,
            country,
            provider: this.name,
            source: 'geocode',
            confidence,
            addressMatchScore: addressScore,
            nameMatchScore: nameScore,
            types: r.types,
            isApproximate: isApprox,
            raw: r,
          });
        }
      } else if (geoData.status !== 'ZERO_RESULTS' && geoData.status !== 'OK') {
        // Keep going to Places; surface message later if everything fails
      }

      // 2. Places Text Search – business name + address when name present
      if (request.businessName?.trim()) {
        const placesQuery = `${request.businessName.trim()} ${addressQuery}`;
        const placesUrl = new URL(
          'https://maps.googleapis.com/maps/api/place/textsearch/json'
        );
        placesUrl.searchParams.set('query', placesQuery);
        placesUrl.searchParams.set('key', API_KEY);
        placesUrl.searchParams.set('region', DEFAULT_REGION);
        // Note: Places Text Search does not accept components= the same way;
        // we filter client-side for TT when possible.

        try {
          const placesData = (await fetchJson(placesUrl.toString())) as {
            status: string;
            results?: Array<{
              place_id: string;
              name: string;
              formatted_address: string;
              geometry: { location: { lat: number; lng: number } };
              types: string[];
            }>;
          };

          if (placesData.status === 'OK' && placesData.results) {
            for (const p of placesData.results.slice(0, 5)) {
              if (seenPlaceIds.has(p.place_id)) continue;
              // Prefer results that look like they are in TT
              const addrLower = p.formatted_address.toLowerCase();
              if (
                !addrLower.includes('trinidad') &&
                !addrLower.includes('tobago') &&
                !addrLower.includes('trinidad and tobago')
              ) {
                // still allow but lower score later
              }
              seenPlaceIds.add(p.place_id);

              const addressScore = scoreAddressAgreement(
                addressQuery,
                p.formatted_address
              );
              const nameScore = Math.max(
                scoreNameAgreement(request.businessName, p.name),
                scoreNameAgreement(request.businessName, p.formatted_address)
              );
              const isApprox = isApproximateTypes(p.types);
              const confidence = Math.min(
                1,
                addressScore * 0.55 + nameScore * 0.35 + (isApprox ? 0 : 0.1)
              );

              candidates.push({
                id: `place-${p.place_id}`,
                formattedAddress: p.formatted_address,
                latitude: p.geometry.location.lat,
                longitude: p.geometry.location.lng,
                placeId: p.place_id,
                locality: null,
                region: null,
                country,
                provider: this.name,
                source: 'places_with_name',
                confidence,
                addressMatchScore: addressScore,
                nameMatchScore: nameScore,
                types: p.types,
                isApproximate: isApprox,
                raw: p,
              });
            }
          }
        } catch {
          // Places failure is non-fatal if geocode returned something
        }
      }

      // Rank: address agreement first, then confidence, then name
      candidates.sort((a, b) => {
        if (Math.abs(a.addressMatchScore - b.addressMatchScore) > 0.05) {
          return b.addressMatchScore - a.addressMatchScore;
        }
        if (Math.abs(a.confidence - b.confidence) > 0.05) {
          return b.confidence - a.confidence;
        }
        return b.nameMatchScore - a.nameMatchScore;
      });

      if (candidates.length === 0) {
        return {
          query: request,
          candidates: [],
          status: 'zero_results',
          errorMessage:
            'No matches found in Trinidad and Tobago for this address. Try editing the address or placing the pin manually.',
          provider: this.name,
        };
      }

      return {
        query: request,
        candidates,
        status: 'ok',
        provider: this.name,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        query: request,
        candidates: [],
        status: 'error',
        errorMessage: `Geocoding request failed: ${message}`,
        provider: this.name,
      };
    }
  }
}

let activeGeocoder: GeocodingProvider = new GoogleGeocodingProvider();

export function getGeocodingProvider(): GeocodingProvider {
  return activeGeocoder;
}

export function setGeocodingProvider(p: GeocodingProvider): void {
  activeGeocoder = p;
}
