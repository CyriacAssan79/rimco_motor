import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, type Actor } from '@/core/auth/guards';

/** Tables whose rows keep a member's history (videos, costs, validations, comparisons). */
const HISTORY: Array<{ table: string; column: string }> = [
  { table: 'videos', column: 'user_id' },
  { table: 'usage_ledger', column: 'user_id' },
  { table: 'validations', column: 'submitted_by' },
  { table: 'validations', column: 'reviewed_by' },
  { table: 'comparisons', column: 'user_id' },
];

/** Blocks the login for good (about 100 years) once the member is archived. */
const PERMANENT_BAN = '876000h';

export type DeleteMemberResult = { id: string; mode: 'deleted' | 'archived' };

/**
 * « Supprimer » a member (27/10, admin only).
 * - No history: the account is deleted (login and profile; their notifications go with it).
 * - With history: the cost journal must never change, so the profile stays as the author of its videos and costs,
 *   but the member is archived: hidden from the team, inactive, login blocked for good, e-mail freed for a new account.
 * Never the actor's own account, never the last active administrator.
 */
export async function deleteMember(admin: SupabaseClient, actor: Actor, id: string): Promise<DeleteMemberResult> {
  if (actor.id === id) throw new HttpError(409, 'Vous ne pouvez pas supprimer votre propre compte.');
  // deleted_at (migration 0040) is read first: without it nothing is changed, and the message says what to apply.
  const { data: target, error: targetError } = await admin.from('profiles').select('id,role,is_active,deleted_at').eq('id', id).maybeSingle();
  if (targetError) throw new HttpError(503, 'La suppression n’est pas encore disponible : appliquez la migration 0040 (supabase/setup.sql) dans Supabase.');
  if (!target || target.deleted_at) throw new HttpError(404, 'Compte introuvable.');
  if (target.role === 'admin' && target.is_active) {
    const { count, error } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);
    if (error) throw new HttpError(503, 'Impossible de vérifier les comptes administrateurs.');
    if ((count ?? 0) <= 1) throw new HttpError(409, 'Le dernier administrateur actif ne peut pas être supprimé.');
  }

  const counts = await Promise.all(HISTORY.map(async ({ table, column }) => {
    const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(column, id);
    if (error) throw new HttpError(503, 'Impossible de vérifier l’historique de ce membre. Aucune suppression n’a été faite.');
    return count ?? 0;
  }));
  if (counts.every((count) => count === 0)) {
    const { error } = await admin.auth.admin.deleteUser(id);
    // A link not listed above still holds the profile: the member is archived instead, nothing is lost.
    if (!error) return { id, mode: 'deleted' };
    console.warn('member_delete_fell_back_to_archive', error.message);
  }
  return archiveMember(admin, id);
}

/** Login blocked first, then hidden from the team: a failure leaves the member visible, so the admin can retry. */
async function archiveMember(admin: SupabaseClient, id: string): Promise<DeleteMemberResult> {
  // The e-mail becomes a reserved address (.invalid is never delivered): the real one can be used for a new account.
  const { error: authError } = await admin.auth.admin.updateUserById(id, { email: `supprime-${id}@membre.invalid`, email_confirm: true, ban_duration: PERMANENT_BAN, user_metadata: { archived: true } });
  if (authError) throw new HttpError(503, 'La connexion de ce membre n’a pas pu être bloquée. Aucune suppression n’a été faite ; réessayez.');
  const { error: profileError } = await admin.from('profiles').update({ is_active: false, deleted_at: new Date().toISOString() }).eq('id', id);
  if (profileError) throw new HttpError(503, 'La connexion de ce membre est bloquée, mais il n’a pas pu être retiré de l’équipe. Réessayez la suppression.');
  return { id, mode: 'archived' };
}
