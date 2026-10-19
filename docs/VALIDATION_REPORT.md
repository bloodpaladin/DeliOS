# RoutePilot Caribbean — End-to-End Validation Report

**Date:** 2026-10-19  
**Repo:** https://github.com/bloodpaladin/DeliOS  
**Commit at report time:** `5ad1257`

This report only marks tests as **PASS** when they were executed and succeeded in this environment.

---

## 1. Features implemented

| Area | Status |
|------|--------|
| Vite + React + TS app shell | Implemented |
| Supabase schema (migrations SQL) | Written; **not applied** on remote project |
| RLS + private Storage policies (SQL) | Written in migration |
| Route-sheet capture / multi-page UI | Implemented |
| OCR via Edge Function contract | Implemented; **provider unconfigured** |
| Row review + crossed-out confirmation | Implemented in UI |
| Google geocoding + Places search | Implemented; needs API key |
| Directory duplicate detection | Implemented |
| Persist run / businesses / stops / events | Implemented in code |
| GPS / manual start position | Implemented |
| Google Routes + Matrix + NN/2-opt optimizer | Implemented |
| Active delivery UI + Waze/Google hand-off | Implemented |
| Resume run after reload (store loadRun) | Implemented |
| Interactive Google Map tiles | **Not** fully wired (coordinate overview only) |
| Auth sign-in screens | **Minimal** — relies on Supabase session; no polished login UI |

---

## 2. Tests executed and results

### 2.1 Live Supabase schema probe — **FAIL**

```
GET /rest/v1/business_locations → PGRST205
"Could not find the table 'public.business_locations' in the schema cache"
```

**Conclusion:** Migrations have **not** been applied to `https://mstxntgpjlczxjivibeb.supabase.co`. No persistence E2E is possible until SQL is run with a service role / SQL editor.

### 2.2 TypeScript compile (`tsc --noEmit`) — **PASS** (after fixes)

- Initial: 49+ errors (`never` from typed client + status mismatch).
- Fixes: untyped client boundary, expanded `DeliveryStatus`, null guards.
- Final: **0 errors**.

### 2.3 Pure unit tests (Node) — **PASS**

| Test | Result |
|------|--------|
| Waze deep link includes lat/lng + navigate=yes | PASS |
| Google Maps dir URL includes destination + place_id | PASS |
| Address-only fallback when coords null | PASS |
| Completed stops excluded from optimizable set | PASS |
| Failed remains in list with reason; not optimizable | PASS |
| Skipped remains optimizable | PASS |
| Next-stop selection after complete | PASS |
| Full scenario: deliver → deliver → fail → skip → resume → finish | PASS |
| Duplicate idempotency key rejected | PASS |

### 2.4 Full 20-stop photographed sheet E2E — **NOT RUN**

Blocked by:

1. No applied database schema  
2. OCR Edge Function returns “unconfigured” without secrets  
3. No `VITE_GOOGLE_MAPS_API_KEY` in environment for live geocode/routes  
4. No authenticated test user session  

### 2.5 Live routing / geocoding API calls — **NOT RUN**

No Maps API key present in this environment. Code paths throw explicit configuration errors rather than inventing routes (verified by source review + unit expectations).

### 2.6 Browser / Android driver session — **NOT RUN**

Dev server not sustained in this environment; no device lab.

### 2.7 Security scan (static) — **PASS with notes**

| Check | Result |
|-------|--------|
| Service-role key in source | **Not found** |
| `.env` gitignored | Yes |
| Client uses publishable/anon only | Yes (`src/lib/supabase.ts`) |
| OCR credentials only on Edge Function | Design intent; function not deployed |
| Publishable key in local `.env` | Present locally; not committed |
| PAT used for git push | Used in shell history of this agent session — **rotate if concerned** |

---

## 3. Remaining defects / blockers

### Critical (blocks real workday)

1. **Migrations not applied** — all tables missing on the Supabase project.  
2. **OCR provider not wired** — Edge Function returns failure until secrets + implementation.  
3. **No Google Maps key** — geocoding and Routes API cannot return real data.  
4. **No login UI / test user** — RLS requires `auth.uid()`; unauthenticated writes fail.  
5. **Status CHECK mismatch (fixed in migration 2)** — app used `navigating`/`arrived`; initial DB CHECK omitted them. Apply `20261019230000_delivery_status_expand.sql`.

### High

