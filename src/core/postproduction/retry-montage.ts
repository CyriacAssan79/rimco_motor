import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, type Actor } from '@/core/auth/guards';
import { montageShots, storedClipApproval } from '@/core/versions/clip-approval';
import { assembleShotMontage } from './pipeline';
import { montageFailureDecision } from './montage-failure';

/** Explicit admin recovery: only local assembly, never provider polling, submission or billing. */
export async function retryFailedMontage(admin: SupabaseClient, versionId: string, actor: Actor) {
  if (actor.role !== 'admin') throw new HttpError(403, 'Seul un administrateur peut relancer ce montage.');
  const { data: version, error } = await admin.from('video_versions')
    .select('id,status,brief_json,final_path,updated_at').eq('id', versionId).maybeSingle();
  if (error) throw new HttpError(503, 'Impossible de vérifier le montage.');
  if (!version) throw new HttpError(404, 'Cette version est introuvable.');
  const brief = version.brief_json && typeof version.brief_json === 'object' ? version.brief_json as Record<string, unknown> : {};
  if (version.status !== 'failed' || version.final_path || typeof brief.lastMontageError !== 'string' || !(brief.multiClipMode || brief.singleStoryboardMode)) {
    throw new HttpError(409, 'Seul un montage en échec avec ses clips conservés peut être relancé ici.');
  }
  const { data: shots, error: shotsError } = await admin.from('video_shots')
    .select('shot_number,duration_seconds,status,raw_path,verification_history').eq('version_id', versionId).order('shot_number');
  if (shotsError) throw new HttpError(503, 'Impossible de vérifier les clips conservés.');
  try { montageShots(shots ?? [], storedClipApproval(brief).required); }
  catch { throw new HttpError(409, 'Les clips actifs doivent être disponibles et validés pour relancer uniquement le montage.'); }

  const at = new Date().toISOString();
  const retryBrief = { ...brief, montageRetry: { requestedAt: at, requestedBy: actor.id } };
  // Same row and compare-and-set as the processing loop: a second tab cannot start another montage.
  const { data: claimed, error: claimError } = await admin.from('video_versions')
    .update({ status: 'postprocessing', error_message: null, brief_json: retryBrief, updated_at: at })
    .eq('id', versionId).eq('status', 'failed').eq('updated_at', version.updated_at).select('id').maybeSingle();
  if (claimError) throw new HttpError(503, 'Impossible de réserver la reprise du montage.');
  if (!claimed) throw new HttpError(409, 'Ce montage a déjà été relancé. Actualisez la page.');
  try {
    return await assembleShotMontage(versionId);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Erreur inconnue du montage.';
    const failure = montageFailureDecision(brief.montageAttempts, message);
    const { error: saveError } = await admin.from('video_versions').update({ status: 'failed', error_message: failure.userMessage,
      brief_json: { ...retryBrief, montageAttempts: failure.attempts, lastMontageError: message.slice(0, 500) }, updated_at: new Date().toISOString(),
    }).eq('id', versionId).eq('status', 'postprocessing');
    if (saveError) throw new HttpError(503, 'Le montage a échoué et son état doit être actualisé. Les clips sont conservés.');
    throw new HttpError(502, failure.userMessage);
  }
}
