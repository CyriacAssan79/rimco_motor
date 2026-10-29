import { NextResponse } from 'next/server';
import { errorResponse, getActor, hasAdminRights, HttpError, isOperator } from '@/core/auth/guards';
import { isInActorClient } from '@/core/auth/client-scope';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { shotReportRow, shotReportSchema } from '@/core/versions/shot-reports';
import { env } from '@/env';

/**
 * 29/10 · S01 · « Non conforme » sur un plan, avant le montage : la déclaration est inscrite avant l'action choisie
 * (accepter, relancer, rejeter), qui passe ensuite par les routes existantes. Auteur de la vidéo, Manager du client
 * ou opérateur KÔMIAN.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; shot: string }> }) {
  try {
    const actor = await getActor();
    const { id, shot } = await context.params;
    const shotNumber = Number(shot);
    if (!Number.isInteger(shotNumber) || shotNumber < 1 || shotNumber > 6) throw new HttpError(400, 'Numéro de plan invalide.');
    const parsed = shotReportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.find((issue) => issue.code === 'custom')?.message ?? 'Signalement invalide.');
    if (env.PROVIDERS_MODE !== 'live' && !env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ reported: true, simulated: true });
    const admin = createStorageAdminClient();
    const { data: version, error } = await admin.from('video_versions').select('id,video_id,status,video:videos!inner(user_id,brand_id,title)').eq('id', id).maybeSingle();
    const video = Array.isArray(version?.video) ? version.video[0] : version?.video;
    if (error || !version || !video) throw new HttpError(404, 'Cette version est introuvable.');
    const allowed = video.user_id === actor.id || isOperator(actor) || (hasAdminRights(actor) && await isInActorClient(admin, actor, video.brand_id));
    if (!allowed) throw new HttpError(404, 'Cette version est introuvable.');
    if (version.status !== 'generating') throw new HttpError(409, 'Cette vidéo n’attend plus de décision.');
    const { data: brand } = video.brand_id ? await admin.from('brands').select('client_id').eq('id', video.brand_id).maybeSingle() : { data: null };
    const { data: report, error: insertError } = await admin.from('shot_reports').insert({
      ...shotReportRow(parsed.data), version_id: id, video_id: version.video_id, video_title: video.title ?? null,
      brand_id: video.brand_id ?? null, client_id: brand?.client_id ?? null, shot_number: shotNumber, reported_by: actor.id,
    }).select('id').single();
    if (insertError || !report) throw new HttpError(503, 'Le signalement n’a pas pu être enregistré : appliquez la migration 0046 dans Supabase.');
    return NextResponse.json({ reported: true, id: report.id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
