import type { SupabaseClient } from '@supabase/supabase-js';
import type { Actor } from './guards';

/**
 * Brands of the actor's client (27/10: one client, RIMCO, owns several brands and one credit balance).
 * Before migration 0041 (no brands.client_id) or without a client, the scope is the actor's own brand.
 */
export async function clientBrandIds(admin: SupabaseClient, actor: Pick<Actor, 'brandId' | 'clientId'>): Promise<string[]> {
  const own = actor.brandId ? [actor.brandId] : [];
  if (!actor.clientId) return own;
  const { data, error } = await admin.from('brands').select('id').eq('client_id', actor.clientId);
  if (error || !data?.length) return own;
  return [...new Set([...own, ...data.map((row) => String(row.id))])];
}

/** True when a video of `brandId` belongs to the actor's client. */
export async function isInActorClient(admin: SupabaseClient, actor: Pick<Actor, 'brandId' | 'clientId'>, brandId: string | null | undefined): Promise<boolean> {
  if (!brandId) return false;
  if (brandId === actor.brandId) return true;
  return (await clientBrandIds(admin, actor)).includes(brandId);
}
