-- RoutePilot Caribbean / DeliOS
-- Initial schema: business locations, delivery runs, stops, events, snapshots, preferences
-- Compatible with Supabase (PostgreSQL + Auth + Storage)
-- Does NOT drop or reset existing objects. Safe to run on a fresh or partially-used project.

-- Enable useful extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- PostGIS is beneficial for spatial queries; enable only if available on the project
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 1. business_locations  (canonical permanent directory)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_business_name TEXT NOT NULL,
  original_business_name TEXT,
  original_address TEXT,
  normalized_address TEXT,
  country TEXT NOT NULL DEFAULT 'TT',
  region TEXT,                    -- e.g. Trinidad, Tobago
  town TEXT,
  locality TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  place_id TEXT,                  -- Google Place ID or equivalent
  geocoding_provider TEXT,        -- 'google' | 'mapbox' | 'manual' | etc.
  geocoding_confidence NUMERIC(4,3) CHECK (geocoding_confidence IS NULL OR (geocoding_confidence >= 0 AND geocoding_confidence <= 1)),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'approximate', 'confirmed', 'flagged', 'inaccessible')),
  verification_notes TEXT,
  entrance_or_pin_adjustment JSONB, -- { "lat": ..., "lng": ..., "note": "..." }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.business_locations IS 'Permanent canonical business directory. Survives across delivery runs.';

CREATE UNIQUE INDEX IF NOT EXISTS business_locations_place_id_uidx
  ON public.business_locations (place_id)
  WHERE place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS business_locations_name_trgm_idx
  ON public.business_locations (canonical_business_name);

CREATE INDEX IF NOT EXISTS business_locations_coords_idx
  ON public.business_locations (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS business_locations_verification_idx
  ON public.business_locations (verification_status);

CREATE INDEX IF NOT EXISTS business_locations_created_by_idx
  ON public.business_locations (created_by);

-- ---------------------------------------------------------------------------
-- 2. business_aliases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  alias_address TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('ocr', 'manual', 'google', 'import', 'driver')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_aliases_location_idx
  ON public.business_aliases (business_location_id);

CREATE INDEX IF NOT EXISTS business_aliases_name_idx
  ON public.business_aliases (alias_name);

-- ---------------------------------------------------------------------------
-- 3. route_sheet_imports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.route_sheet_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  ocr_provider TEXT,              -- 'google_vision' | 'azure' | 'tesseract' | 'openai' | etc.
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  extracted_data JSONB,
  review_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'reviewed', 'rejected')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS route_sheet_imports_user_idx
  ON public.route_sheet_imports (user_id);

CREATE INDEX IF NOT EXISTS route_sheet_imports_status_idx
  ON public.route_sheet_imports (processing_status);

-- ---------------------------------------------------------------------------
-- 4. delivery_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_name TEXT,
  starting_latitude DOUBLE PRECISION,
  starting_longitude DOUBLE PRECISION,
  starting_address TEXT,
  final_destination JSONB,       -- optional { lat, lng, address, type: 'depot'|'home'|null }
  vehicle_profile JSONB,         -- { type: 'car'|'van'|'truck', restrictions: [...] }
  run_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (run_status IN ('draft', 'ready', 'in_progress', 'completed', 'cancelled')),
  optimization_objective TEXT NOT NULL DEFAULT 'time'
    CHECK (optimization_objective IN ('time', 'distance', 'balanced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_runs_user_idx
  ON public.delivery_runs (user_id);

CREATE INDEX IF NOT EXISTS delivery_runs_status_idx
  ON public.delivery_runs (run_status);

CREATE INDEX IF NOT EXISTS delivery_runs_user_status_idx
  ON public.delivery_runs (user_id, run_status);

-- ---------------------------------------------------------------------------
-- 5. delivery_stops
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_run_id UUID NOT NULL REFERENCES public.delivery_runs(id) ON DELETE CASCADE,
  business_location_id UUID REFERENCES public.business_locations(id) ON DELETE SET NULL,
  stop_number INTEGER,            -- optimized order (null until optimized)
  original_sheet_order INTEGER,   -- order as it appeared on the paper sheet
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'in_progress', 'delivered', 'failed', 'skipped', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  delivery_notes TEXT,
  failure_reason TEXT,
  original_ocr_text TEXT,         -- preserve raw OCR even after normalization
  customer_name_raw TEXT,
  address_raw TEXT,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow the same business to appear multiple times in one run (separate orders)
-- Therefore NO unique constraint on (delivery_run_id, business_location_id)

CREATE INDEX IF NOT EXISTS delivery_stops_run_idx
  ON public.delivery_stops (delivery_run_id);

CREATE INDEX IF NOT EXISTS delivery_stops_business_idx
  ON public.delivery_stops (business_location_id);

CREATE INDEX IF NOT EXISTS delivery_stops_run_status_idx
  ON public.delivery_stops (delivery_run_id, delivery_status);

CREATE INDEX IF NOT EXISTS delivery_stops_run_order_idx
  ON public.delivery_stops (delivery_run_id, stop_number)
  WHERE stop_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. delivery_events  (immutable audit + idempotency)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_stop_id UUID NOT NULL REFERENCES public.delivery_stops(id) ON DELETE CASCADE,
  delivery_run_id UUID NOT NULL REFERENCES public.delivery_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'created', 'status_changed', 'arrived', 'delivered', 'failed',
      'skipped', 'recalculated', 'note_added', 'navigation_started'
    )),
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  idempotency_key TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Database-backed idempotency: prevent duplicate completion events
CREATE UNIQUE INDEX IF NOT EXISTS delivery_events_idempotency_uidx
  ON public.delivery_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS delivery_events_stop_idx
  ON public.delivery_events (delivery_stop_id);

