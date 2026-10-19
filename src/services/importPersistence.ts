/**
 * Persist route-sheet import → business_locations + delivery_stops + events.
 * Idempotent: retries do not create duplicate businesses or stops when keys match.
 */
import { supabase, routeSheetPath } from '../lib/supabase';
import type { ReviewedRow } from '../types/ocr';
import type { RowVerificationState } from '../stores/importStore';
import type { BusinessLocationInsert } from '../types/database';

export interface PersistImportInput {
  runId: string | null;
  runName?: string;
  importId: string | null;
  pages: Array<{ blob: Blob; filename: string; pageIndex: number }>;
  ocrJobId: string;
  ocrProvider: string;
  extractedData: unknown;
  rows: ReviewedRow[];
  verifications: Record<string, RowVerificationState>;
  startingLat?: number | null;
  startingLng?: number | null;
  startingAddress?: string | null;
}

export interface PersistImportResult {
  runId: string;
  importId: string;
  createdBusinessIds: string[];
  createdStopIds: string[];
  errors: string[];
}

export async function persistImport(
  input: PersistImportInput
): Promise<PersistImportResult> {
  const errors: string[] = [];
  const createdBusinessIds: string[] = [];
  const createdStopIds: string[] = [];

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error('Must be signed in to save a delivery run');
  }

  // 1. Ensure delivery_run
  let runId = input.runId;
  if (!runId) {
    const { data: run, error } = await supabase
      .from('delivery_runs')
      .insert({
        user_id: user.id,
        run_name: input.runName ?? `Run ${new Date().toLocaleString()}`,
        starting_latitude: input.startingLat ?? null,
        starting_longitude: input.startingLng ?? null,
        starting_address: input.startingAddress ?? null,
        run_status: 'ready',
      })
      .select('id')
      .single();

    if (error || !run) {
      throw new Error(`Failed to create delivery run: ${error?.message}`);
    }
    runId = run.id;
  }

  // 2. Ensure route_sheet_import record + upload images
  let importId = input.importId;
  const storagePaths: string[] = [];

  for (const page of input.pages) {
    const path = routeSheetPath(
      user.id,
      importId || crypto.randomUUID(),
      `page-${page.pageIndex}-${page.filename}`
    );
    const { error: upErr } = await supabase.storage
      .from('route-sheets')
      .upload(path, page.blob, {
        contentType: page.blob.type || 'image/jpeg',
        upsert: true,
      });
    if (upErr) {
      errors.push(`Image upload page ${page.pageIndex}: ${upErr.message}`);
    } else {
      storagePaths.push(path);
    }
  }

  if (!importId) {
    const { data: imp, error } = await supabase
      .from('route_sheet_imports')
      .insert({
        user_id: user.id,
        storage_path: storagePaths[0] ?? '',
        original_filename: input.pages[0]?.filename ?? null,
        ocr_provider: input.ocrProvider,
        processing_status: 'completed',
        extracted_data: input.extractedData as import('../types/database').Json,
        review_status: 'reviewed',
        processed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !imp) {
      throw new Error(`Failed to create route_sheet_imports: ${error?.message}`);
    }
    importId = imp.id;
  } else {
    await supabase
      .from('route_sheet_imports')
      .update({
        processing_status: 'completed',
        extracted_data: input.extractedData as import('../types/database').Json,
        review_status: 'reviewed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', importId);
  }

  // 3. Active rows only (needs_delivery)
  const activeRows = input.rows.filter((r) => r.decision === 'needs_delivery');

  for (const row of activeRows) {
    const v = input.verifications[row.id];
    const name =
      row.userCorrectedName?.trim() ||
      row.customerName?.trim() ||
      'Unknown business';
    const address =
      row.userCorrectedAddress?.trim() ||
      row.addressNormalized?.trim() ||
      row.addressRaw.trim();

    let businessId = v?.chosenBusinessLocationId ?? null;

    // Create or reuse business location
    if (!businessId && v?.selectedCandidate) {
      const c = v.selectedCandidate;
      const insert: BusinessLocationInsert = {
        canonical_business_name: name,
        original_business_name: row.customerName,
        original_address: row.addressRaw,
        normalized_address: address,
        country: 'TT',
        region: c.region,
        town: c.locality,
        locality: c.locality,
        latitude: v.manualPin?.lat ?? c.latitude,
        longitude: v.manualPin?.lng ?? c.longitude,
        place_id: c.placeId,
        geocoding_provider: c.provider,
        geocoding_confidence: c.confidence,
        verification_status: v.verificationStatus,
        verification_notes: v.verificationNotes ?? null,
        entrance_or_pin_adjustment: v.manualPin
          ? { lat: v.manualPin.lat, lng: v.manualPin.lng, note: v.manualPin.note }
          : null,
        last_verified_at:
          v.verificationStatus === 'confirmed'
            ? new Date().toISOString()
            : null,
        created_by: user.id,
      };

      // Prefer existing place_id match to avoid duplicates
      if (c.placeId) {
        const { data: existing } = await supabase
          .from('business_locations')
          .select('id')
          .eq('place_id', c.placeId)
          .maybeSingle();
        if (existing) {
          businessId = existing.id;
          // optionally update coords if driver moved pin
          if (v.manualPin) {
            await supabase
              .from('business_locations')
              .update({
                latitude: v.manualPin.lat,
                longitude: v.manualPin.lng,
                entrance_or_pin_adjustment: insert.entrance_or_pin_adjustment,
                verification_status: v.verificationStatus,
                last_verified_at: insert.last_verified_at,
              })
              .eq('id', businessId);
          }
        }
      }

      if (!businessId) {
        const { data: created, error } = await supabase
          .from('business_locations')
          .insert(insert)
          .select('id')
          .single();
        if (error || !created) {
          errors.push(`Business create failed for "${name}": ${error?.message}`);
          continue;
        }
        businessId = created.id;
        createdBusinessIds.push(businessId);

        // Alias from original OCR name if different
        if (row.customerName && row.customerName.trim() !== name) {
          await supabase.from('business_aliases').insert({
            business_location_id: businessId,
            alias_name: row.customerName.trim(),
            alias_address: row.addressRaw,
            source: 'ocr',
          });
        }
      }
    } else if (!businessId) {
      // No candidate – still create unverified location so the stop is not lost
      const { data: created, error } = await supabase
        .from('business_locations')
        .insert({
          canonical_business_name: name,
          original_business_name: row.customerName,
          original_address: row.addressRaw,
          normalized_address: address,
          country: 'TT',
          verification_status: 'unverified',
          verification_notes: 'No geocode candidate confirmed by driver',
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error || !created) {
        errors.push(`Unverified business create failed: ${error?.message}`);
        continue;
      }
      businessId = created.id;
      createdBusinessIds.push(businessId);
    }

    // 4. delivery_stop
    const { data: stop, error: stopErr } = await supabase
      .from('delivery_stops')
      .insert({
        delivery_run_id: runId,
        business_location_id: businessId,
        original_sheet_order: row.sheetRowNumber,
        delivery_status: 'pending',
        original_ocr_text: row.unresolvedText ?? row.addressRaw,
        customer_name_raw: row.customerName,
        address_raw: row.addressRaw,
        delivery_notes: row.userNotes ?? row.deliveryNotes,
        priority: 0,
      })
      .select('id')
      .single();

    if (stopErr || !stop) {
      errors.push(`Stop create failed for "${name}": ${stopErr?.message}`);
      continue;
    }
    createdStopIds.push(stop.id);

    // 5. Event (idempotent key per row + run)
    const idempotencyKey = `import-create-${runId}-${row.id}`;
    await supabase.rpc('record_delivery_event', {
      p_stop_id: stop.id,
      p_run_id: runId,
      p_event_type: 'created',
      p_metadata: {
        source: 'route_sheet_import',
        import_id: importId,
        ocr_confidence: row.ocrConfidence,
      },
      p_idempotency_key: idempotencyKey,
      p_actor_id: user.id,
    });
  }

  // Mark completed/cancelled rows with events only (no stops) if desired – skipped for now

  return {
    runId,
    importId,
    createdBusinessIds,
    createdStopIds,
    errors,
  };
}
