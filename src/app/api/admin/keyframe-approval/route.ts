import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, HttpError, requireOperator } from '@/core/auth/guards';
import { KEYFRAME_APPROVAL_MODES, normalizeApprovalMode } from '@/core/versions/keyframe-approval';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { changedFields, logPricingChanges } from '@/core/billing/change-log';

/**
 * Espace KÔMIAN · validations humaines par marque (0037 images clés, 0043 clips). 28/10 : réservé à l'opérateur
 * (l'administrateur du client ne les change plus) ; chaque changement est tracé comme les tarifs.
 */
export async function GET() {
  try {
    await requireOperator();
    const admin = createStorageAdminClient();
    // Before 0043 the clip column is missing: read the keyframe setting alone (clips then follow it, as before).
    const full = await admin.from('brands').select('id,name,keyframe_approval_mode,clip_approval_enabled').order('name');
    const { data, error } = full.error ? await admin.from('brands').select('id,name,keyframe_approval_mode').order('name') : full;
    if (error) throw new HttpError(503, 'Le réglage n’est pas disponible : appliquez les migrations 0037 et 0043 (supabase/setup.sql) dans Supabase.');
    return NextResponse.json({ brands: (data ?? []).map((brand) => ({ id: brand.id, name: brand.name, mode: normalizeApprovalMode(brand.keyframe_approval_mode), clipApproval: (brand as { clip_approval_enabled?: unknown }).clip_approval_enabled !== false })) });
  } catch (error) { return errorResponse(error); }
}

const patchSchema = z.object({ brandId: z.string().uuid(), mode: z.enum(KEYFRAME_APPROVAL_MODES).optional(), clipApproval: z.boolean().optional() }).strict()
  .refine((input) => input.mode !== undefined || input.clipApproval !== undefined, { message: 'Aucun réglage à enregistrer.' });

const LABELS = { keyframe_approval_mode: 'Validation des images clés', clip_approval_enabled: 'Validation des clips' };

export async function PATCH(request: Request) {
  try {
    const actor = await requireOperator();
    const input = patchSchema.parse(await request.json());
    const admin = createStorageAdminClient();
    const patch: Record<string, unknown> = {};
    if (input.mode !== undefined) patch.keyframe_approval_mode = input.mode;
    if (input.clipApproval !== undefined) patch.clip_approval_enabled = input.clipApproval;
    const { data: before } = await admin.from('brands').select('client_id,keyframe_approval_mode,clip_approval_enabled').eq('id', input.brandId).maybeSingle();
    const { error } = await admin.from('brands').update(patch).eq('id', input.brandId);
    if (error) throw new HttpError(503, 'Le réglage n’a pas pu être enregistré : appliquez les migrations 0037 et 0043 (supabase/setup.sql) dans Supabase.');
    await logPricingChanges(admin, { scope: 'billing_settings', brandId: input.brandId, clientId: (before as { client_id?: string | null } | null)?.client_id ?? null, actorId: actor.id, changes: changedFields(before as Record<string, unknown> | null, patch, LABELS) }).catch(() => undefined);
    return NextResponse.json({ ok: true, ...patch });
  } catch (error) { return errorResponse(error); }
}
