-- Manual verification queries for data-integrity rules.
-- Run in Supabase SQL Editor after migration + seed (or against a test project).

-- 1. Idempotency: second insert with same key must not create a second row
--    (requires a real stop/run; shown as pattern only)
/*
SELECT public.record_delivery_event(
  'stop-uuid', 'run-uuid', 'delivered',
  '{"source":"test"}'::jsonb,
  'test-idempotency-key-001',
  auth.uid()
);
-- run again → same id returned, still one row
SELECT count(*) FROM delivery_events WHERE idempotency_key = 'test-idempotency-key-001';
*/

-- 2. Same business may appear twice in one run
/*
INSERT INTO delivery_stops (delivery_run_id, business_location_id, original_sheet_order)
VALUES
  ('run-uuid', 'biz-uuid', 1),
  ('run-uuid', 'biz-uuid', 5);
SELECT count(*) FROM delivery_stops WHERE delivery_run_id = 'run-uuid' AND business_location_id = 'biz-uuid';
-- expected: 2
*/

-- 3. Completed events survive route recalculation (events are never deleted by design)
--    Only new route_snapshots rows are inserted.

-- 4. RLS: unauthenticated cannot read
-- SET ROLE anon; SELECT * FROM delivery_runs;  → should fail / empty

-- 5. Storage path ownership
-- Objects must live under folder named after auth.uid()
