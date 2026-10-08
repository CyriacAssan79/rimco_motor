import { createClient } from '@supabase/supabase-js';
import { env, supabaseServiceKey } from '@/env';
/** Server-only service client; never import this module from client components. */
export function createStorageAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !supabaseServiceKey) throw new Error('Configuration Supabase serveur manquante.');
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
