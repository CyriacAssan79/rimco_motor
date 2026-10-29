import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { HUMAN_CLIP_REVISIONS_PER_SHOT, HUMAN_REVISIONS_PER_SHOT } from '@/core/verification/loop';

/** Billing settings of a client (27/10, migration 0042), set by the KÔMIAN operator only. */
export type BillingSettings = {
  creditsEnforced: boolean;
  lowBalanceThresholdFcfa: number;
  expiryWarningDays: number;
  purchaseValidityMonths: number;
  giftValidityMonths: number;
  humanRevisionsPerShot: number;
  humanClipRevisionsPerShot: number;
  /** 0 = modifications included in the video price; the indicative cost is then shown struck through, « non facturé ». */
  revisionPriceFcfa: number;
  /** 29/10 · O03 (migration 0045) : validation d'une vidéo avant son téléchargement ; désactivée par défaut. */
  videoValidationEnabled: boolean;
};

/** Defaults validated by the team on 27/10 (hypotheses to confirm with use). */
export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  creditsEnforced: false,
  lowBalanceThresholdFcfa: 50_000,
  expiryWarningDays: 30,
  purchaseValidityMonths: 12,
  giftValidityMonths: 3,
  humanRevisionsPerShot: HUMAN_REVISIONS_PER_SHOT,
  humanClipRevisionsPerShot: HUMAN_CLIP_REVISIONS_PER_SHOT,
  revisionPriceFcfa: 0,
  videoValidationEnabled: false,
};

export const billingSettingsPatchSchema = z.object({
  clientId: z.string().uuid(),
  creditsEnforced: z.boolean().optional(),
  lowBalanceThresholdFcfa: z.number().int().min(0).max(1_000_000_000).optional(),
  expiryWarningDays: z.number().int().min(0).max(365).optional(),
  purchaseValidityMonths: z.number().int().min(1).max(60).optional(),
  giftValidityMonths: z.number().int().min(1).max(60).optional(),
  humanRevisionsPerShot: z.number().int().min(0).max(5).optional(),
  humanClipRevisionsPerShot: z.number().int().min(0).max(5).optional(),
  revisionPriceFcfa: z.number().int().min(0).max(10_000_000).optional(),
  videoValidationEnabled: z.boolean().optional(),
}).strict();

export const BILLING_COLUMNS: Record<keyof BillingSettings, string> = {
  creditsEnforced: 'credits_enforced',
  lowBalanceThresholdFcfa: 'low_balance_threshold_fcfa',
  expiryWarningDays: 'expiry_warning_days',
  purchaseValidityMonths: 'purchase_validity_months',
  giftValidityMonths: 'gift_validity_months',
  humanRevisionsPerShot: 'human_revisions_per_shot',
  humanClipRevisionsPerShot: 'human_clip_revisions_per_shot',
  revisionPriceFcfa: 'revision_price_fcfa',
  videoValidationEnabled: 'video_validation_enabled',
};

export const BILLING_LABELS: Record<string, string> = {
  credits_enforced: 'Crédits appliqués',
  low_balance_threshold_fcfa: 'Seuil d’alerte (FCFA)',
  expiry_warning_days: 'Alerte avant expiration (jours)',
  purchase_validity_months: 'Validité d’un crédit acheté (mois)',
  gift_validity_months: 'Validité d’un crédit offert (mois)',
  human_revisions_per_shot: 'Modifications par image clé',
  human_clip_revisions_per_shot: 'Modifications par clip',
  revision_price_fcfa: 'Prix d’une modification (FCFA)',
  video_validation_enabled: 'Validation des vidéos avant téléchargement',
};

export function settingsFromRow(row: Record<string, unknown> | null | undefined): BillingSettings {
  if (!row) return { ...DEFAULT_BILLING_SETTINGS };
  const number = (key: string, fallback: number) => { const value = Number(row[key]); return Number.isFinite(value) ? value : fallback; };
  return {
    creditsEnforced: row.credits_enforced === true,
    lowBalanceThresholdFcfa: number('low_balance_threshold_fcfa', DEFAULT_BILLING_SETTINGS.lowBalanceThresholdFcfa),
    expiryWarningDays: number('expiry_warning_days', DEFAULT_BILLING_SETTINGS.expiryWarningDays),
    purchaseValidityMonths: number('purchase_validity_months', DEFAULT_BILLING_SETTINGS.purchaseValidityMonths),
    giftValidityMonths: number('gift_validity_months', DEFAULT_BILLING_SETTINGS.giftValidityMonths),
    humanRevisionsPerShot: number('human_revisions_per_shot', DEFAULT_BILLING_SETTINGS.humanRevisionsPerShot),
    humanClipRevisionsPerShot: number('human_clip_revisions_per_shot', DEFAULT_BILLING_SETTINGS.humanClipRevisionsPerShot),
    revisionPriceFcfa: number('revision_price_fcfa', DEFAULT_BILLING_SETTINGS.revisionPriceFcfa),
    // Colonne absente (0045 non appliquée) : validation désactivée, comme le défaut.
    videoValidationEnabled: row.video_validation_enabled === true,
  };
}

/** Client of a brand (brands.client_id, migration 0041). Null before the migration. */
export async function clientIdForBrand(admin: SupabaseClient, brandId: string | null | undefined): Promise<string | null> {
  if (!brandId) return null;
  const { data, error } = await admin.from('brands').select('client_id').eq('id', brandId).maybeSingle();
  return error ? null : (data?.client_id as string | null | undefined) ?? null;
}

/** Settings of a client; defaults when the client or migration 0042 is missing (the application keeps working). */
export async function loadBillingSettings(admin: SupabaseClient, clientId: string | null | undefined): Promise<BillingSettings> {
  if (!clientId) return { ...DEFAULT_BILLING_SETTINGS };
  const { data, error } = await admin.from('client_billing_settings').select('*').eq('client_id', clientId).maybeSingle();
  return settingsFromRow(error ? null : data as Record<string, unknown> | null);
}

/** Limits frozen in a video at launch (read back by humanRevisionLimit()). */
export function frozenRevisionLimits(settings: BillingSettings) {
  return { keyframe: settings.humanRevisionsPerShot, video: settings.humanClipRevisionsPerShot, priceFcfa: settings.revisionPriceFcfa };
}

/**
 * Price of a human modification frozen in the video at launch (brief_json.humanRevisionLimits.priceFcfa):
 * 0 or absent = included in the video price.
 */
export function revisionPriceFcfa(brief: Record<string, unknown> | null | undefined): number {
  const limits = brief?.humanRevisionLimits;
  const value = limits && typeof limits === 'object' ? Number((limits as Record<string, unknown>).priceFcfa) : 0;
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