6. Interactive map tiles not integrated (`@react-google-maps/api` not installed).  
7. npm install on project FUSE mount is unreliable (use `/tmp` install or symlink).  
8. Failed stops are outstanding in the list but **excluded** from re-optimization (product choice; confirm with drivers).  
9. Idempotency on Mark Delivered uses timestamp suffix in UI (`tap-${Date.now()}`), which **weakens** duplicate protection for double-taps in the same second—should use a stable key per stop+status or disable button after first success.

### Medium

10. No automated integration test suite against Supabase.  
11. No offline queue for status events when connectivity drops (only local Zustand until reload).  
12. Crop/contrast tools for photos are minimal (rotate only).

---

## 4. Required API keys and account configuration

| Secret | Where | Purpose |
|--------|--------|---------|
| `VITE_SUPABASE_URL` | `.env` | Project URL |
| `VITE_SUPABASE_ANON_KEY` / publishable | `.env` | Client access |
| Supabase **service role** | Dashboard / CLI only | Apply migrations (never in frontend) |
| `VITE_GOOGLE_MAPS_API_KEY` | `.env` | Geocoding, Places, Routes, Matrix; restrict by HTTP referrer + APIs |
| OCR provider key | `supabase secrets set` | Edge Function `process-route-sheet` |
| Supabase Auth users | Dashboard | Drivers must sign in for RLS |

**Enable on Google Cloud:** Geocoding API, Places API, Routes API, Route Matrix API, (optional) Maps JavaScript API.

---

## 5. Supabase migrations applied and verified

| Migration | Applied on remote? | Verified? |
|-----------|-------------------|-----------|
| `20261019220000_initial_schema.sql` | **No** | Probe returned missing table |
| `20261019230000_delivery_status_expand.sql` | **No** | Depends on first |

**Action:** Paste both files into Supabase SQL Editor (or `supabase db push` with linked CLI) and re-probe `business_locations`.

---

## 6. Estimated external service costs

Rough order-of-magnitude (verify current Google / OCR price cards):

| Usage (busy day, 1 driver, ~40 stops) | Driver |
|--------------------------------------|--------|
| Geocoding + Places on import | Low–medium (cache directory aggressively) |
| Route Matrix + computeRoutes per re-optimize | Medium if re-optimized often |
| Maps JS tile loads | Low–medium |
| OCR pages (Document AI / Vision) | Per-page; often largest variable cost |
| Supabase free tier | OK for pilot; Storage for sheet images |

Recommendation: proxy Routes/Matrix through Edge Functions, cache matrix results for the run, debounce optimize.

---

## 7. Install on Android phone

1. Apply migrations + create a driver user in Supabase Auth.  
2. Configure `.env` keys; deploy Edge Function + OCR secrets.  
3. `npm install && npm run build`  
4. Host `dist/` on HTTPS (Vercel, Netlify, or any static host).  
5. Open the URL in Chrome on Android → “Add to Home screen” (PWA-style).  
6. Grant **location** when prompted.  
7. Sign in; import sheet; open `/run/{id}`.  
8. Install **Waze** and/or **Google Maps** for navigation hand-off.

Deep links open the installed navigation app when available.

---

## 8. Known routing and address-verification limitations

- Routes are **provider estimates**, always labelled `isEstimate: true`.  
- NN + 2-opt is **not** a proven global optimum.  
- Private roads, temporary closures, and full vehicle dimension bans may be incomplete in Google data.  
- Ambiguous TT informal addresses require **manual pin** confirmation.  
- Crossed-out OCR rows must be confirmed by the driver (`possibly_completed` only).  
- Waze’s live route is **not** controlled or compared by this app.  
- Without matrix access, order falls back to geographic distances with an explicit warning.  

---

## Production readiness verdict

**Not production-ready** for a full working day.

Reason: critical path (schema applied + OCR + Maps key + auth + live 20-stop persistence) has **not** been executed successfully end-to-end in this environment. Pure logic for stop state and navigation URLs passes; infrastructure and live integrations remain blockers.

Next priority order:

1. Apply both SQL migrations and verify tables.  
2. Create test user + sign-in.  
3. Configure Google Maps key; smoke-test one geocode + one route.  
4. Wire OCR provider in Edge Function.  
5. Run the 20-stop sheet scenario on a phone and record results.  
6. Harden Mark Delivered idempotency (stable key + disable control).  
7. Add interactive map markers.  
