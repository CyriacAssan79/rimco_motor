import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireRole, HttpError } from '@/core/auth/guards';
import { createSupabaseServerClient } from '@/core/supabase/server';
import { placeProfileSchema, placeValidationIssue } from '@/core/motion/place-motion';
const schema = z.object({ status: z.enum(['validée','rejetée']), reason: z.string().trim().max(1000).optional(), placeProfile: z.unknown().optional() }).strict().superRefine((v, ctx) => { if (v.status === 'rejetée' && !v.reason?.trim()) ctx.addIssue({ code: 'custom', message: 'Un motif est obligatoire en cas de refus.', path: ['reason'] }); });
/** 26/10: sheet of an uploaded place (what it allows), edited by an admin in the media library. */
const profileSchema = z.object({ placeProfile: placeProfileSchema }).strict();
const MIGRATION_MESSAGE = 'Appliquez d’abord les migrations 0034 et 0035 (supabase/setup.sql) dans Supabase.';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await context.params;
    const body: unknown = await request.json();
    const supabase = await createSupabaseServerClient();
    const profile = profileSchema.safeParse(body);
    if (profile.success) {
      const { data, error } = await supabase.from('assets').update({ place_profile: profile.data.placeProfile }).eq('id', id).eq('kind', 'place').select('id').single();
      if (error) throw new HttpError(error.message.includes('place_profile') ? 503 : 404, error.message.includes('place_profile') ? MIGRATION_MESSAGE : 'Lieu introuvable ou impossible à modifier.');
      return NextResponse.json({ ...data, placeProfile: profile.data.placeProfile });
    }
    const input = schema.parse(body);
    const { data: asset, error: readError } = await supabase.from('assets').select('id,kind').eq('id', id).maybeSingle();
    if (readError || !asset) throw new HttpError(404, 'Média introuvable ou impossible à modifier.');
    // Validating a place is validating its sheet: a place without a valid sheet cannot be validated.
    const issue = placeValidationIssue({ kind: asset.kind, status: input.status, placeProfile: input.placeProfile });
    if (issue) throw new HttpError(422, issue);
    const sheet = asset.kind === 'place' && input.status === 'validée' ? { place_profile: placeProfileSchema.parse(input.placeProfile) } : {};
    const { data, error } = await supabase.from('assets').update({ status: input.status, review_reason: input.status === 'rejetée' ? input.reason?.trim() ?? null : null, ...sheet }).eq('id', id).select('id,status,review_reason').single();
    if (error) throw new HttpError(error.message.includes('place_profile') ? 503 : 404, error.message.includes('place_profile') ? MIGRATION_MESSAGE : 'Média introuvable ou impossible à modifier.');
    return NextResponse.json({ ...data, reason: input.reason ?? null });
  } catch (error) { return errorResponse(error); }
}