CREATE INDEX IF NOT EXISTS delivery_events_run_idx
  ON public.delivery_events (delivery_run_id);

CREATE INDEX IF NOT EXISTS delivery_events_type_idx
  ON public.delivery_events (event_type);

-- ---------------------------------------------------------------------------
-- 7. route_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.route_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_run_id UUID NOT NULL REFERENCES public.delivery_runs(id) ON DELETE CASCADE,
  ordered_stop_ids JSONB NOT NULL,   -- array of delivery_stop UUIDs in optimized order
  route_provider TEXT NOT NULL,       -- 'google_routes' | 'google_directions' | 'osrm' | etc.
  optimization_objective TEXT NOT NULL DEFAULT 'time',
  estimated_distance_meters NUMERIC,
  estimated_duration_seconds NUMERIC,
  provider_response_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_snapshots_run_idx
  ON public.route_snapshots (delivery_run_id);

CREATE INDEX IF NOT EXISTS route_snapshots_run_created_idx
  ON public.route_snapshots (delivery_run_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. user_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_navigation_app TEXT NOT NULL DEFAULT 'waze'
    CHECK (preferred_navigation_app IN ('waze', 'google', 'apple')),
  vehicle_profile JSONB,
  route_preferences JSONB,          -- { objective: 'time', avoidTolls: false, ... }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Updated_at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS business_locations_updated_at ON public.business_locations;
CREATE TRIGGER business_locations_updated_at
  BEFORE UPDATE ON public.business_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS delivery_runs_updated_at ON public.delivery_runs;
CREATE TRIGGER delivery_runs_updated_at
  BEFORE UPDATE ON public.delivery_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS delivery_stops_updated_at ON public.delivery_stops;
CREATE TRIGGER delivery_stops_updated_at
  BEFORE UPDATE ON public.delivery_stops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: safely record a delivery event with idempotency
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_delivery_event(
  p_stop_id UUID,
  p_run_id UUID,
  p_event_type TEXT,
  p_metadata JSONB DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.delivery_events (
    delivery_stop_id, delivery_run_id, event_type, metadata, idempotency_key, actor_id
  ) VALUES (
    p_stop_id, p_run_id, p_event_type, p_metadata, p_idempotency_key, p_actor_id
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.delivery_events WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_sheet_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- business_locations: authenticated users can read all confirmed locations
-- (shared directory) and manage their own records.
DROP POLICY IF EXISTS "business_locations_select" ON public.business_locations;
CREATE POLICY "business_locations_select" ON public.business_locations
  FOR SELECT TO authenticated
  USING (
    verification_status IN ('confirmed', 'approximate')
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "business_locations_insert" ON public.business_locations;
CREATE POLICY "business_locations_insert" ON public.business_locations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

DROP POLICY IF EXISTS "business_locations_update" ON public.business_locations;
CREATE POLICY "business_locations_update" ON public.business_locations
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL)
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- business_aliases follow parent location visibility
DROP POLICY IF EXISTS "business_aliases_select" ON public.business_aliases;
CREATE POLICY "business_aliases_select" ON public.business_aliases
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations bl
      WHERE bl.id = business_location_id
        AND (bl.verification_status IN ('confirmed', 'approximate') OR bl.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "business_aliases_insert" ON public.business_aliases;
CREATE POLICY "business_aliases_insert" ON public.business_aliases
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations bl
      WHERE bl.id = business_location_id
        AND (bl.created_by = auth.uid() OR bl.created_by IS NULL)
    )
  );

DROP POLICY IF EXISTS "business_aliases_delete" ON public.business_aliases;
CREATE POLICY "business_aliases_delete" ON public.business_aliases
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations bl
      WHERE bl.id = business_location_id AND bl.created_by = auth.uid()
    )
  );

