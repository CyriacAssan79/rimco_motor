import { recordDisagreement } from '@/core/verification/disagreements';
import { storedClipApproval } from './clip-approval';
import { z } from 'zod';
import { HttpError, type Actor } from '@/core/auth/guards';
import { reserveInternalClipCost, reserveKeyframeCost, settleUsageCost } from '@/core/billing/ledger';
import { KEYFRAME_QUALITY_RESERVE_USD } from '@/core/providers/fal-keyframes';
import { storedRenderSettings } from './render-settings';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { appendVerification, cleanUserFeedback, MAX_CLIP_RETRIES, HUMAN_REVISIONS_PER_SHOT, HUMAN_CLIP_REVISIONS_PER_SHOT, humanRevisionsUsed, MAX_KEYFRAME_ATTEMPTS, REVISION_REASON_IDS, storedVerdict, USER_FEEDBACK_MAX_LENGTH } from '@/core/verification/loop';
import { revisionCapCheck, storedCostPlan } from '@/core/billing/video-cap';
import { env } from '@/env';
import { warningIssues } from './quality-gate';
import { clipRedoCostUsd, relaunchCostUsd } from './review-details';
import { detectFeedbackConflicts } from './shot-feedback';
import { isShotApproved, storedApproval } from './keyframe-approval';

/**
 * « Abandonner » is the existing cancellation (/api/versions/[id]/cancel): it releases every unused reservation.
 * `revise` (« Modifier ce plan », 27/10): ticked reasons from a closed list and/or a comment, one of them at least.
 * `retry` is the older relaunch without comment; it counts in the same budget of human corrections.
 */
export const shotReviewSchema = z.object({
  decision: z.enum(['accept', 'retry', 'revise']),
  feedback: z.string().max(USER_FEEDBACK_MAX_LENGTH * 2).optional(),
  reasons: z.array(z.enum(REVISION_REASON_IDS as [string, ...string[]])).max(REVISION_REASON_IDS.length).optional(),
  /** Refused clip only: « Refaire la vidéo de ce plan » (clip) or « Refaire l’image clé puis la vidéo » (full). */
  scope: z.enum(['clip', 'full']).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'revise' && !cleanUserFeedback(value.feedback) && !value.reasons?.length) {
    context.addIssue({ code: 'custom', path: ['feedback'], message: 'Cochez au moins un motif ou dites ce qui ne va pas.' });
  }
});
export type ShotReviewInput = z.infer<typeof shotReviewSchema>;
export type ShotReviewDecision = ShotReviewInput['decision'];

/** Simulation: the decision is answered without any call; the closed list of conflicts still reads the comment. */
export function simulateShotReview(shotNumber: number, input: ShotReviewInput) {
  if (input.decision === 'accept') return { shotNumber, decision: input.decision, status: 'accepted' as const, simulated: true };
  const feedback = cleanUserFeedback(input.feedback);
  return { shotNumber, decision: input.decision, status: 'revising' as const, feedbackConflicts: detectFeedbackConflicts(feedback, {}).map((conflict) => conflict.message), revisionsLeft: HUMAN_REVISIONS_PER_SHOT - 1, simulated: true };
}

const HUMAN_ACCEPT_NOTE = 'Accepté par décision humaine malgré le refus du contrôle automatique';

/** Engaged costs of the video (charged + reserved), for the cap checked before any correction is reserved. */
async function engagedCostUsd(admin: ReturnType<typeof createStorageAdminClient>, versionId: string) {
  const { data: ledger, error } = await admin.from('usage_ledger').select('cost_usd,status').eq('version_id', versionId).in('status', ['charged', 'reserved']);
  if (error) throw new HttpError(503, 'Impossible de vérifier le coût de la vidéo. Aucune modification n’a été lancée.');
  return (ledger ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.cost_usd ?? 0)), 0);
}

