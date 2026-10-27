import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, type Actor } from '@/core/auth/guards';
import { hasAdminRights, isOperator } from '@/core/auth/roles';
import { clientIdForBrand } from './settings';

/**
 * Who reads which credits (27/10): an operator any client (?clientId), an administrator their client, a collaborator
 * their own lines only. The scope is decided here, on the server.
 */
export async function creditScope(admin: SupabaseClient, actor: Actor, params: URLSearchParams) {
  const requested = params.get('clientId');
  const clientId = isOperator(actor) && requested ? requested : actor.clientId ?? await clientIdForBrand(admin, actor.brandId);
  if (!clientId) {
    if (isOperator(actor)) {
      const { data } = await admin.from('clients').select('id').order('name').limit(1).maybeSingle();
      if (data?.id) return { clientId: String(data.id), userId: params.get('userId'), seesAll: true };
    }
    throw new HttpError(503, 'Les crédits ne sont pas encore disponibles : appliquez les migrations 0041 et 0042 dans Supabase.');
  }
  const seesAll = hasAdminRights(actor);
  return { clientId, userId: seesAll ? params.get('userId') : actor.id, seesAll };
}

export function periodFilters(params: URLSearchParams) {
  const date = (value: string | null, end = false) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : null;
  return { from: date(params.get('from')), to: date(params.get('to'), true) };
}
