import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, errorResponse, requireRole, type Actor } from '@/core/auth/guards';
import { assignableRoles, isOperator, normalizeProfileRole, ROLES } from '@/core/auth/roles';
import { clientBrandIds } from '@/core/auth/client-scope';
import { generateTemporaryPassword } from '@/core/auth/temporary-password';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { deleteMember } from '@/core/team/delete-member';

/**
 * Team (27/10, docs/specs/ROLES-CREDITS-2026-10-27.md): roles collaborateur, admin (client) and operateur (KÔMIAN);
 * validating is a right (can_validate); no departments. A client administrator never sees, creates, changes or
 * deletes an operator account. Passwords are generated here, never in the browser, and must be changed at first sign-in.
 */
const roleSchema = z.enum(ROLES);
const createSchema = z.object({ email: z.string().trim().email().max(254), name: z.string().trim().min(2).max(120), role: roleSchema.default('collaborateur'), canValidate: z.boolean().default(false), brandId: z.string().uuid().optional() }).strict();
const patchSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(120).optional(), role: roleSchema.optional(), canValidate: z.boolean().optional(), isActive: z.boolean().optional(), resetPassword: z.literal(true).optional() }).strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'id'), { message: 'Aucune modification fournie.' });
const deleteSchema = z.object({ id: z.string().uuid() }).strict();

type AdminClient = ReturnType<typeof createStorageAdminClient>;
type ProfileRow = { id: string; name: string | null; role: string; department: string | null; brand_id: string | null; is_active: boolean; can_validate?: boolean | null; created_at?: string };

function toUser(profile: ProfileRow, email: string) {
  const { role, canValidate } = normalizeProfileRole(profile.role, profile.can_validate);
  return { id: profile.id, email, name: profile.name ?? '', role, canValidate: canValidate || role !== 'collaborateur', brandId: profile.brand_id, isActive: profile.is_active, createdAt: profile.created_at };
}

/** Profiles visible to the actor: everything for an operator; the client's members, without operators, for an admin. */
async function visibleProfiles(admin: AdminClient, actor: Actor): Promise<ProfileRow[]> {
  const columns = 'id,name,role,department,brand_id,is_active,created_at';
  const attempts = [
    () => admin.from('profiles').select(`${columns},can_validate`).is('deleted_at', null).order('created_at'),
    () => admin.from('profiles').select(columns).is('deleted_at', null).order('created_at'),
    () => admin.from('profiles').select(columns).order('created_at'),
  ];
  let rows: ProfileRow[] | null = null;
  for (const attempt of attempts) {
    const { data, error } = await attempt();
    if (!error) { rows = (data ?? []) as ProfileRow[]; break; }
  }
  if (!rows) throw new HttpError(503, 'Impossible de charger les comptes utilisateurs.');
  if (isOperator(actor)) return rows;
  const brandIds = await clientBrandIds(admin, actor);
  return rows.filter((row) => normalizeProfileRole(row.role, row.can_validate).role !== 'operateur' && (!row.brand_id || brandIds.includes(row.brand_id)));
}

async function loadTarget(admin: AdminClient, actor: Actor, id: string) {
  const target = (await visibleProfiles(admin, actor)).find((row) => row.id === id);
  if (!target) throw new HttpError(404, 'Compte introuvable.');
  return target;
}

async function activeOperatorCount(admin: AdminClient) {
  const { count, error } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'operateur').eq('is_active', true);
  if (error) throw new HttpError(503, 'Impossible de vérifier les comptes KÔMIAN.');
  return count ?? 0;
}

