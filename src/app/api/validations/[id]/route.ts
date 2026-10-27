import { notify } from '@/core/notifications/notify';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canValidate, errorResponse, getActor, HttpError, isOperator } from '@/core/auth/guards';
import { isInActorClient } from '@/core/auth/client-scope';
import { createStorageAdminClient } from '@/core/storage/supabase';

const reviewSchema = z.object({ status: z.enum(['approved', 'rejected']), reason: z.string().trim().max(1000).optional() }).superRefine((value, ctx) => {
  if (value.status === 'rejected' && !value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Un motif est obligatoire en cas de refus.' });
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getActor();
    if (!canValidate(actor)) throw new HttpError(403, 'Cette action est réservée aux personnes qui ont le droit de valider.');
    const input = reviewSchema.parse(await request.json());
    const { id } = await context.params;
    const admin = createStorageAdminClient();
    const { data: validation, error } = await admin.from('validations').select('id,video_id,version_id,status,video:videos!inner(user_id,title,brand_id,department)').eq('id', id).single();
    if (error || !validation) throw new HttpError(404, 'Demande de validation introuvable.');
    const video = Array.isArray(validation.video) ? validation.video[0] : validation.video;
    // 27/10: no departments; a validator or administrator decides for the videos of their client. The author may validate their own video.
    if (!video || !isOperator(actor) && !(await isInActorClient(admin, actor, video.brand_id))) throw new HttpError(403, 'Cette vidéo ne fait pas partie de votre périmètre.');
    if (validation.status !== 'pending') throw new HttpError(409, 'Cette demande a déjà été traitée.');
    const now = new Date().toISOString();
    const { data, error: updateError } = await admin.from('validations').update({ status: input.status, reason: input.status === 'rejected' ? input.reason : null, reviewed_by: actor.id, reviewed_at: now }).eq('id', id).eq('status', 'pending').select('id,status,reason').single();
    if (updateError) throw updateError;
    await admin.from('videos').update({ status: input.status === 'approved' ? 'approved' : 'rejected', updated_at: now }).eq('id', validation.video_id);
    if (video?.user_id) {
      const name = video.title ? ` « ${video.title} »` : '';
      await notify(admin, {
        userId: video.user_id, versionId: validation.version_id, type: input.status,
        message: input.status === 'approved' ? `Votre vidéo${name} a été approuvée. Vous pouvez la télécharger.` : `Votre vidéo${name} a été refusée. Motif : ${input.reason}`,
        dedupeKey: `validation:${id}`,
      });
    }
    // The request is handled: it leaves the validators' notifications.
    await admin.from('notifications').update({ read_at: now }).eq('dedupe_key', `review_requested:${id}`).is('read_at', null);
    return NextResponse.json({ ...data, selfValidated: video?.user_id === actor.id });
  } catch (error) { return errorResponse(error); }
}
