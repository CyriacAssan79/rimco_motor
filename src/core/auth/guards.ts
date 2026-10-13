import { createSupabaseServerClient } from '@/core/supabase/server';
import { NextResponse } from 'next/server';
import { env } from '@/env';

export type Role = 'collaborateur' | 'valideur' | 'admin';
export interface Actor { id: string; role: Role; department: string; brandId: string | null; name?: string; email?: string }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Mock mode deliberately provides a local admin identity; live mode always checks Supabase Auth + profile. */
export async function getActor(): Promise<Actor> {
  const hasPublicSupabase = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
  if (env.PROVIDERS_MODE === 'mock' && !hasPublicSupabase && !env.NEXT_PUBLIC_SUPABASE_URL) {
    return { id: 'mock-admin', role: 'admin', department: 'Direction', brandId: 'rimco', name: 'Administrateur', email: 'admin@rimco.local' };
  }
  if (!hasPublicSupabase) throw new HttpError(503, 'La connexion Supabase n’est pas configurée. Renseignez l’URL et la clé publique dans Vercel.');
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, 'Veuillez vous connecter pour continuer.');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id,name,role,department,brand_id,is_active').eq('id', user.id).single();
  if (profileError || !profile || !profile.is_active) throw new HttpError(403, 'Votre compte est inactif ou votre profil est introuvable.');
  return { id: profile.id, role: profile.role as Role, department: profile.department, brandId: profile.brand_id, name: profile.name || user.email?.split('@')[0] || 'Utilisateur', email: user.email ?? undefined };
}
export async function requireRole(...roles: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!roles.includes(actor.role)) throw new HttpError(403, 'Vous n’avez pas les droits nécessaires pour cette action.');
  return actor;
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Erreur API:', error);
  return NextResponse.json({ error: 'Une erreur est survenue. Réessayez plus tard.' }, { status: 500 });
}
