/**
 * Geocoding / place verification types
 */

export type CandidateSource = 'geocode' | 'places' | 'places_with_name' | 'manual' | 'directory';

export interface GeocodeCandidate {
  id: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  provider: string;
  source: CandidateSource;
  /** 0–1 composite score (address agreement primary, name secondary) */
  confidence: number;
  addressMatchScore: number;
  nameMatchScore: number;
  types: string[];
  /** True when result is approximate / partial / landmark-level */
  isApproximate: boolean;
  raw?: unknown;
}

export interface GeocodeRequest {
  addressRaw: string;
  addressNormalized?: string | null;
  businessName?: string | null;
  country?: string; // default TT
  biasLat?: number;
  biasLng?: number;
}

export interface GeocodeResult {
  query: GeocodeRequest;
  candidates: GeocodeCandidate[];
  status: 'ok' | 'zero_results' | 'error' | 'needs_manual';
  errorMessage?: string;
  provider: string;
}

export interface VerificationChoice {
  rowId: string;
  candidate: GeocodeCandidate | null;
  manualPin?: { lat: number; lng: number; note?: string };
  editedAddress?: string;
  verificationStatus: 'confirmed' | 'approximate' | 'unverified' | 'flagged';
  verificationNotes?: string;
}

export interface GeocodingProvider {
  readonly name: string;
  search(request: GeocodeRequest): Promise<GeocodeResult>;
  reverse?(lat: number, lng: number): Promise<GeocodeCandidate | null>;
}
