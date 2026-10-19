/**
 * Duplicate / alias detection against the permanent business_locations directory.
 * Address is primary; name is secondary. Never auto-merge without confirmation.
 */
import { supabase } from '../lib/supabase';
import type { BusinessLocation } from '../types/database';
import type { GeocodeCandidate } from '../types/geocoding';

export type MatchReason =
  | 'exact_address'
  | 'place_id'
  | 'name_alias'
  | 'similar_address'
  | 'same_business_multiple_stops';

export interface DirectoryMatch {
  business: BusinessLocation;
  reason: MatchReason;
  score: number;
  note: string;
}

function normalizeAddr(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter((t) => t.length > 1));
  const tb = b.split(/\s+/).filter((t) => t.length > 1);
  if (!ta.size || !tb.length) return 0;
  let hits = 0;
  for (const t of tb) if (ta.has(t)) hits++;
  return hits / Math.max(ta.size, tb.length);
}

/**
 * Search the directory for possible matches for a new stop.
 */
export async function findDirectoryMatches(params: {
  addressRaw: string;
  addressNormalized?: string | null;
  businessName?: string | null;
  placeId?: string | null;
  limit?: number;
}): Promise<DirectoryMatch[]> {
  const matches: DirectoryMatch[] = [];
  const limit = params.limit ?? 8;

  // 1. Exact place_id
  if (params.placeId) {
    const { data } = await supabase
      .from('business_locations')
      .select('*')
      .eq('place_id', params.placeId)
      .limit(3);

    for (const row of data ?? []) {
      matches.push({
        business: row,
        reason: 'place_id',
        score: 1,
        note: 'Same Google Place ID',
      });
    }
  }

  // 2. Address similarity – fetch recent/confirmed locations and score client-side
  //    (full-text or trigram would be better once pg_trgm is enabled)
  const { data: candidates } = await supabase
    .from('business_locations')
    .select('*')
    .in('verification_status', ['confirmed', 'approximate'])
    .limit(200);

  const addrQuery = normalizeAddr(
    params.addressNormalized || params.addressRaw
  );
  const nameQuery = normalizeAddr(params.businessName);

  for (const biz of candidates ?? []) {
    if (matches.some((m) => m.business.id === biz.id)) continue;

    const addrNorm = normalizeAddr(biz.normalized_address || biz.original_address);
    const nameNorm = normalizeAddr(biz.canonical_business_name);

    const addrScore = tokenOverlap(addrQuery, addrNorm);
    const nameScore = nameQuery ? tokenOverlap(nameQuery, nameNorm) : 0;

    if (addrScore >= 0.85) {
      matches.push({
        business: biz,
        reason: 'exact_address',
        score: addrScore,
        note: 'Very similar normalized address',
      });
    } else if (addrScore >= 0.55 && nameScore >= 0.4) {
      matches.push({
        business: biz,
        reason: 'similar_address',
        score: addrScore * 0.7 + nameScore * 0.3,
        note: 'Similar address and name – review before merging',
      });
    } else if (nameScore >= 0.75 && addrScore >= 0.3) {
      matches.push({
        business: biz,
        reason: 'name_alias',
        score: nameScore * 0.6 + addrScore * 0.4,
        note: 'Possible alias of an existing business',
      });
    }
  }

  // Also check aliases table for name matches
  if (nameQuery.length > 2) {
    const { data: aliases } = await supabase
      .from('business_aliases')
      .select('*, business_locations(*)')
      .ilike('alias_name', `%${params.businessName?.slice(0, 40) ?? ''}%`)
      .limit(10);

    for (const a of aliases ?? []) {
      const biz = (a as { business_locations: BusinessLocation }).business_locations;
      if (!biz || matches.some((m) => m.business.id === biz.id)) continue;
      matches.push({
        business: biz,
        reason: 'name_alias',
        score: 0.7,
        note: `Matched alias "${(a as { alias_name: string }).alias_name}"`,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

/**
 * Detect multiple stops that resolve to the same business within one run.
 */
export function findSameBusinessInRun(
  rows: Array<{
    rowId: string;
    placeId?: string | null;
    businessLocationId?: string | null;
    addressNormalized?: string | null;
  }>
): Array<{ rowIds: string[]; reason: string }> {
  const groups: Array<{ rowIds: string[]; reason: string }> = [];
  const byPlace = new Map<string, string[]>();
  const byBiz = new Map<string, string[]>();

  for (const r of rows) {
    if (r.placeId) {
      const list = byPlace.get(r.placeId) ?? [];
      list.push(r.rowId);
      byPlace.set(r.placeId, list);
    }
    if (r.businessLocationId) {
      const list = byBiz.get(r.businessLocationId) ?? [];
      list.push(r.rowId);
      byBiz.set(r.businessLocationId, list);
    }
  }

  for (const [pid, ids] of byPlace) {
    if (ids.length > 1) {
      groups.push({
        rowIds: ids,
        reason: `Same place_id (${pid}) – multiple deliveries to one location are allowed but should be intentional`,
      });
    }
  }
  for (const [bid, ids] of byBiz) {
    if (ids.length > 1 && !groups.some((g) => g.rowIds.includes(ids[0]))) {
      groups.push({
        rowIds: ids,
        reason: `Same business_location_id (${bid})`,
      });
    }
  }

  return groups;
}

export function candidateToDirectoryHint(
  candidate: GeocodeCandidate
): { placeId: string | null; formatted: string } {
  return {
    placeId: candidate.placeId,
    formatted: candidate.formattedAddress,
  };
}
