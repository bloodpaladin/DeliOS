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
