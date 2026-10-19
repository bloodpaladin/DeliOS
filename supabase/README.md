# Supabase Persistence Layer – RoutePilot Caribbean / DeliOS

## Inspection status (2026-10-19)

- Project URL provided: `https://mstxntgpjlczxjivibeb.supabase.co`
- A publishable key was supplied (`sb_publishable_…`).
- REST root returned: `"Secret API key required"`.
- Consequently **no remote schema inspection, no migration application, and no data verification could be performed** from this environment with the given credentials.
- No existing tables were discovered or modified.

## Migration file

| File | Purpose |
|------|---------|
| `migrations/20261019220000_initial_schema.sql` | Full schema, constraints, indexes, RLS, Storage bucket + policies, helper functions |

## How to apply (manual – requires service role / CLI)

```bash
# 1. Install Supabase CLI (if not present)
npm install -g supabase

# 2. Link the project (needs access token from dashboard)
supabase link --project-ref mstxntgpjlczxjivibeb

# 3. Push migrations
supabase db push

# OR paste the SQL into the Supabase SQL Editor (Dashboard → SQL → New query)
```

After applying, verify:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT * FROM storage.buckets WHERE id = 'route-sheets';
```

## Design decisions (data integrity)

| Rule | Implementation |
|------|----------------|
| Canonical business reuse | `business_locations` is permanent; stops reference it via FK |
| No silent merge on similar names | No automatic merge logic; aliases are candidates for human review |
| Preserve original OCR | `delivery_stops.original_ocr_text`, `customer_name_raw`, `address_raw` |
| Historical aliases | `business_aliases` table, never overwritten |
| Never delete completed events | Events are append-only; route recalculation creates new snapshots |
| Idempotent completion | Unique partial index on `delivery_events.idempotency_key` + `record_delivery_event()` function |
| Same business multiple times in one run | **No** unique constraint on `(delivery_run_id, business_location_id)` |
| Confirmed locations saved immediately | App inserts into `business_locations` with `verification_status = 'confirmed'` as soon as driver confirms pin |
| Unverified clearly marked | `verification_status` enum + RLS still allows owner to see own unverified rows |

## Security

- All tables have RLS enabled.
- User-owned tables (`delivery_runs`, `route_sheet_imports`, `user_preferences`, etc.) restricted to `auth.uid()`.
- `business_locations` readable by any authenticated user when `confirmed`/`approximate`; writable by creator.
- Storage bucket `route-sheets` is **private**. Path convention: `{user_id}/{import_id}/{filename}`.
- Client code uses **only** the publishable/anon key (`VITE_SUPABASE_ANON_KEY`).

## TypeScript types

See `src/types/database.ts`.

## Seed data

`seed.sql` contains commented-out sample Trinidad & Tobago locations for local development. Uncomment and replace the user UUID after creating a test account.
