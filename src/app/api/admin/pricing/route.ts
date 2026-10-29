import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireRole } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { changedFields, logPricingChanges, recentPricingChanges } from '@/core/billing/change-log';
import { DEFAULT_VIDEO_PRICES_FCFA, VIDEO_PRICE_COLUMNS, videoPricesFromRow } from '@/core/pricing';

/** 29/10 · O01 : prix par vidéo et par niveau (forfait jusqu'à 30 s), réservé à l'opérateur KÔMIAN. */
const PRICE_LABELS = { video_price_fcfa_standard: 'Standard · FCFA par vidéo', video_price_fcfa_pro: 'Pro · FCFA par vidéo', video_price_fcfa_premium: 'Premium · FCFA par vidéo' };
const price = z.number().int().positive().max(100_000_000);
const patchSchema = z.object({ brandId: z.string().uuid(), applyToClientBrands: z.boolean().optional(), standardFcfa: price, proFcfa: price, premiumFcfa: price }).strict();
const view = (row: Record<string, unknown>) => { const prices = videoPricesFromRow(row); return { brandId: String(row.brand_id), standardFcfa: prices.standard, proFcfa: prices.pro, premiumFcfa: prices.premium }; };

export async function GET() {
  try {
    await requireRole('operateur');
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ pricing: [{ brandId: '00000000-0000-4000-8000-000000000001', brandName: 'RIMCO Motors', standardFcfa: DEFAULT_VIDEO_PRICES_FCFA.standard, proFcfa: DEFAULT_VIDEO_PRICES_FCFA.pro, premiumFcfa: DEFAULT_VIDEO_PRICES_FCFA.premium }] });
    const admin = createStorageAdminClient();
    const [{ data, error }, { data: brands, error: brandsError }] = await Promise.all([
      admin.from('pricing_settings').select(`brand_id,${VIDEO_PRICE_COLUMNS}`).order('updated_at', { ascending: false }),
      admin.from('brands').select('id,name'),
    ]);
    if (error || brandsError) throw new HttpError(503, 'Impossible de charger les prix : appliquez la migration 0044 dans Supabase.');
    const brandNames = new Map((brands ?? []).map((brand) => [brand.id, brand.name]));
    const changes = await recentPricingChanges(admin);
    return NextResponse.json({ changes, pricing: (data ?? []).map((row) => ({ ...view(row as Record<string, unknown>), brandName: brandNames.get(row.brand_id) ?? 'Marque' })) });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireRole('operateur');
    const input = patchSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ pricing: input });
    const admin = createStorageAdminClient();
    const { data: brand } = await admin.from('brands').select('id,client_id').eq('id', input.brandId).maybeSingle();
    if (!brand) throw new HttpError(404, 'Marque introuvable.');
    // « Appliquer à toutes les marques du client » : un prix pour les marques de RIMCO, sans cinq saisies.
    const { data: sameClient } = input.applyToClientBrands && brand.client_id ? await admin.from('brands').select('id').eq('client_id', brand.client_id) : { data: null };
    const brandIds = sameClient?.length ? sameClient.map((row) => String(row.id)) : [input.brandId];
    const next = { video_price_fcfa_standard: input.standardFcfa, video_price_fcfa_pro: input.proFcfa, video_price_fcfa_premium: input.premiumFcfa };
    const { data: previous } = await admin.from('pricing_settings').select(`brand_id,${VIDEO_PRICE_COLUMNS}`).in('brand_id', brandIds);
    const { data, error } = await admin.from('pricing_settings').upsert(brandIds.map((brandId) => ({ brand_id: brandId, ...next, updated_by: actor.id, updated_at: new Date().toISOString() })), { onConflict: 'brand_id' }).select(`brand_id,${VIDEO_PRICE_COLUMNS}`);
    if (error || !data?.length) throw new HttpError(400, 'Impossible d’enregistrer les prix.');
    for (const brandId of brandIds) {
      const before = (previous ?? []).find((row) => row.brand_id === brandId) as Record<string, unknown> | undefined;
      await logPricingChanges(admin, { scope: 'pricing', brandId, clientId: brand.client_id ?? null, actorId: actor.id, changes: changedFields(before, next, PRICE_LABELS) });
    }
    const row = data.find((item) => item.brand_id === input.brandId) ?? data[0];
    return NextResponse.json({ updatedBrands: brandIds.length, pricing: view(row as Record<string, unknown>) });
  } catch (error) { return errorResponse(error); }
}
