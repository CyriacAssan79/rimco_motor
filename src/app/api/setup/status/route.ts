import { NextResponse } from 'next/server';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
export async function GET() {
  if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ hasUsers: true, mode: 'mock', configured: true });
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) || !(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return NextResponse.json({ hasUsers: false, mode: env.PROVIDERS_MODE, configured: false });
  try {
    const admin = createStorageAdminClient();
    const { count, error } = await admin.from('profiles').select('id', { count: 'exact', head: true });
    if (error) return NextResponse.json({ hasUsers: false, mode: env.PROVIDERS_MODE, configured: false });
    return NextResponse.json({ hasUsers: (count ?? 0) > 0, mode: env.PROVIDERS_MODE, configured: true });
  } catch { return NextResponse.json({ hasUsers: false, mode: env.PROVIDERS_MODE, configured: false }); }
}
