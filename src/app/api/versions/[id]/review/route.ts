import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, getActor, HttpError, requireRole } from '@/core/auth/guards';
import { getVersion, putVersion } from '@/core/versions/store';
import { env } from '@/env';
import { createStorageAdminClient } from '@/core/storage/supabase';
const schema = z.object({ decision: z.enum(['submit','approved','rejected']), reason: z.string().trim().max(1000).optional() }).superRefine((v, ctx) => { if (v.decision === 'rejected' && !v.reason?.trim()) ctx.addIssue({ code: 'custom', message: 'Un motif est obligatoire en cas de refus.', path: ['reason'] }); });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    const input = schema.parse(await request.json());
    const { id } = await context.params;
    if (input.decision === 'submit') {
      if (actor.role !== 'collaborateur' && actor.role !== 'admin') throw new HttpError(403, 'Seul le propriétaire de la vidéo peut l’envoyer en validation.');
      if (env.PROVIDERS_MODE === 'mock' && !env.NEXT_PUBLIC_SUPABASE_URL) {
        const version = getVersion(id);
        if (!version || version.userId !== actor.id && actor.role !== 'admin') throw new HttpError(404, 'Cette vidéo prête à valider est introuvable.');
        if (version.status !== 'ready' || version.reviewStatus === 'pending') throw new HttpError(409, 'Cette version n’est pas prête à être envoyée en validation.');
        putVersion({ ...version, reviewStatus: 'pending' });
        return NextResponse.json({ id, status: 'review' });
      }
      const admin = createStorageAdminClient();
      const { data: version, error } = await admin.from('video_versions').select('id,video_id,number,status,final_path,video:videos!inner(id,user_id,status,brand_id,department)').eq('id', id).single();
      const video = Array.isArray(version?.video) ? version.video[0] : version?.video;
      if (error || !version || !video || video.user_id !== actor.id && actor.role !== 'admin') throw new HttpError(404, 'Cette vidéo prête à valider est introuvable.');
      if (version.status !== 'ready' || video.status !== 'ready') throw new HttpError(409, 'Cette version n’est pas prête à être envoyée en validation.');
      if (env.PROVIDERS_MODE === 'live' && !version.final_path) throw new HttpError(409, 'Le fichier final de post-production n’est pas disponible.');
      const { data: latest } = await admin.from('video_versions').select('id').eq('video_id', video.id).order('number', { ascending: false }).limit(1).maybeSingle();
      if (latest?.id !== id) throw new HttpError(409, 'Envoyez uniquement la version la plus récente en validation.');
      const { data: existing } = await admin.from('validations').select('id,status').eq('version_id', id).maybeSingle();
      if (existing) throw new HttpError(409, 'Cette version a déjà été envoyée en validation.');
      const { data: claimed, error: claimError } = await admin.from('videos').update({ status: 'review', updated_at: new Date().toISOString() }).eq('id', video.id).eq('status', 'ready').select('id').maybeSingle();
      if (claimError || !claimed) throw new HttpError(409, 'Cette vidéo vient d’être modifiée. Actualisez la page puis réessayez.');
      const { error: validationError } = await admin.from('validations').insert({ video_id: video.id, version_id: id, submitted_by: video.user_id, status: 'pending' });
      if (validationError) {
        await admin.from('videos').update({ status: 'ready' }).eq('id', video.id).eq('status', 'review');
        throw new HttpError(503, 'Impossible d’enregistrer l’envoi en validation. Réessayez.');
      }
      return NextResponse.json({ id, status: 'review' });
    }
    await requireRole('valideur', 'admin');
    if (env.PROVIDERS_MODE === 'live' || env.NEXT_PUBLIC_SUPABASE_URL) {
      const admin = createStorageAdminClient();
      const { data: version, error: versionError } = await admin.from('video_versions')
        .select('id,video_id,status,raw_path,final_path,video:videos!inner(id,user_id,status,brand_id,department)')
        .eq('id', id).single();
      if (versionError || !version) throw new HttpError(404, 'Cette vidéo prête à valider est introuvable.');
      const video = Array.isArray(version.video) ? version.video[0] : version.video;
      if (!video || version.status !== 'ready' || video.status !== 'review') throw new HttpError(409, 'Cette vidéo n’est pas en attente de validation.');
      if (actor.role === 'valideur' && (video.brand_id !== actor.brandId || video.department !== actor.department)) throw new HttpError(403, 'Cette vidéo n’appartient pas à votre marque ou à votre département.');
      if (input.decision === 'approved' && env.PROVIDERS_MODE === 'live' && !version.final_path) throw new HttpError(409, 'Le fichier final de post-production n’est pas disponible pour validation.');

      const { data: existing, error: validationError } = await admin.from('validations').select('id,status').eq('version_id', id).maybeSingle();
      if (validationError) throw new HttpError(503, 'Impossible de charger l’état de validation.');
      if (existing && existing.status !== 'pending' && existing.status !== input.decision) throw new HttpError(409, 'Cette vidéo a déjà reçu une autre décision.');
      let validationId: string;
      if (existing) {
        validationId = existing.id;
      } else {
        const { data: created, error: createError } = await admin.from('validations').insert({ video_id: video.id, version_id: id, submitted_by: video.user_id, status: 'pending' }).select('id').single();
        if (createError || !created) throw new HttpError(503, 'Impossible de créer la demande de validation.');
        validationId = created.id;
      }

      const now = new Date().toISOString();
      if (!existing || existing.status === 'pending') {
        const { data: updatedValidation, error } = await admin.from('validations').update({ status: input.decision, reason: input.reason ?? null, reviewed_by: actor.id, reviewed_at: now }).eq('id', validationId).eq('status', 'pending').select('id').maybeSingle();
        if (error) throw new HttpError(503, 'Impossible d’enregistrer la décision de validation.');
        if (!updatedValidation) throw new HttpError(409, 'Cette vidéo vient d’être validée par un autre utilisateur.');
      }
      if (input.decision === 'rejected') {
        const { error } = await admin.from('video_versions').update({ final_path: null }).eq('id', id);
        if (error) throw new HttpError(503, 'Impossible de retirer le chemin final de cette vidéo.');
      }
      const { error: videoUpdateError } = await admin.from('videos').update({ status: input.decision }).eq('id', video.id);
      if (videoUpdateError) throw new HttpError(503, 'La décision est enregistrée; l’état de la vidéo doit être réconcilié.');
      return NextResponse.json({ id, status: input.decision, reviewedBy: actor.id, reason: input.reason ?? null, hasFinalVideo: input.decision === 'approved' });
    }
    const version = getVersion(id);
    if (!version || version.status !== 'ready') throw new HttpError(404, 'Cette vidéo prête à valider est introuvable.');
    putVersion({ ...version, reviewStatus: input.decision, reviewReason: input.reason });
    return NextResponse.json({ id, status: input.decision, reviewedBy: actor.id, reason: input.reason ?? null, hasFinalVideo: input.decision === 'approved' });
  } catch (error) { return errorResponse(error); }
}