export async function GET() {
  try {
    const actor = await requireRole('admin');
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ users: [{ id: '00000000-0000-4000-8000-000000000003', email: 'admin@rimco.local', name: 'Oury', role: 'operateur', canValidate: true, brandId: '00000000-0000-4000-8000-000000000001', isActive: true }], assignableRoles: assignableRoles(actor), currentUserId: actor.id });
    const admin = createStorageAdminClient();
    const [profiles, { data: authUsers, error: authError }] = await Promise.all([visibleProfiles(admin, actor), admin.auth.admin.listUsers({ page: 1, perPage: 1000 })]);
    if (authError) throw new HttpError(503, 'Impossible de charger les comptes utilisateurs.');
    const emailById = new Map((authUsers?.users ?? []).map((user) => [user.id, user.email ?? '']));
    return NextResponse.json({ users: profiles.map((profile) => toUser(profile, emailById.get(profile.id) ?? '')), assignableRoles: assignableRoles(actor), currentUserId: actor.id });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole('admin');
    const input = createSchema.parse(await request.json());
    if (!assignableRoles(actor).includes(input.role)) throw new HttpError(403, 'Seule l’équipe KÔMIAN peut créer un compte opérateur.');
    const temporaryPassword = generateTemporaryPassword();
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ user: { id: crypto.randomUUID(), email: input.email, name: input.name, role: input.role, canValidate: input.canValidate, brandId: input.brandId ?? null, isActive: true }, temporaryPassword }, { status: 201 });
    const admin = createStorageAdminClient();
    const brandId = input.brandId ?? actor.brandId;
    if (!brandId) throw new HttpError(422, 'Votre profil doit être rattaché à une marque pour créer un compte.');
    if (!isOperator(actor) && !(await clientBrandIds(admin, actor)).includes(brandId)) throw new HttpError(403, 'Cette marque ne fait pas partie de votre client.');
    const { data, error } = await admin.auth.admin.createUser({ email: input.email.toLowerCase(), password: temporaryPassword, email_confirm: true, user_metadata: { name: input.name }, app_metadata: { must_change_password: true } });
    if (error || !data.user) throw new HttpError(400, 'Impossible de créer ce compte. Vérifiez l’adresse e-mail et réessayez.');
    const { data: profile, error: profileError } = await admin.from('profiles')
      .update({ name: input.name, role: input.role, can_validate: input.role === 'collaborateur' ? input.canValidate : false, brand_id: brandId, is_active: true })
      .eq('id', data.user.id).select('id,name,role,department,brand_id,is_active,can_validate').single();
    if (profileError || !profile) { await admin.auth.admin.deleteUser(data.user.id); throw new HttpError(503, 'Le compte a été annulé car son profil ne pouvait pas être créé. Vérifiez que la migration 0041 est appliquée.'); }
    return NextResponse.json({ user: toUser(profile as ProfileRow, data.user.email ?? input.email), temporaryPassword }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRole('admin');
    const input = patchSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ user: input, ...(input.resetPassword ? { temporaryPassword: generateTemporaryPassword() } : {}) });
    const admin = createStorageAdminClient();
    const target = await loadTarget(admin, actor, input.id);
    const current = normalizeProfileRole(target.role, target.can_validate);
    if (input.role && !assignableRoles(actor).includes(input.role)) throw new HttpError(403, 'Seule l’équipe KÔMIAN peut attribuer le rôle opérateur.');
    const nextRole = input.role ?? current.role;
    const nextActive = input.isActive ?? target.is_active;
    if (actor.id === input.id && !nextActive) throw new HttpError(409, 'Vous ne pouvez pas désactiver votre propre compte pendant votre session.');
    if (current.role === 'operateur' && target.is_active && (nextRole !== 'operateur' || !nextActive) && await activeOperatorCount(admin) <= 1) {
      throw new HttpError(409, 'Le dernier opérateur KÔMIAN actif ne peut pas être désactivé ni rétrogradé.');
    }
    let temporaryPassword: string | undefined;
    if (input.resetPassword) {
      temporaryPassword = generateTemporaryPassword();
      const { error } = await admin.auth.admin.updateUserById(input.id, { password: temporaryPassword, app_metadata: { must_change_password: true } });
      if (error) throw new HttpError(503, 'Le mot de passe n’a pas pu être réinitialisé. Réessayez.');
    }
    const patch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.canValidate !== undefined || input.role !== undefined ? { can_validate: nextRole === 'collaborateur' ? input.canValidate ?? current.canValidate : false } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    };
    const { data: profile, error } = Object.keys(patch).length
      ? await admin.from('profiles').update(patch).eq('id', input.id).select('id,name,role,department,brand_id,is_active,can_validate').single()
      : { data: target, error: null };
    if (error || !profile) throw new HttpError(400, 'Impossible de modifier ce compte.');
    const { data: authUser } = await admin.auth.admin.getUserById(input.id);
    return NextResponse.json({ user: toUser(profile as ProfileRow, authUser.user?.email ?? ''), ...(temporaryPassword ? { temporaryPassword } : {}) });
  } catch (error) { return errorResponse(error); }
}

/** « Supprimer » (admin): deletion, or archive when the member has videos or costs (see core/team/delete-member). */
export async function DELETE(request: Request) {
  try {
    const actor = await requireRole('admin');
    const input = deleteSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ id: input.id, mode: 'deleted' });
    const admin = createStorageAdminClient();
    await loadTarget(admin, actor, input.id);
    return NextResponse.json(await deleteMember(admin, actor, input.id));
  } catch (error) { return errorResponse(error); }
}
