import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/core/supabase/server';
import { env, supabaseAnonKey } from '@/env';

/**
 * « Se déconnecter »: closes the Supabase session and clears its cookies (route handler: cookies can be written here).
 * Always answers 200: a session already expired, or the simulation without Supabase, is simply « signed out ».
 */
export async function POST() {
  if (env.NEXT_PUBLIC_SUPABASE_URL && supabaseAnonKey) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) console.warn('sign_out_failed', error.message);
  }
  return NextResponse.json({ signedOut: true });
}