-- route_sheet_imports: owner only
DROP POLICY IF EXISTS "route_sheet_imports_owner" ON public.route_sheet_imports;
CREATE POLICY "route_sheet_imports_owner" ON public.route_sheet_imports
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- delivery_runs: owner only
DROP POLICY IF EXISTS "delivery_runs_owner" ON public.delivery_runs;
CREATE POLICY "delivery_runs_owner" ON public.delivery_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- delivery_stops: via run ownership
DROP POLICY IF EXISTS "delivery_stops_via_run" ON public.delivery_stops;
CREATE POLICY "delivery_stops_via_run" ON public.delivery_stops
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_runs r
      WHERE r.id = delivery_run_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_runs r
      WHERE r.id = delivery_run_id AND r.user_id = auth.uid()
    )
  );

-- delivery_events: via run ownership
DROP POLICY IF EXISTS "delivery_events_via_run" ON public.delivery_events;
CREATE POLICY "delivery_events_via_run" ON public.delivery_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_runs r
      WHERE r.id = delivery_run_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_runs r
      WHERE r.id = delivery_run_id AND r.user_id = auth.uid()
    )
  );

-- route_snapshots: via run ownership
DROP POLICY IF EXISTS "route_snapshots_via_run" ON public.route_snapshots;
CREATE POLICY "route_snapshots_via_run" ON public.route_snapshots
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_runs r
      WHERE r.id = delivery_run_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_runs r
      WHERE r.id = delivery_run_id AND r.user_id = auth.uid()
    )
  );

-- user_preferences: owner only
DROP POLICY IF EXISTS "user_preferences_owner" ON public.user_preferences;
CREATE POLICY "user_preferences_owner" ON public.user_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage bucket for route-sheet photographs (private by default)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'route-sheets',
  'route-sheets',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

-- Storage policies: only the owner can upload/read/delete their own sheets
DROP POLICY IF EXISTS "route_sheets_select_own" ON storage.objects;
CREATE POLICY "route_sheets_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'route-sheets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "route_sheets_insert_own" ON storage.objects;
CREATE POLICY "route_sheets_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'route-sheets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "route_sheets_update_own" ON storage.objects;
CREATE POLICY "route_sheets_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'route-sheets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "route_sheets_delete_own" ON storage.objects;
CREATE POLICY "route_sheets_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'route-sheets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Grant usage to authenticated role (standard Supabase pattern)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_delivery_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at TO authenticated;
-- Expand delivery_stops.delivery_status to match product workflow
-- (navigating / arrived were used in app but missing from initial CHECK)

ALTER TABLE public.delivery_stops
  DROP CONSTRAINT IF EXISTS delivery_stops_delivery_status_check;

ALTER TABLE public.delivery_stops
  ADD CONSTRAINT delivery_stops_delivery_status_check
  CHECK (delivery_status IN (
    'pending',
    'in_progress',
    'navigating',
    'arrived',
    'delivered',
    'failed',
    'skipped',
    'cancelled'
  ));

-- Expand event types if needed (arrived already present)
ALTER TABLE public.delivery_events
  DROP CONSTRAINT IF EXISTS delivery_events_event_type_check;

ALTER TABLE public.delivery_events
  ADD CONSTRAINT delivery_events_event_type_check
  CHECK (event_type IN (
    'created',
    'status_changed',
    'arrived',
    'delivered',
    'failed',
    'skipped',
    'recalculated',
    'note_added',
    'navigation_started'
  ));
