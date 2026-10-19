# Route sheet OCR & address verification

## Flow

1. **Capture** – camera (`capture="environment"`) or file upload; multi-page; rotate.
2. **OCR** – images uploaded to private `route-sheets` bucket; Edge Function `process-route-sheet` runs server-side OCR.
3. **Review rows** – every row shown; crossed-out → `possibly_completed` until driver decides.
4. **Geocode** – Google Geocoding + Places Text Search (TT biased); candidates ranked by address agreement then name.
5. **Directory match** – exact place_id, similar address, aliases; driver confirms reuse.
6. **Persist** – `business_locations`, `business_aliases`, `delivery_stops`, `delivery_events` (idempotent), `route_sheet_imports`.

## What is NOT simulated

- OCR results come only from the Edge Function response. If the function is unconfigured, the UI shows a clear failure — no fake customers.
- Geocoding calls the real Google APIs when `VITE_GOOGLE_MAPS_API_KEY` is set. Without the key, the UI reports the missing configuration.

## Required configuration

| Item | Where |
|------|--------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `.env` (client) |
| `VITE_GOOGLE_MAPS_API_KEY` | `.env` (Geocoding API + Places API enabled, HTTP referrer restricted) |
| OCR provider secrets | `supabase secrets set` for Edge Function |
| Deploy Edge Function | `supabase functions deploy process-route-sheet` |
| Apply SQL migration | Dashboard SQL or `supabase db push` |

## Crossed-out policy

OCR must label strike-through / scribbled rows as `possibly_completed` or `unclear`. The driver must choose:

- Needs delivery
- Already completed
- Cancelled
- Unclear (manual)

Nothing is omitted silently.

## Tests to run manually (once credentials exist)

- Clear printed multi-column list
- Angled photograph
- Blurry / low-contrast
- Crossed-out rows
- Two nearby addresses
- Duplicate business (same place_id / similar name)
- Address without business name
- Business name without complete address
- Multiple pages

## Files

| Path | Role |
|------|------|
| `src/types/ocr.ts` | Extraction + review types |
| `src/types/geocoding.ts` | Candidate / verification types |
| `src/services/ocr/provider.ts` | Client → Edge Function |
| `src/services/geocoding/google.ts` | Google geocode + places |
| `src/services/duplicates.ts` | Directory matching |
| `src/services/importPersistence.ts` | Supabase writes |
| `src/stores/importStore.ts` | Workflow state |
| `src/pages/ImportRouteSheet.tsx` | Mobile UI |
| `supabase/functions/process-route-sheet/` | Server OCR contract |
