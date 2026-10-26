import { z } from 'zod';
import { HttpError, type Actor } from '@/core/auth/guards';
import { reserveKeyframeCost, settleUsageCost } from '@/core/billing/ledger';
import { KEYFRAME_IMAGE_COST_USD, KEYFRAME_QUALITY_RESERVE_USD } from '@/core/providers/fal-keyframes';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { appendVerification, MAX_KEYFRAME_ATTEMPTS, storedVerdict } from '@/core/verification/loop';
import { env } from '@/env';
import { warningIssues } from './quality-gate';

/** « Abandonner » is the existing cancellation (/api/versions/[id]/cancel): it releases every unused reservation. */
export const shotReviewSchema = z.object({ decision: z.enum(['accept', 'retry']) });
export type ShotReviewDecision = z.infer<typeof shotReviewSchema>['decision'];

const HUMAN_ACCEPT_NOTE = 'Accepté par décision humaine malgré le refus du contrôle automatique';

/**
 * Human decision on a shot stopped by a verifier (boucle de vérification).
 * - accept: the keyframe is animated, or the clip goes to the montage, flagged for the validator;
 * - retry (keyframe only): one more correction by the director, with its own image and check reserved now.
 */
export async function reviewShot(actor: Actor, versionId: string, shotNumber: number, decision: ShotReviewDecision) {
  const admin = createStorageAdminClient();
  const { data: version, error } = await admin.from('video_versions').select('id,status,video:videos!inner(user_id,department)').eq('id', versionId).maybeSingle();
  const video = Array.isArray(version?.video) ? version.video[0] : version?.video;
  if (error || !version || !video || video.user_id !== actor.id && actor.role !== 'admin') throw new HttpError(404, 'Cette version est introuvable.');
  if (version.status !== 'generating') throw new HttpError(409, 'Cette vidéo n’attend plus de décision.');
  const { data: shot, error: shotError } = await admin.from('video_shots')
    .select('shot_number,keyframe_status,keyframe_quality,keyframe_retry_count,keyframe_image_ledger_ids,keyframe_quality_ledger_ids,video_quality_status,video_quality,video_quality_retry_count,video_quality_ledger_ids,verification_history')
    .eq('version_id', versionId).eq('shot_number', shotNumber).maybeSingle();
  if (shotError || !shot) throw new HttpError(404, 'Ce plan est introuvable.');
  const now = new Date().toISOString();
  const release = (entryId: unknown) => typeof entryId === 'string' ? settleUsageCost(admin, { entryId, outcome: 'released', actualCostUsd: 0, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA, billable: false }) : Promise.resolve(null);
  const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

  if (shot.keyframe_status === 'awaiting_review') {
    const attempt = Number(shot.keyframe_retry_count ?? 0);
    const verdict = storedVerdict(shot.keyframe_quality) ?? { approved: false, issues: [], reason: '' };
    if (decision === 'accept') {
      const history = appendVerification(shot.verification_history, { stage: 'keyframe', attempt, at: now, approved: verdict.approved, issues: verdict.issues, reason: verdict.reason, decision: 'human_accept', by: 'human' });
      const quality = { ...verdict, warning: true, warningIssues: [...warningIssues(verdict), HUMAN_ACCEPT_NOTE].slice(-5), humanDecision: { by: actor.id, at: now } };
      const { data: updated, error: updateError } = await admin.from('video_shots').update({ keyframe_status: 'ready', keyframe_quality: quality, verification_history: history, error_message: null, updated_at: now })
        .eq('version_id', versionId).eq('shot_number', shotNumber).eq('keyframe_status', 'awaiting_review').select('shot_number').maybeSingle();
      if (updateError) throw new HttpError(503, 'Impossible d’enregistrer la décision.');
      if (!updated) throw new HttpError(409, 'Ce plan a déjà reçu une décision.');
      await Promise.all([...ids(shot.keyframe_image_ledger_ids).slice(attempt + 1), ...ids(shot.keyframe_quality_ledger_ids).slice(attempt + 1)].map(release));
      return { shotNumber, decision, status: 'accepted' as const };
    }
    if (attempt + 1 >= MAX_KEYFRAME_ATTEMPTS) throw new HttpError(409, 'Le nombre maximal de relances est atteint pour ce plan. Acceptez-le ou annulez la vidéo.');
    const imageIds = ids(shot.keyframe_image_ledger_ids);
    const qualityIds = ids(shot.keyframe_quality_ledger_ids);
    // The next attempt uses slot attempt + 1; reserve it unless an automatic correction slot is still free.
    if (imageIds.length <= attempt + 1) {
      const reserve = (estimatedCostUsd: number) => reserveKeyframeCost(admin, { userId: video.user_id, versionId, department: video.department ?? '', estimatedCostUsd, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA });
      const [image, quality] = await Promise.all([reserve(KEYFRAME_IMAGE_COST_USD), reserve(KEYFRAME_QUALITY_RESERVE_USD)]);
      if (image.error || !image.data || quality.error || !quality.data) {
        await Promise.all([release(image.data), release(quality.data)]);
        throw new HttpError(503, 'Impossible de réserver le coût de la relance. Aucune image n’a été demandée.');
      }
      imageIds.push(image.data);
      qualityIds.push(quality.data);
    }
    const history = appendVerification(shot.verification_history, { stage: 'keyframe', attempt, at: now, approved: verdict.approved, issues: verdict.issues, reason: verdict.reason, decision: 'human_retry', by: 'human' });
    const { data: updated, error: updateError } = await admin.from('video_shots').update({ keyframe_status: 'revising', keyframe_image_ledger_ids: imageIds, keyframe_quality_ledger_ids: qualityIds, revision_request_id: null, revision_ledger_id: null, verification_history: history, updated_at: now })
      .eq('version_id', versionId).eq('shot_number', shotNumber).eq('keyframe_status', 'awaiting_review').select('shot_number').maybeSingle();
    if (updateError) throw new HttpError(503, 'Impossible d’enregistrer la relance.');
    if (!updated) throw new HttpError(409, 'Ce plan a déjà reçu une décision.');
    return { shotNumber, decision, status: 'revising' as const };
  }

  if (shot.video_quality_status === 'awaiting_review') {
    if (decision === 'retry') throw new HttpError(409, 'Un clip refusé ne se relance pas depuis ici : acceptez-le ou annulez la vidéo.');
    const attempt = Number(shot.video_quality_retry_count ?? 0);
    const verdict = storedVerdict(shot.video_quality) ?? { approved: false, issues: [], reason: '' };
    const history = appendVerification(shot.verification_history, { stage: 'video', attempt, at: now, approved: verdict.approved, issues: verdict.issues, reason: verdict.reason, decision: 'human_accept', by: 'human' });
    const quality = { ...verdict, warning: true, warningIssues: [...warningIssues(verdict), HUMAN_ACCEPT_NOTE].slice(-5), humanDecision: { by: actor.id, at: now } };
    const { data: updated, error: updateError } = await admin.from('video_shots').update({ status: 'ready', video_quality_status: 'passed', video_quality: quality, verification_history: history, error_message: null, updated_at: now })
      .eq('version_id', versionId).eq('shot_number', shotNumber).eq('video_quality_status', 'awaiting_review').select('shot_number').maybeSingle();
    if (updateError) throw new HttpError(503, 'Impossible d’enregistrer la décision.');
    if (!updated) throw new HttpError(409, 'Ce plan a déjà reçu une décision.');
    await Promise.all(ids(shot.video_quality_ledger_ids).slice(attempt + 1).map(release));
    return { shotNumber, decision, status: 'accepted' as const };
  }
  throw new HttpError(409, 'Ce plan n’attend pas de décision.');
}
