import { HttpError, type Actor } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';

type AdminClient = ReturnType<typeof createStorageAdminClient>;

/**
 * Finalise une génération administrateur comme validée.
 * L'opération est idempotente afin que les rafraîchissements répétés de la
 * file ne créent jamais plusieurs validations pour la même version.
 */
export async function approveCompletedAdminVideo(
  admin: AdminClient,
  actor: Actor,
  input: { videoId: string; versionId: string },
) {
  if (actor.role !== 'admin') return;

  const { data: existing, error: existingError } = await admin
    .from('validations')
    .select('id')
    .eq('version_id', input.versionId)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();
  if (existingError) throw new HttpError(503, 'La validation automatique doit être réconciliée par l’administrateur.');

  const now = new Date().toISOString();
  if (!existing) {
    const { error: insertError } = await admin.from('validations').insert({
      video_id: input.videoId,
      version_id: input.versionId,
      submitted_by: actor.id,
      reviewed_by: actor.id,
      status: 'approved',
      reviewed_at: now,
    });
    if (insertError) throw new HttpError(503, 'La validation automatique n’a pas pu être enregistrée.');
  }

  const { error: videoError } = await admin.from('videos').update({ status: 'approved', updated_at: now }).eq('id', input.videoId);
  if (videoError) throw new HttpError(503, 'La vidéo est prête, mais son statut de validation doit être réconcilié.');
}
