import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, errorResponse, requireRole } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { deleteMember } from '@/core/team/delete-member';
const roleSchema = z.enum(['collaborateur','valideur','admin']);
const createSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(12).max(128), name: z.string().trim().min(2).max(120), role: roleSchema.default('collaborateur'), department: z.string().trim().min(1).max(100), brandId: z.string().uuid() });
const patchSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(120).optional(), role: roleSchema.optional(), department: z.string().trim().min(1).max(100).optional(), brandId: z.string().uuid().nullable().optional(), isActive: z.boolean().optional() }).refine((v) => Object.keys(v).some((key) => key !== 'id'), { message: 'Aucune modification fournie.' });
export async function GET() {
  try {
    await requireRole('admin');
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ users: [{ id: '00000000-0000-4000-8000-000000000003', email: 'admin@rimco.local', name: 'Oury', role: 'admin', department: 'Direction', brandId: '00000000-0000-4000-8000-000000000001', isActive: true }] });
    const admin = createStorageAdminClient();
    // Deleted members (0040) stay as authors of their videos and costs, but leave the team. Before 0040: everyone.
    const listProfiles = async () => {
      const current = await admin.from('profiles').select('id,name,role,department,brand_id,is_active,created_at').is('deleted_at', null).order('created_at');
      return current.error ? admin.from('profiles').select('id,name,role,department,brand_id,is_active,created_at').order('created_at') : current;
    };
    const [{ data: profiles, error }, { data: authUsers, error: authError }] = await Promise.all([listProfiles(), admin.auth.admin.listUsers({ page: 1, perPage: 1000 })]);
    if (error || authError) throw new HttpError(503, 'Impossible de charger les comptes utilisateurs.');
    const emailById = new Map((authUsers?.users ?? []).map((user) => [user.id, user.email ?? '']));
    return NextResponse.json({ users: (profiles ?? []).map((profile) => ({ id: profile.id, email: emailById.get(profile.id) ?? '', name: profile.name, role: profile.role, department: profile.department, brandId: profile.brand_id, isActive: profile.is_active, createdAt: profile.created_at })) });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    await requireRole('admin');
    const input = createSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ user: { id: crypto.randomUUID(), email: input.email, name: input.name, role: input.role, department: input.department, brandId: input.brandId, isActive: true } }, { status: 201 });
    const admin = createStorageAdminClient();
    const { data, error } = await admin.auth.admin.createUser({ email: input.email.toLowerCase(), password: input.password, email_confirm: true, user_metadata: { name: input.name } });
    if (error || !data.user) throw new HttpError(400, 'Impossible de créer ce compte. Vérifiez l’adresse e-mail et réessayez.');
    const { data: profile, error: profileError } = await admin.from('profiles').update({ name: input.name, role: input.role, department: input.department, brand_id: input.brandId, is_active: true }).eq('id', data.user.id).select('id,name,role,department,brand_id,is_active').single();
    if (profileError || !profile) { await admin.auth.admin.deleteUser(data.user.id); throw new HttpError(503, 'Le compte a été annulé car son profil ne pouvait pas être créé.'); }
    return NextResponse.json({ user: { id: profile.id, email: data.user.email, name: profile.name, role: profile.role, department: profile.department, brandId: profile.brand_id, isActive: profile.is_active } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireRole('admin');
    const input = patchSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ user: input });
    const admin = createStorageAdminClient();
    const { data: target, error: targetError } = await admin.from('profiles').select('id,role,is_active').eq('id', input.id).single();
    if (targetError || !target) throw new HttpError(404, 'Compte introuvable.');
    const nextRole = input.role ?? target.role;
    const nextActive = input.isActive ?? target.is_active;
    if (target.role === 'admin' && target.is_active && (nextRole !== 'admin' || !nextActive)) {
      const { count, error } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);
      if (error) throw new HttpError(503, 'Impossible de vérifier les comptes administrateurs.');
      if ((count ?? 0) <= 1) throw new HttpError(409, 'Le dernier administrateur actif ne peut pas être désactivé ni rétrogradé.');
    }
    if (actor.id === input.id && !nextActive) throw new HttpError(409, 'Vous ne pouvez pas désactiver votre propre compte pendant votre session.');
    const patch = { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.role !== undefined ? { role: input.role } : {}), ...(input.department !== undefined ? { department: input.department } : {}), ...(input.brandId !== undefined ? { brand_id: input.brandId } : {}), ...(input.isActive !== undefined ? { is_active: input.isActive } : {}) };
    const { data: profile, error } = await admin.from('profiles').update(patch).eq('id', input.id).select('id,name,role,department,brand_id,is_active').single();
    if (error || !profile) throw new HttpError(400, 'Impossible de modifier ce compte.');
    const { data: authUser } = await admin.auth.admin.getUserById(input.id);
    return NextResponse.json({ user: { id: profile.id, email: authUser.user?.email ?? '', name: profile.name, role: profile.role, department: profile.department, brandId: profile.brand_id, isActive: profile.is_active } });
  } catch (error) { return errorResponse(error); }
}
const deleteSchema = z.object({ id: z.string().uuid() }).strict();
/** « Supprimer » (admin only): deletion, or archive when the member has videos or costs (see core/team/delete-member). */
export async function DELETE(request: Request) {
  try {
    const actor = await requireRole('admin');
    const input = deleteSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ id: input.id, mode: 'deleted' });
    return NextResponse.json(await deleteMember(createStorageAdminClient(), actor, input.id));
  } catch (error) { return errorResponse(error); }
}
