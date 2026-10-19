/**
 * Supabase client – uses ONLY the publishable / anon key.
 * Never import or expose a service-role key in frontend code.
 *
 * Client is intentionally untyped at the createClient boundary to avoid
 * supabase-js generic inference collapsing to `never` without generated
 * Relationships. Application code still uses types from ../types/database.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. ' +
      'Client will be created with placeholder values and all requests will fail until configured.'
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/** Storage helper – path convention: `{user_id}/{run_or_import_id}/{filename}` */
export function routeSheetPath(userId: string, importId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${userId}/${importId}/${safeName}`;
}
