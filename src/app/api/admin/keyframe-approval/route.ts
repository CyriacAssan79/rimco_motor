import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireRole } from '@/core/auth/guards';
import { KEYFRAME_APPROVAL_MODES, normalizeApprovalMode } from '@/core/versions/keyframe-approval';
import { createStorageAdminClient } from '@/core/storage/supabase';

/** Admin · validation of the keyframes per brand (migration 0037). */
export async function GET() {
  try {
    await requireRole('admin');
    const { data, error } = await createStorageAdminClient().from('brands').select('id,name,keyframe_approval_mode').order('name');
    if (error) throw new HttpError(503, 'Le réglage n’est pas disponible : appliquez la migration 0037 (supabase/setup.sql) dans Supabase.');
    return NextResponse.json({ brands: (data ?? []).map((brand) => ({ id: brand.id, name: brand.name, mode: normalizeApprovalMode(brand.keyframe_approval_mode) })) });
  } catch (error) { return errorResponse(error); }
}

const patchSchema = z.object({ brandId: z.string().uuid(), mode: z.enum(KEYFRAME_APPROVAL_MODES) }).strict();

export async function PATCH(request: Request) {
  try {
    await requireRole('admin');
    const input = patchSchema.parse(await request.json());
    const { error } = await createStorageAdminClient().from('brands').update({ keyframe_approval_mode: input.mode }).eq('id', input.brandId);
    if (error) throw new HttpError(503, 'Le réglage n’a pas pu être enregistré : appliquez la migration 0037 (supabase/setup.sql) dans Supabase.');
    return NextResponse.json({ ok: true, mode: input.mode });
  } catch (error) { return errorResponse(error); }
}
