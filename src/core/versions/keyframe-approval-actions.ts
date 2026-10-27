import { hasAdminRights } from '@/core/auth/roles';
import { HttpError, type Actor } from '@/core/auth/guards';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { appendVerification } from '@/core/verification/loop';
import { isShotApproved, storedApproval } from './keyframe-approval';

/**
 * Validation of keyframes on the board. Each shot gets a human « approve » entry in its history; the follow-up
 * starts the animation when every shot is validated (one submission: the existing per-shot claim).
 */
export async function approveKeyframes(actor: Actor, versionId: string, shots: 'all' | number[]) {
  const admin = createStorageAdminClient();
  const { data: version, error } = await admin.from('video_versions').select('id,status,brief_json,video:videos!inner(user_id)').eq('id', versionId).maybeSingle();
  const video = Array.isArray(version?.video) ? version.video[0] : version?.video;
  if (error || !version || !video || video.user_id !== actor.id && !hasAdminRights(actor)) throw new HttpError(404, 'Cette version est introuvable.');
  const approval = storedApproval(version.brief_json && typeof version.brief_json === 'object' ? version.brief_json as Record<string, unknown> : {});
  if (version.status !== 'generating' || !approval.required || approval.approvedAt || approval.expiredAt) throw new HttpError(409, 'Ces images clés n’attendent plus de validation.');
  const { data: rows, error: shotsError } = await admin.from('video_shots').select('shot_number,keyframe_status,keyframe_retry_count,keyframe_quality,verification_history').eq('version_id', versionId);
  if (shotsError || !rows) throw new HttpError(503, 'Impossible de lire les plans de la vidéo.');
  const now = new Date().toISOString();
  const targets = rows.filter((shot) => (shots === 'all' || shots.includes(Number(shot.shot_number))) && shot.keyframe_status === 'ready' && !isShotApproved(shot.verification_history));
  for (const shot of targets) {
    const history = appendVerification(shot.verification_history, { stage: 'keyframe', attempt: Number(shot.keyframe_retry_count ?? 0), at: now, approved: true, issues: [], reason: 'Validé par l’utilisateur', decision: 'human_approve', by: 'human' });
    const { error: updateError } = await admin.from('video_shots').update({ verification_history: history, updated_at: now }).eq('version_id', versionId).eq('shot_number', shot.shot_number).eq('keyframe_status', 'ready');
    if (updateError) throw new HttpError(503, 'La validation n’a pas pu être enregistrée.');
  }
  const approvedNumbers = new Set([...rows.filter((shot) => isShotApproved(shot.verification_history)).map((shot) => Number(shot.shot_number)), ...targets.map((shot) => Number(shot.shot_number))]);
  return { approved: targets.length, allApproved: rows.every((shot) => approvedNumbers.has(Number(shot.shot_number))) };
}
