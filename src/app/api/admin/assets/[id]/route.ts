import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireRole, HttpError } from '@/core/auth/guards';
import { createSupabaseServerClient } from '@/core/supabase/server';
import { placeGeometryFromRow, placeGeometrySchema, placeGeometryToRow, PLACE_GEOMETRY_COLUMNS } from '@/core/assets/place-geometry';
import { vehicleViewOptions } from '@/core/assets/vehicle-views';

const reviewSchema = z.object({ status: z.enum(['validée','rejetée']), reason: z.string().trim().max(1000).optional() }).strict().superRefine((v, ctx) => { if (v.status === 'rejetée' && !v.reason?.trim()) ctx.addIssue({ code: 'custom', message: 'Un motif est obligatoire en cas de refus.', path: ['reason'] }); });
/** 25/10: the admin states the view of a vehicle photo (nose side included) or describes what a place photo shows. */
const viewSchema = z.object({ angle: z.enum(vehicleViewOptions) }).strict();
const placeSchema = z.object({ placeGeometry: placeGeometrySchema }).strict();
const schema = z.union([reviewSchema, viewSchema, placeSchema]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin');
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    if ('status' in input) {
      const { data, error } = await supabase.from('assets').update({ status: input.status, review_reason: input.status === 'rejetée' ? input.reason?.trim() ?? null : null }).eq('id', id).select('id,status,review_reason').single();
      if (error) throw new HttpError(404, 'Média introuvable ou impossible à modifier.');
      return NextResponse.json({ ...data, reason: input.reason ?? null });
    }
    const { data: asset, error: lookupError } = await supabase.from('assets').select('id,kind').eq('id', id).maybeSingle();
    if (lookupError || !asset) throw new HttpError(404, 'Média introuvable.');
    if ('angle' in input) {
      if (asset.kind !== 'vehicle') throw new HttpError(422, 'Seule une photo de véhicule a une vue.');
      const { data, error } = await supabase.from('assets').update({ angle: input.angle }).eq('id', id).select('id,angle').single();
      if (error) throw new HttpError(503, 'Impossible d’enregistrer la vue de cette photo.');
      return NextResponse.json(data);
    }
    if (asset.kind !== 'place') throw new HttpError(422, 'Seul un lieu a une description de route.');
    const { data, error } = await supabase.from('assets').update(placeGeometryToRow(input.placeGeometry)).eq('id', id).select(`id,${PLACE_GEOMETRY_COLUMNS}`).single();
    if (error) throw new HttpError(503, /place_viewpoint|column/i.test(error.message)
      ? 'La description des lieux n’est pas encore installée : collez la dernière version de supabase/setup.sql dans l’éditeur SQL de Supabase.'
      : 'Impossible d’enregistrer la description de ce lieu.');
    return NextResponse.json({ id, placeGeometry: placeGeometryFromRow(data as Record<string, string | null>) });
  } catch (error) { return errorResponse(error); }
}
