import { createSupabaseServerClient } from '@/core/supabase/server';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { env } from '@/env';
import { normalizeProfileRole, roleSatisfies, type Role } from './roles';

export { canValidate, hasAdminRights, isOperator, roleLabel } from './roles';
export type { Role } from './roles';

export interface Actor {
  id: string;
  role: Role;
  /** Right to approve or refuse a video (always true in effect for admin and operator, see canValidate()). */
  canValidate?: boolean;
  /** Kept for the cost journal; no longer used to scope access (27/10: no departments for now). */
  department: string;
  brandId: string | null;
  /** Client owning the brand (one credit balance for all its brands). Null before migration 0041. */
  clientId?: string | null;
  name?: string;
  email?: string;
  /** Set at creation or reset by an administrator: the person must choose a password before anything else. */
  mustChangePassword?: boolean;
}
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export const PASSWORD_CHANGE_REQUIRED_MESSAGE = 'Choisissez votre mot de passe pour continuer.';

type ProfileRow = { id: string; name: string | null; role: string; department: string | null; brand_id: string | null; is_active: boolean; can_validate?: boolean | null; brand?: { client_id?: string | null } | Array<{ client_id?: string | null }> | null };

/** Mock mode deliberately provides a local operator identity; live mode always checks Supabase Auth + profile. */
export async function getActor(options: { allowPasswordChange?: boolean } = {}): Promise<Actor> {
  const hasPublicSupabase = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
  if (env.PROVIDERS_MODE === 'mock' && !hasPublicSupabase && !env.NEXT_PUBLIC_SUPABASE_URL) {
    return { id: 'mock-admin', role: 'operateur', canValidate: true, department: 'Direction', brandId: 'rimco', clientId: 'rimco', name: 'Opérateur', email: 'admin@rimco.local' };
  }
  if (!hasPublicSupabase) throw new HttpError(503, 'La connexion Supabase n’est pas configurée. Renseignez l’URL et la clé publique dans Vercel.');
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, 'Veuillez vous connecter pour continuer.');
  // Migration 0041 adds can_validate and brands.client_id; before it is applied, the former columns still work.
  const current = await supabase.from('profiles').select('id,name,role,department,brand_id,is_active,can_validate,brand:brands(client_id)').eq('id', user.id).single();
  const result = current.error && !current.data
    ? await supabase.from('profiles').select('id,name,role,department,brand_id,is_active').eq('id', user.id).single()
    : current;
  const profile = result.data as ProfileRow | null;
  if (result.error || !profile || !profile.is_active) throw new HttpError(403, 'Votre compte est inactif ou votre profil est introuvable.');
  const { role, canValidate } = normalizeProfileRole(profile.role, profile.can_validate);
  const brand = Array.isArray(profile.brand) ? profile.brand[0] : profile.brand;
  const mustChangePassword = (user.app_metadata as Record<string, unknown> | undefined)?.must_change_password === true;
  if (mustChangePassword && !options.allowPasswordChange) throw new HttpError(403, PASSWORD_CHANGE_REQUIRED_MESSAGE);
  return {
    id: profile.id, role, canValidate, department: profile.department ?? '', brandId: profile.brand_id, clientId: brand?.client_id ?? null,
    name: profile.name || user.email?.split('@')[0] || 'Utilisateur', email: user.email ?? undefined, mustChangePassword,
  };
}

/** `requireRole('admin')` also admits an operator; `requireRole('operateur')` admits the operator only. */
export async function requireRole(...roles: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!roleSatisfies(actor.role, roles)) throw new HttpError(403, 'Vous n’avez pas les droits nécessaires pour cette action.');
  return actor;
}

/** Internal KÔMIAN actions: prices, credits, provider costs, models, fal key, comparison, storage. */
export async function requireOperator(): Promise<Actor> {
  const actor = await getActor();
  if (actor.role !== 'operateur') throw new HttpError(403, 'Cette action est réservée à l’équipe KÔMIAN.');
  return actor;
}

/** Guard dedicated to server-rendered pages: unauthorized users are redirected
 * instead of surfacing a generic Next.js server error page. */
export async function requirePageRole(...roles: Role[]): Promise<Actor> {
  try {
    const actor = await getActor();
    if (!roleSatisfies(actor.role, roles)) redirect('/');
    return actor;
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) redirect('/connexion');
      if (error.message === PASSWORD_CHANGE_REQUIRED_MESSAGE) redirect('/connexion?changer-mot-de-passe=1');
      redirect('/');
    }
    throw error;
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Erreur API:', error);
  return NextResponse.json({ error: 'Une erreur est survenue. Réessayez plus tard.' }, { status: 500 });
}
