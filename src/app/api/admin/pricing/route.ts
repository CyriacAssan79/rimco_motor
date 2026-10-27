import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireRole } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { changedFields, logPricingChanges, recentPricingChanges } from '@/core/billing/change-log';

const PRICE_LABELS = { grid_fcfa_per_second_standard: 'Standard · FCFA/s', grid_fcfa_per_second_pro: 'Pro · FCFA/s', grid_fcfa_per_second_premium: 'Premium · FCFA/s' };
const patchSchema = z.object({ brandId: z.string().uuid(), applyToClientBrands: z.boolean().optional(), standardFcfaPerSecond: z.number().positive().max(10000000), proFcfaPerSecond: z.number().positive().max(10000000), premiumFcfaPerSecond: z.number().positive().max(10000000) });
export async function GET() {
  try {
    await requireRole('operateur');
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ pricing: [{ brandId: '00000000-0000-4000-8000-000000000001', brandName: 'RIMCO Motors', standardFcfaPerSecond: 460, proFcfaPerSecond: 700, premiumFcfaPerSecond: 950 }] });
    const admin = createStorageAdminClient();
    const [{ data, error }, { data: brands, error: brandsError }] = await Promise.all([
      admin.from('pricing_settings').select('brand_id,grid_fcfa_per_second_standard,grid_fcfa_per_second_pro,grid_fcfa_per_second_premium').order('updated_at', { ascending: false }),
      admin.from('brands').select('id,name'),
    ]);
    if (error || brandsError) throw new HttpError(503, 'Impossible de charger la grille tarifaire.');
    const brandNames = new Map((brands ?? []).map((brand) => [brand.id, brand.name]));
    const changes = await recentPricingChanges(admin);
    return NextResponse.json({ changes, pricing: (data ?? []).map((row) => ({ brandId: row.brand_id, brandName: brandNames.get(row.brand_id) ?? 'Marque', standardFcfaPerSecond: Number(row.grid_fcfa_per_second_standard), proFcfaPerSecond: Number(row.grid_fcfa_per_second_pro), premiumFcfaPerSecond: Number(row.grid_fcfa_per_second_premium) })) });
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
    // « Appliquer à toutes les marques du client » : one grid for RIMCO's five brands, without five entries.
    const { data: sameClient } = input.applyToClientBrands && brand.client_id ? await admin.from('brands').select('id').eq('client_id', brand.client_id) : { data: null };
    const brandIds = sameClient?.length ? sameClient.map((row) => String(row.id)) : [input.brandId];
    const next = { grid_fcfa_per_second_standard: input.standardFcfaPerSecond, grid_fcfa_per_second_pro: input.proFcfaPerSecond, grid_fcfa_per_second_premium: input.premiumFcfaPerSecond };
    const { data: previous } = await admin.from('pricing_settings').select('brand_id,grid_fcfa_per_second_standard,grid_fcfa_per_second_pro,grid_fcfa_per_second_premium').in('brand_id', brandIds);
    const { data, error } = await admin.from('pricing_settings').upsert(brandIds.map((brandId) => ({ brand_id: brandId, ...next, updated_by: actor.id, updated_at: new Date().toISOString() })), { onConflict: 'brand_id' }).select('brand_id,grid_fcfa_per_second_standard,grid_fcfa_per_second_pro,grid_fcfa_per_second_premium');
    if (error || !data?.length) throw new HttpError(400, 'Impossible d’enregistrer la grille tarifaire.');
    for (const brandId of brandIds) {
      const before = (previous ?? []).find((row) => row.brand_id === brandId) as Record<string, unknown> | undefined;
      await logPricingChanges(admin, { scope: 'pricing', brandId, clientId: brand.client_id ?? null, actorId: actor.id, changes: changedFields(before, next, PRICE_LABELS) });
    }
    const row = data.find((item) => item.brand_id === input.brandId) ?? data[0];
    return NextResponse.json({ updatedBrands: brandIds.length, pricing: { brandId: row.brand_id, standardFcfaPerSecond: Number(row.grid_fcfa_per_second_standard), proFcfaPerSecond: Number(row.grid_fcfa_per_second_pro), premiumFcfaPerSecond: Number(row.grid_fcfa_per_second_premium) } });
  } catch (error) { return errorResponse(error); }
}
