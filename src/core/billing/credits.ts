import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, type Actor } from '@/core/auth/guards';
import { hasAdminRights, isOperator } from '@/core/auth/roles';
import { formatFcfa } from '@/core/pricing';
import { notifyLowBalanceIfNeeded } from '@/core/notifications/credit-alerts';
import { clientIdForBrand, loadBillingSettings, revisionPriceFcfa, type BillingSettings } from './settings';

/**
 * Client credits (27/10, migration 0042, docs/specs/ROLES-CREDITS-2026-10-27.md).
 * The price of a video is held on the client's balance at launch, debited when the video is ready and released on
 * failure, cancellation or deletion — the database trigger `videos_settle_credits` settles every path.
 * A KÔMIAN operator's videos are never held (internal). Before migrations 0041/0042, nothing is held or blocked.
 */

/** Missing amount when the SQL refusal is « solde insuffisant », otherwise null. */
export function insufficientCreditAmount(error: unknown): number | null {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  const match = /^CREDIT_INSUFFICIENT:(\d+(?:\.\d+)?)$/.exec(message.trim());
  return match ? Math.ceil(Number(match[1])) : null;
}

/** Actionable message: what happens, how much is missing, who to contact. */
export function insufficientCreditMessage(missingFcfa: number, actor: Pick<Actor, 'role'>): string {
  return `Solde insuffisant : il manque ${formatFcfa(missingFcfa)} pour lancer cette vidéo. `
    + (hasAdminRights(actor) ? 'Contactez KÔMIAN pour recharger vos crédits.' : 'Contactez votre Manager RIMCO Studio.');
}

export class InsufficientCreditError extends HttpError {
  constructor(public missingFcfa: number, actor: Pick<Actor, 'role'>) { super(402, insufficientCreditMessage(missingFcfa, actor)); }
}

export type CreditContext = { clientId: string | null; settings: BillingSettings; internal: boolean };

/** Client, settings and whether the actor's videos are internal (operator). */
export async function creditContext(admin: SupabaseClient, actor: Actor): Promise<CreditContext> {
  const clientId = actor.clientId ?? await clientIdForBrand(admin, actor.brandId);
  return { clientId, settings: await loadBillingSettings(admin, clientId), internal: isOperator(actor) };
}

export async function availableCredits(admin: SupabaseClient, clientId: string): Promise<number | null> {
  const { data, error } = await admin.rpc('credit_available', { p_client: clientId });
  return error ? null : Number(data ?? 0);
}

/**
 * Early check, before anything is created or paid (« bloquer avant l'effort »). The authoritative check is the
 * atomic `credit_hold` that follows; this one only refuses fast with the missing amount.
 */
export async function assertCreditsCover(admin: SupabaseClient, actor: Actor, context: CreditContext, priceFcfa: number): Promise<void> {
  if (context.internal || !context.clientId || !context.settings.creditsEnforced || priceFcfa <= 0) return;
  const available = await availableCredits(admin, context.clientId);
  if (available !== null && available < priceFcfa) throw new InsufficientCreditError(priceFcfa - available, actor);
}

/**
 * Holds `amountFcfa` on the client's balance (idempotent on `key`). Returns the hold id, or null when nothing is held
 * (operator, no client, migration missing while credits are not enforced). Throws 402 when the balance is too low.
 */
export async function holdCredits(admin: SupabaseClient, actor: Actor, context: CreditContext, input: { videoId: string; versionId: string; kind: 'video' | 'revision'; amountFcfa: number; key: string }): Promise<string | null> {
  if (context.internal || !context.clientId || !Number.isFinite(input.amountFcfa) || input.amountFcfa <= 0) return null;
  const { data, error } = await admin.rpc('credit_hold', {
    p_client: context.clientId, p_user: actor.id, p_video: input.videoId, p_version: input.versionId,
    p_kind: input.kind, p_amount: Math.ceil(input.amountFcfa), p_key: input.key,
  });
  const missing = insufficientCreditAmount(error);
  if (missing !== null) throw new InsufficientCreditError(missing, actor);
  if (error || !data) {
    if (!context.settings.creditsEnforced) { console.warn('credit_hold_unavailable', error?.message ?? 'no id'); return null; }
    throw new HttpError(503, 'Impossible de réserver les crédits. Réessayez dans un instant.');
  }
  // Below the threshold after this hold: the client's administrators and KÔMIAN are told once (never blocks the launch).
  if (context.settings.creditsEnforced) await notifyLowBalanceIfNeeded(admin, context.clientId).catch(() => 0);
  return String(data);
}

export type CreditSummary = { enforced: boolean; availableFcfa: number; heldFcfa: number; lowBalance: boolean; thresholdFcfa: number; nextExpiry: { amountFcfa: number; at: string } | null };

export async function creditSummary(admin: SupabaseClient, clientId: string | null, settings: BillingSettings): Promise<CreditSummary> {
  const empty: CreditSummary = { enforced: settings.creditsEnforced, availableFcfa: 0, heldFcfa: 0, lowBalance: false, thresholdFcfa: settings.lowBalanceThresholdFcfa, nextExpiry: null };
  if (!clientId) return empty;
  const now = new Date().toISOString();
  const [available, { data: holds }, { data: lots }] = await Promise.all([
    availableCredits(admin, clientId),
    admin.from('credit_holds').select('amount_fcfa').eq('client_id', clientId).eq('status', 'held').eq('enforced', true),
    admin.from('credit_lots').select('remaining_fcfa,expires_at').eq('client_id', clientId).gt('remaining_fcfa', 0).gt('expires_at', now).order('expires_at').limit(1),
  ]);
  if (available === null) return empty;
  return {
    ...empty,
    availableFcfa: available,
    heldFcfa: (holds ?? []).reduce((sum, row) => sum + Number(row.amount_fcfa ?? 0), 0),
    lowBalance: available < settings.lowBalanceThresholdFcfa,
    nextExpiry: lots?.[0] ? { amountFcfa: Number(lots[0].remaining_fcfa), at: String(lots[0].expires_at) } : null,
  };
}

/** French label of a journal line (fixed vocabulary, 27/10). */
export const MOVEMENT_LABELS: Record<string, string> = {
  topup: 'Recharge',
  gift: 'Crédit offert',
  hold: 'Vidéo en cours (réservé)',
  capture: 'Vidéo débitée',
  release: 'Montant libéré',
  expiry: 'Crédits expirés',
  adjustment: 'Correction',
  extension: 'Prolongation',
};

/** A modification priced by KÔMIAN (frozen in the video) is held like the video, then debited at delivery. */
export async function holdRevisionCredits(admin: SupabaseClient, actor: Actor, brief: Record<string, unknown>, input: { videoId: string; versionId: string; key: string }): Promise<string | null> {
  const price = revisionPriceFcfa(brief);
  if (price <= 0) return null;
  return holdCredits(admin, actor, await creditContext(admin, actor), { ...input, kind: 'revision', amountFcfa: price });
}
