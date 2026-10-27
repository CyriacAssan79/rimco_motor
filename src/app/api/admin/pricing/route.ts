import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireRole } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
const patchSchema = z.object({ brandId: z.string().uuid(), standardFcfaPerSecond: z.number().positive().max(10000000), proFcfaPerSecond: z.number().positive().max(10000000), premiumFcfaPerSecond: z.number().positive().max(10000000) });
export async function GET() {
  try {
    await requireRole('admin');
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ pricing: [{ brandId: '00000000-0000-4000-8000-000000000001', brandName: 'RIMCO Motors', standardFcfaPerSecond: 460, proFcfaPerSecond: 700, premiumFcfaPerSecond: 950 }] });
    const admin = createStorageAdminClient();
    const [{ data, error }, { data: brands, error: brandsError }] = await Promise.all([
      admin.from('pricing_settings').select('brand_id,grid_fcfa_per_second_standard,grid_fcfa_per_second_pro,grid_fcfa_per_second_premium').order('updated_at', { ascending: false }),
      admin.from('brands').select('id,name'),
    ]);
    if (error || brandsError) throw new HttpError(503, 'Impossible de charger la grille tarifaire.');
    const brandNames = new Map((brands ?? []).map((brand) => [brand.id, brand.name]));
    return NextResponse.json({ pricing: (data ?? []).map((row) => ({ brandId: row.brand_id, brandName: brandNames.get(row.brand_id) ?? 'Marque', standardFcfaPerSecond: Number(row.grid_fcfa_per_second_standard), proFcfaPerSecond: Number(row.grid_fcfa_per_second_pro), premiumFcfaPerSecond: Number(row.grid_fcfa_per_second_premium) })) });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireRole('admin');
    const input = patchSchema.parse(await request.json());
    if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ pricing: input });
    const admin = createStorageAdminClient();
    const { data: brand } = await admin.from('brands').select('id').eq('id', input.brandId).maybeSingle();
    if (!brand) throw new HttpError(404, 'Marque introuvable.');
    const { data, error } = await admin.from('pricing_settings').upsert({ brand_id: input.brandId, grid_fcfa_per_second_standard: input.standardFcfaPerSecond, grid_fcfa_per_second_pro: input.proFcfaPerSecond, grid_fcfa_per_second_premium: input.premiumFcfaPerSecond, updated_by: actor.id, updated_at: new Date().toISOString() }, { onConflict: 'brand_id' }).select('brand_id,grid_fcfa_per_second_standard,grid_fcfa_per_second_pro,grid_fcfa_per_second_premium').single();
    if (error || !data) throw new HttpError(400, 'Impossible d’enregistrer la grille tarifaire.');
    return NextResponse.json({ pricing: { brandId: data.brand_id, standardFcfaPerSecond: Number(data.grid_fcfa_per_second_standard), proFcfaPerSecond: Number(data.grid_fcfa_per_second_pro), premiumFcfaPerSecond: Number(data.grid_fcfa_per_second_premium) } });
  } catch (error) { return errorResponse(error); }
}
