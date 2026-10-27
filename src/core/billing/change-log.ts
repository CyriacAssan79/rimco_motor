import type { SupabaseClient } from '@supabase/supabase-js';

export type ChangeEntry = { field: string; oldValue: unknown; newValue: unknown };

/** Fields whose value changed (numbers compared as numbers, so 700 and "700.00" are equal). */
export function changedFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>, labels: Record<string, string>): ChangeEntry[] {
  return Object.entries(labels).flatMap(([key, label]) => {
    const previous = before?.[key];
    const next = after[key];
    if (next === undefined) return [];
    const same = typeof next === 'number' || typeof previous === 'number' ? Number(previous) === Number(next) : previous === next;
    return same ? [] : [{ field: label, oldValue: previous ?? null, newValue: next }];
  });
}

/**
 * Journal of price and billing-setting changes (27/10, migration 0042): who, when, old and new value. Writing it never
 * blocks the change itself: before 0042 is applied, the change is saved and only the journal line is missing.
 */
export async function logPricingChanges(admin: SupabaseClient, input: { scope: 'pricing' | 'billing_settings'; brandId?: string | null; clientId?: string | null; actorId: string; changes: ChangeEntry[] }) {
  if (!input.changes.length) return;
  const rows = input.changes.map((change) => ({
    scope: input.scope, brand_id: input.brandId ?? null, client_id: input.clientId ?? null, field: change.field,
    old_value: change.oldValue === null || change.oldValue === undefined ? null : String(change.oldValue),
    new_value: change.newValue === null || change.newValue === undefined ? null : String(change.newValue),
    changed_by: input.actorId,
  }));
  const { error } = await admin.from('pricing_change_log').insert(rows);
  if (error) console.warn('pricing_change_log_unavailable', error.message);
}

export async function recentPricingChanges(admin: SupabaseClient, limit = 20) {
  const { data, error } = await admin.from('pricing_change_log').select('id,scope,brand_id,client_id,field,old_value,new_value,changed_by,changed_at').order('changed_at', { ascending: false }).limit(limit);
  if (error || !data?.length) return [];
  const actorIds = [...new Set(data.map((row) => row.changed_by).filter(Boolean))] as string[];
  const { data: people } = actorIds.length ? await admin.from('profiles').select('id,name').in('id', actorIds) : { data: [] };
  const names = new Map((people ?? []).map((person) => [person.id as string, (person.name as string) || 'Opérateur']));
  return data.map((row) => ({ id: row.id, scope: row.scope, brandId: row.brand_id, field: row.field, oldValue: row.old_value, newValue: row.new_value, changedBy: row.changed_by ? names.get(row.changed_by) ?? 'Opérateur' : '—', changedAt: row.changed_at }));
}
