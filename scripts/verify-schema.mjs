const url = process.env.SUPABASE_URL || 'https://mstxntgpjlczxjivibeb.supabase.co';
const key = process.env.SUPABASE_SECRET_KEY;
if (!key) {
  console.error('Set SUPABASE_SECRET_KEY');
  process.exit(1);
}
const tables = [
  'business_locations',
  'business_aliases',
  'route_sheet_imports',
  'delivery_runs',
  'delivery_stops',
  'delivery_events',
  'route_snapshots',
  'user_preferences',
];
let ok = 0;
for (const t of tables) {
  const res = await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.text();
  const pass = res.status === 200 || res.status === 206;
  console.log(`${pass ? 'OK' : 'FAIL'} ${t} HTTP ${res.status} ${body.slice(0, 80)}`);
  if (pass) ok++;
}
console.log(`\n${ok}/${tables.length} tables reachable`);
process.exit(ok === tables.length ? 0 : 1);
