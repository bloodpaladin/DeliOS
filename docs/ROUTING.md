# Legal routing, stop optimization, and navigation

## Algorithm

1. **Filter** unfinished stops: `pending`, `navigating`, `arrived`, `skipped`.  
   `delivered` and `cancelled` never re-enter the set.  
   `failed` remains outstanding (visible) but is excluded from auto-advance success path until the driver acts again.

2. **Matrix** (when ≤ ~24 points and Routes Matrix API available):  
   Road-network duration (default) or distance from Google Route Matrix.

3. **Order heuristic**: nearest-neighbour from origin, then **2-opt**.  
   **Not** a proven global optimum. Documented as an estimate.

4. **Route geometry**: Google Routes API `computeRoutes` in that order, `TRAVEL_MODE=DRIVE`, optional `TRAFFIC_AWARE`, avoid tolls/highways/ferries from vehicle profile.

5. **Active lock**: while navigating, the current stop stays first unless the driver forces re-optimize.

6. **Fallback**: if matrix/routes fail, geographic NN order is kept and a clear warning is shown — no invented polylines.

## Navigation hand-off

| Button | Mechanism |
|--------|-----------|
| Waze | Documented deep link `https://waze.com/ul?ll=lat,lng&navigate=yes` |
| Google Maps | `https://www.google.com/maps/dir/?api=1&destination=lat,lng&travelmode=driving` |

The in-app overview route and the external app’s turn-by-turn route are separate.

## Completion rules

- Mark Delivered requires explicit confirm.
- Status + `delivery_events` row with **idempotency_key**.
- Duplicate taps do not create duplicate events (DB unique partial index).
- GPS proximity alone never completes a stop.
- Failed requires a reason; stop stays outstanding.
- Skipped stays outstanding and remains optimizable.

## Resume

`loadRun(runId)` reloads stops, last `route_snapshots` order, and cached/start position so a refresh does not lose progress.

## Required API enablement

- Routes API (`computeRoutes`)
- Route Matrix API (optional but preferred)
- Maps JavaScript API (for future interactive map tiles)

Key: `VITE_GOOGLE_MAPS_API_KEY` (prefer Edge Function proxy for production).