/**
 * Human decision on a shot stopped by a verifier (boucle de vérification).
 * - accept: the keyframe is animated, or the clip goes to the montage, flagged for the validator;
 * - retry (keyframe only): one more correction by the director, with its own image and check reserved now;
 * - revise on a refused clip (27/10): « clip » keeps the validated keyframe, the director corrects only the action, the
 *   camera and the speed, then a new clip and its check; « full » makes a new keyframe (director, image, judge) first.
 *   The new clip is an internal cost, never billed to the client; the previous clip stays stored until a decision.
 */
export async function reviewShot(actor: Actor, versionId: string, shotNumber: number, input: ShotReviewInput) {
  const decision = input.decision;
  const admin = createStorageAdminClient();
  const { data: version, error } = await admin.from('video_versions').select('id,video_id,status,brief_json,model:ai_models!inner(price_usd_per_second),video:videos!inner(user_id,department)').eq('id', versionId).maybeSingle();
  const video = Array.isArray(version?.video) ? version.video[0] : version?.video;
  if (error || !version || !video || video.user_id !== actor.id && actor.role !== 'admin') throw new HttpError(404, 'Cette version est introuvable.');
  if (version.status !== 'generating') throw new HttpError(409, 'Cette vidéo n’attend plus de décision.');
  const { data: shot, error: shotError } = await admin.from('video_shots')
    .select('shot_number,duration_seconds,raw_path,keyframe_path,keyframe_status,keyframe_quality,keyframe_retry_count,keyframe_image_ledger_ids,keyframe_quality_ledger_ids,video_quality_status,video_quality,video_quality_retry_count,video_quality_ledger_ids,verification_history')
    .eq('version_id', versionId).eq('shot_number', shotNumber).maybeSingle();
  if (shotError || !shot) throw new HttpError(404, 'Ce plan est introuvable.');
  const now = new Date().toISOString();
  const release = (entryId: unknown) => typeof entryId === 'string' ? settleUsageCost(admin, { entryId, outcome: 'released', actualCostUsd: 0, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA, billable: false }) : Promise.resolve(null);
  const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

  // 27/10 · on the keyframe board, an image accepted by the verifier can be changed too (« Modifier ce plan »).
  const board = storedApproval(version.brief_json && typeof version.brief_json === 'object' ? version.brief_json as Record<string, unknown> : {});
  const onBoard = shot.keyframe_status === 'ready' && board.required && Boolean(board.requestedAt) && !board.approvedAt && !board.expiredAt && !isShotApproved(shot.verification_history);
  if (onBoard && decision !== 'revise') throw new HttpError(409, 'Cette image clé est déjà acceptée : validez-la sur la planche.');
  if (shot.keyframe_status === 'awaiting_review' || onBoard) {
    const currentStatus = String(shot.keyframe_status);
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
    const used = humanRevisionsUsed(shot.verification_history);
    if (used >= HUMAN_REVISIONS_PER_SHOT) throw new HttpError(409, 'Modification utilisée pour cette image clé. Acceptez-la telle quelle ou annulez la vidéo.');
    if (attempt + 1 >= MAX_KEYFRAME_ATTEMPTS) throw new HttpError(409, 'Le nombre maximal de relances est atteint pour ce plan. Acceptez-le ou annulez la vidéo.');
    const brief = version.brief_json && typeof version.brief_json === 'object' ? version.brief_json as Record<string, unknown> : {};
    // The cap is checked before anything is reserved: engaged costs of the video + this correction.
    const engagedUsd = await engagedCostUsd(admin, versionId);
    const cap = revisionCapCheck({ capUsd: env.VIDEO_COST_CAP_USD, mode: env.VIDEO_COST_CAP_MODE, engagedUsd, plannedWorstCaseUsd: storedCostPlan(brief)?.worstCaseUsd ?? null, revisionUsd: relaunchCostUsd(brief) });
    if (!cap.ok) throw new HttpError(422, cap.message);
    const feedback = decision === 'revise' ? cleanUserFeedback(input.feedback) : '';
    const reasons = decision === 'revise' ? input.reasons ?? [] : [];
    const drafts = Array.isArray(brief.storyboard) ? brief.storyboard as Array<{ locationPhotoId?: unknown }> : [];
    const locationPhotoId = typeof drafts[shotNumber - 1]?.locationPhotoId === 'string' ? drafts[shotNumber - 1].locationPhotoId as string : null;
    // The closed list answers at once; the director's own sentences are added when it corrects the shot.
    const feedbackConflicts = decision === 'revise' ? detectFeedbackConflicts(feedback, brief, locationPhotoId).map((conflict) => conflict.message) : [];
    const imageIds = ids(shot.keyframe_image_ledger_ids);
    const qualityIds = ids(shot.keyframe_quality_ledger_ids);
    const revisionReservations: string[] = [];
    // A green image's unused automatic slots were released: always reserve a fresh human correction.
    {
      const reserve = (estimatedCostUsd: number) => reserveKeyframeCost(admin, { userId: video.user_id, versionId, department: video.department ?? '', estimatedCostUsd, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA });
      const [image, quality] = await Promise.all([reserve(storedRenderSettings(version.brief_json && typeof version.brief_json === 'object' ? version.brief_json as Record<string, unknown> : {}).keyframeImageCostUsd), reserve(KEYFRAME_QUALITY_RESERVE_USD)]);
      if (image.error || !image.data || quality.error || !quality.data) {
        await Promise.all([release(image.data), release(quality.data)]);
        throw new HttpError(503, 'Impossible de réserver le coût de la relance. Aucune image n’a été demandée.');
      }
      revisionReservations.push(image.data, quality.data);
      await Promise.all([...imageIds.slice(attempt + 1), ...qualityIds.slice(attempt + 1)].map(release));
      imageIds.splice(attempt + 1, Infinity, image.data);
      qualityIds.splice(attempt + 1, Infinity, quality.data);
    }
    const priorHistory = recordDisagreement(shot.verification_history, { versionId, videoId: version.video_id, shotNumber, stage: 'keyframe', brief, verdict, at: now, attempt, reasons, feedback });
    const history = appendVerification(priorHistory, decision === 'revise'
      ? { stage: 'keyframe', attempt, at: now, approved: verdict.approved, issues: verdict.issues, reason: verdict.reason, decision: 'human_revise', by: 'human', feedback, reasons, scope: 'keyframe', conflicts: feedbackConflicts }
      : { stage: 'keyframe', attempt, at: now, approved: verdict.approved, issues: verdict.issues, reason: verdict.reason, decision: 'human_retry', by: 'human' });
    const { data: updated, error: updateError } = await admin.from('video_shots').update({ keyframe_status: 'revising', ...(onBoard ? { end_keyframe_status: 'skipped', end_keyframe_path: null } : {}), keyframe_image_ledger_ids: imageIds, keyframe_quality_ledger_ids: qualityIds, revision_request_id: null, revision_ledger_id: null, verification_history: history, updated_at: now })
      .eq('version_id', versionId).eq('shot_number', shotNumber).eq('keyframe_status', currentStatus).select('shot_number').maybeSingle();
    if (updateError || !updated) {
      await Promise.all(revisionReservations.map(release));
      if (updateError) throw new HttpError(503, 'Impossible d’enregistrer la relance.');
      throw new HttpError(409, 'Ce plan a déjà reçu une décision.');
    }
    return { shotNumber, decision, status: 'revising' as const, feedbackConflicts, revisionsLeft: HUMAN_REVISIONS_PER_SHOT - used - 1 };
  }

  const clipBoard = storedClipApproval(version.brief_json as Record<string, unknown>);
  const onClipBoard = clipBoard.required && clipBoard.requestedAt && !clipBoard.approvedAt && shot.raw_path && ['passed', 'awaiting_review'].includes(shot.video_quality_status);
  if (shot.video_quality_status === 'awaiting_review' || onClipBoard) {
    const attempt = Number(shot.video_quality_retry_count ?? 0);
    const verdict = storedVerdict(shot.video_quality) ?? { approved: false, issues: [], reason: '' };
    if (decision === 'retry') return redoClip({ admin, version, video, shot, input: { ...input, decision: 'revise' }, attempt, verdict, now, release, ids });
    if (decision === 'revise') return redoClip({ admin, version, video, shot, input, attempt, verdict, now, release, ids });
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

type RedoInput = {
  admin: ReturnType<typeof createStorageAdminClient>;
  version: { id: string; video_id?: string; brief_json: unknown; model: unknown };
  video: { user_id: string; department?: string | null };
  shot: Record<string, unknown>;
  input: ShotReviewInput;
  attempt: number;
  verdict: { approved: boolean; issues: string[]; reason: string };
  now: string;
  release: (entryId: unknown) => Promise<unknown>;
  ids: (value: unknown) => string[];
};

/**
 * « Refaire la vidéo de ce plan » / « Refaire l’image clé puis la vidéo » on a refused clip. Everything is reserved
 * before any call: the clip (internal, price_fcfa 0), its check and, for « full », the keyframe and its check. The shot
 * then goes back through the keyframe step: the director corrects it (refreshKeyframes, state « revising »), and the
 * animation of the validated (or new) keyframe is submitted again.
 */
async function redoClip({ admin, version, video, shot, input, attempt, verdict, now, release, ids }: RedoInput) {
  const scope = input.scope ?? 'clip';
  const versionId = version.id;
  const shotNumber = Number(shot.shot_number);
  const used = humanRevisionsUsed(shot.verification_history, 'video');
  if (used >= HUMAN_CLIP_REVISIONS_PER_SHOT) throw new HttpError(409, 'Modification utilisée pour ce clip. Acceptez-le tel quel ou annulez la vidéo.');
  const keyframeAttempt = Number(shot.keyframe_retry_count ?? 0);
  if (typeof shot.keyframe_path !== 'string' || !shot.keyframe_path) throw new HttpError(409, 'L’image clé de ce plan est introuvable : le clip ne peut pas être refait.');
  if (scope === 'full' && keyframeAttempt + 1 >= MAX_KEYFRAME_ATTEMPTS) throw new HttpError(409, 'Le nombre maximal d’images clés est atteint pour ce plan : choisissez « Refaire la vidéo de ce plan ».');
  const model = (Array.isArray(version.model) ? version.model[0] : version.model) as { price_usd_per_second?: unknown } | null;
  const priceUsdPerSecond = Number(model?.price_usd_per_second ?? 0);
  const durationS = Number(shot.duration_seconds ?? 0);
  if (!(priceUsdPerSecond > 0) || !(durationS > 0)) throw new HttpError(503, 'Le tarif du moteur vidéo est introuvable. Aucune modification n’a été lancée.');
  const brief = version.brief_json && typeof version.brief_json === 'object' ? version.brief_json as Record<string, unknown> : {};
  const cap = revisionCapCheck({ capUsd: env.VIDEO_COST_CAP_USD, mode: env.VIDEO_COST_CAP_MODE, engagedUsd: await engagedCostUsd(admin, versionId), plannedWorstCaseUsd: storedCostPlan(brief)?.worstCaseUsd ?? null, revisionUsd: clipRedoCostUsd({ brief, priceUsdPerSecond, durationS, scope }) });
  if (!cap.ok) throw new HttpError(422, cap.message);
  const feedback = cleanUserFeedback(input.feedback);
  const reasons = input.reasons ?? [];
  const drafts = Array.isArray(brief.storyboard) ? brief.storyboard as Array<{ locationPhotoId?: unknown }> : [];
  const locationPhotoId = typeof drafts[shotNumber - 1]?.locationPhotoId === 'string' ? drafts[shotNumber - 1].locationPhotoId as string : null;
  const feedbackConflicts = detectFeedbackConflicts(feedback, brief, locationPhotoId).map((conflict) => conflict.message);

  // Reservations first: clip (internal), its check (slot 1, the last clip check), keyframe and its check for « full ».
  const reserved: string[] = [];
  const fail = async (): Promise<never> => {
    await Promise.all(reserved.map(release));
    throw new HttpError(503, 'Impossible de réserver le coût de la reprise. Aucune vidéo n’a été demandée.');
  };
  const clip = await reserveInternalClipCost(admin, { userId: video.user_id, versionId, department: video.department ?? '', seconds: durationS, priceUsdPerSecond, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA });
  if (clip.error || !clip.data) return fail();
  reserved.push(clip.data);
  const qualityIds = ids(shot.video_quality_ledger_ids);
  const reserveCheck = () => reserveKeyframeCost(admin, { userId: video.user_id, versionId, department: video.department ?? '', estimatedCostUsd: KEYFRAME_QUALITY_RESERVE_USD, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA });
  // A clip still on its first attempt has kept its unused retry check: it becomes the check of the new clip.
  { // Always reserve a fresh check: the previous retry slot may have been released on acceptance.
    const check = await reserveCheck();
    if (check.error || !check.data) return fail();
    reserved.push(check.data);
    qualityIds[MAX_CLIP_RETRIES] = check.data;
  }
  const imageIds = ids(shot.keyframe_image_ledger_ids);
  const keyframeQualityIds = ids(shot.keyframe_quality_ledger_ids);
  if (scope === 'full') {
    const [image, check] = await Promise.all([
      reserveKeyframeCost(admin, { userId: video.user_id, versionId, department: video.department ?? '', estimatedCostUsd: storedRenderSettings(brief).keyframeImageCostUsd, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA }),
      reserveCheck(),
    ]);
    if (image.data) reserved.push(image.data);
    if (check.data) reserved.push(check.data);
    if (image.error || !image.data || check.error || !check.data) return fail();
    // The next keyframe uses slot attempt + 1 (unused automatic slots were released when the keyframe was accepted).
    imageIds.splice(keyframeAttempt + 1, Infinity, image.data);
    keyframeQualityIds.splice(keyframeAttempt + 1, Infinity, check.data);
  }
  const priorHistory = recordDisagreement(shot.verification_history, { versionId, videoId: version.video_id, shotNumber, stage: 'video', brief, verdict, at: now, attempt, reasons, feedback });
  const history = appendVerification(priorHistory, { stage: 'video', attempt, at: now, approved: verdict.approved, issues: verdict.issues, reason: verdict.reason, decision: 'human_revise', by: 'human', feedback, reasons, scope, conflicts: feedbackConflicts, clipLedgerId: clip.data });
  // The clip already made stays stored (video_quality_previous_path) and its cost stays on the video, as before.
  const patch = {
    // Both scopes reuse the existing keyframe path through the director step; only "full" reserves and generates a replacement.
    keyframe_status: 'revising', end_keyframe_status: 'skipped', end_keyframe_path: null,
    keyframe_image_ledger_ids: imageIds, keyframe_quality_ledger_ids: keyframeQualityIds, video_quality_ledger_ids: qualityIds,
    revision_request_id: null, revision_ledger_id: null, verification_history: history,
    status: 'queued', video_quality_status: 'queued', video_quality_retry_count: MAX_CLIP_RETRIES, video_quality_request_id: null,
    video_quality_previous_path: typeof shot.raw_path === 'string' ? shot.raw_path : null,
    animation_submit_state: 'queued', provider_request_id: null, provider_poll_failure_count: 0, provider_next_poll_at: null, provider_last_poll_error: null, error_message: null, updated_at: now,
  };
  const onBoard = storedClipApproval(brief).required && Boolean(storedClipApproval(brief).requestedAt);
  const result = onBoard
    ? await admin.rpc('rimco_clip_review', { p_version_id: versionId, p_action: 'revise', p_shot: shotNumber, p_expected_history: shot.verification_history, p_patch: patch })
    : await admin.from('video_shots').update(patch).eq('version_id', versionId).eq('shot_number', shotNumber).eq('video_quality_status', 'awaiting_review').select('shot_number').maybeSingle();
  const updated = onBoard ? result.data?.changed : result.data;
  const updateError = result.error;
  if (updateError || !updated) {
    await Promise.all(reserved.map(release));
    if (updateError) throw new HttpError(503, 'Impossible d’enregistrer la reprise.');
    throw new HttpError(409, 'Ce plan a déjà reçu une décision.');
  }
  return { shotNumber, decision: 'revise' as const, scope, status: 'revising' as const, feedbackConflicts, revisionsLeft: HUMAN_CLIP_REVISIONS_PER_SHOT - used - 1 };
}
