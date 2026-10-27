import type { SupabaseClient } from '@supabase/supabase-js';
import { formatFcfa } from '@/core/pricing';
import { loadBillingSettings } from '@/core/billing/settings';
import { notify, type NotificationInput } from './notify';

/**
 * Credit alerts (27/10): in the application only (no e-mail service yet), for the client's administrators and the
 * KÔMIAN operators — never for collaborators, who see the balance in the Studio.
 * A notification without a video (version_id null) is not deduplicated by the unique index (NULLs are distinct),
 * so the keys already sent are read first.
 */
export async function creditAlertRecipients(admin: SupabaseClient, clientId: string): Promise<string[]> {
  const { data: brands } = await admin.from('brands').select('id').eq('client_id', clientId);
  const brandIds = (brands ?? []).map((row) => String(row.id));
  const [{ data: admins }, { data: operators }] = await Promise.all([
    brandIds.length ? admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).in('brand_id', brandIds) : Promise.resolve({ data: [] as Array<{ id: string }> }),
    admin.from('profiles').select('id').eq('role', 'operateur').eq('is_active', true),
  ]);
  return [...new Set([...(admins ?? []), ...(operators ?? [])].map((row) => String(row.id)))];
}

async function notifyOnce(admin: SupabaseClient, items: NotificationInput[]) {
  if (!items.length) return 0;
  const keys = [...new Set(items.map((item) => item.dedupeKey ?? item.type))];
  const { data: existing } = await admin.from('notifications').select('user_id,dedupe_key').in('dedupe_key', keys).in('user_id', [...new Set(items.map((item) => item.userId))]);
  const sent = new Set((existing ?? []).map((row) => `${row.user_id}|${row.dedupe_key}`));
  const fresh = items.filter((item) => !sent.has(`${item.userId}|${item.dedupeKey ?? item.type}`));
  await notify(admin, fresh);
  return fresh.length;
}

/** Message of a low balance, with the threshold set by KÔMIAN. */
export function lowBalanceMessage(availableFcfa: number, thresholdFcfa: number) {
  return `Solde bas : il reste ${formatFcfa(availableFcfa)} de crédits (seuil d’alerte : ${formatFcfa(thresholdFcfa)}). Contactez KÔMIAN pour recharger.`;
}

/** One alert per crossing of the threshold: the key is tied to the latest top-up, so a new top-up re-arms it. */
export async function notifyLowBalanceIfNeeded(admin: SupabaseClient, clientId: string | null | undefined) {
  if (!clientId) return 0;
  const settings = await loadBillingSettings(admin, clientId);
  const { data: available, error } = await admin.rpc('credit_available', { p_client: clientId });
  if (error) return 0;
  const balance = Number(available ?? 0);
  if (balance >= settings.lowBalanceThresholdFcfa) return 0;
  const { data: lastLot } = await admin.from('credit_lots').select('id').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!lastLot) return 0; // no credits ever loaded: nothing to warn about yet
  const recipients = await creditAlertRecipients(admin, clientId);
  return notifyOnce(admin, recipients.map((userId) => ({ userId, versionId: null, type: 'credit_low' as const, message: lowBalanceMessage(balance, settings.lowBalanceThresholdFcfa), dedupeKey: `credit_low:${clientId}:${lastLot.id}` })));
}

/** Daily (cron): expire the due lots, then warn once per lot that still has credits and expires within N days. */
export async function runCreditMaintenance(admin: SupabaseClient, now = new Date()) {
  const { data: expired, error } = await admin.rpc('credit_expire_due', { p_client: null });
  if (error) return { expiredLots: 0, warnings: 0, available: false };
  const { data: clients } = await admin.from('clients').select('id').eq('is_active', true);
  let warnings = 0;
  for (const client of clients ?? []) {
    const clientId = String(client.id);
    const settings = await loadBillingSettings(admin, clientId);
    const limit = new Date(now.getTime() + settings.expiryWarningDays * 86_400_000).toISOString();
    const { data: lots } = await admin.from('credit_lots').select('id,remaining_fcfa,expires_at').eq('client_id', clientId).gt('remaining_fcfa', 0).gt('expires_at', now.toISOString()).lte('expires_at', limit);
    if (!lots?.length) continue;
    const recipients = await creditAlertRecipients(admin, clientId);
    warnings += await notifyOnce(admin, lots.flatMap((lot) => recipients.map((userId) => ({
      userId, versionId: null, type: 'credit_expiring' as const, dedupeKey: `credit_expiring:${lot.id}`,
      message: `${formatFcfa(Number(lot.remaining_fcfa))} de crédits expirent le ${new Date(String(lot.expires_at)).toLocaleDateString('fr-FR', { timeZone: 'Africa/Abidjan' })}.`,
    }))));
    await notifyLowBalanceIfNeeded(admin, clientId);
  }
  return { expiredLots: Number(expired ?? 0), warnings, available: true };
}
