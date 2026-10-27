import type { SupabaseClient } from '@supabase/supabase-js';
import { notify } from '@/core/notifications/notify';
import type { StoryboardShot } from '@/core/storyboard';
import { humanRevisionLimit, humanRevisionsUsed, MAX_KEYFRAME_ATTEMPTS } from '@/core/verification/loop';
import { approvalDeadline, isShotApproved, shotActionFr, shotsModifiedOnBoard, storedApproval, type KeyframeApprovalState } from './keyframe-approval';
import { lastHumanRevision } from './shot-feedback';
import { storedClipApproval } from './clip-approval';

/**
 * 27/10 · validation of the keyframes before the paid animation. Called by storyboard-live when every keyframe is
 * ready (and, while the board is open, when one shot is being corrected or waits for a decision).
 */
export type GateShot = {
  shot_number: number;
  title?: string | null;
  keyframe_status?: string | null;
  keyframe_retry_count?: number | null;
  verification_history?: unknown;
};

export type KeyframeBoard = {
  requestedAt: string;
  remindAt: string;
  expiresAt: string;
  remindedAt?: string;
  expiredAt?: string;
  shots: Array<{
    shotNumber: number;
    title: string;
    /** French, from the closed fields of the shot (the director's text is English, for the models). */
    action: string;
    url: string | null;
    state: 'to_approve' | 'approved' | 'correcting' | 'decision';
    canRevise: boolean;
    revisionsLeft: number;
    lastRevision: { feedback: string; reasons: string[]; conflicts: string[] } | null;
  }>;
};

export const EXPIRED_MESSAGE = 'Images clés non validées sous 48 h : la vidéo a expiré. Rien ne vous est facturé ; les images clés sont conservées. Relancez avec les mêmes réglages depuis le Studio.';

type GateInput = {
  admin: SupabaseClient;
  version: { id: string; video_id: string };
  video: { user_id: string };
  /** Mutated in place: later writes of the same refresh keep the approval state. */
  brief: Record<string, unknown>;
  shots: GateShot[];
  keyframes: Array<{ number: number; url: string }>;
  draftFor: (shot: GateShot) => StoryboardShot | undefined;
  now?: number;
};

export function approvalBoard(input: Pick<GateInput, 'shots' | 'keyframes' | 'draftFor'> & { brief?: Record<string, unknown> }, state: KeyframeApprovalState): KeyframeBoard | null {
  if (!state.requestedAt) return null;
  const deadline = approvalDeadline(state.requestedAt, Date.parse(state.requestedAt));
  return {
    requestedAt: state.requestedAt,
    remindAt: new Date(deadline.remindAt).toISOString(),
    expiresAt: new Date(deadline.expiresAt).toISOString(),
    ...(state.remindedAt ? { remindedAt: state.remindedAt } : {}),
    ...(state.expiredAt ? { expiredAt: state.expiredAt } : {}),
    shots: [...input.shots].filter((shot) => !state.shotNumbers?.length || state.shotNumbers.includes(shot.shot_number)).sort((left, right) => left.shot_number - right.shot_number).map((shot) => {
      const used = humanRevisionsUsed(shot.verification_history);
      const approved = isShotApproved(shot.verification_history);
      const ready = shot.keyframe_status === 'ready';
      const draft = input.draftFor(shot);
      return {
        shotNumber: shot.shot_number,
        title: shot.title ?? draft?.title ?? `Plan ${shot.shot_number}`,
        action: draft ? shotActionFr(draft) : '',
        url: input.keyframes.find((keyframe) => keyframe.number === shot.shot_number)?.url ?? null,
        state: approved ? 'approved' : ready ? 'to_approve' : shot.keyframe_status === 'awaiting_review' ? 'decision' : 'correcting',
        canRevise: ready && !approved && used < humanRevisionLimit(input.brief, 'keyframe') && Number(shot.keyframe_retry_count ?? 0) + 1 < MAX_KEYFRAME_ATTEMPTS,
        revisionsLeft: Math.max(0, humanRevisionLimit(input.brief, 'keyframe') - used),
        lastRevision: lastHumanRevision(shot.verification_history),
      };
    }),
  };
}

async function saveApproval(input: GateInput, next: KeyframeApprovalState, metricsPatch: Record<string, string>) {
  const metrics = input.brief.processingMetrics && typeof input.brief.processingMetrics === 'object' ? input.brief.processingMetrics as Record<string, unknown> : {};
  Object.assign(input.brief, { keyframeApproval: next, processingMetrics: { ...metrics, ...metricsPatch } });
  await input.admin.from('video_versions').update({ brief_json: input.brief }).eq('id', input.version.id);
}

async function videoTitle(input: GateInput) {
  const { data } = await input.admin.from('videos').select('title').eq('id', input.version.video_id).maybeSingle();
  return typeof data?.title === 'string' && data.title ? `« ${data.title} » · ` : '';
}

/**
 * Reminder after 24 h, expiry after 48 h. The expiry releases every reservation still open (nothing billed) and keeps
 * the keyframes; the version is cancelled with a clear message. Returns the result to send, or null.
 */
export async function enforceApprovalDeadline(input: GateInput) {
  const state = storedApproval(input.brief);
  if (!state.required || !state.requestedAt || state.approvedAt || state.expiredAt) return null;
  const now = input.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const deadline = approvalDeadline(state.requestedAt, now);
  // Returning from the clip board: the earlier clips are paid. This image may wait without cancelling the film.
  if (storedClipApproval(input.brief).requestedAt) {
    if (deadline.due !== 'none' && !state.remindedAt) {
      await saveApproval(input, { ...state, remindedAt: nowIso }, {});
      await notify(input.admin, { userId: input.video.user_id, versionId: input.version.id, type: 'action_required', message: `${await videoTitle(input)}L’image clé corrigée attend votre validation. Les clips déjà payés sont conservés ; la vidéo n’expire pas.`, dedupeKey: `keyframe_return_reminder:${state.requestedAt}` });
    }
    return null;
  }
  if (deadline.due === 'expire') {
    await input.admin.from('usage_ledger').update({ status: 'released' }).eq('version_id', input.version.id).eq('status', 'reserved');
    // 27/10: an expired (cancelled) video is never billed to the client.
    await input.admin.from('usage_ledger').update({ price_fcfa: 0, applied_fcfa_per_second: 0 }).eq('version_id', input.version.id).eq('kind', 'generation');
    await Promise.all([
      input.admin.from('video_versions').update({ status: 'cancelled', error_message: EXPIRED_MESSAGE, updated_at: nowIso }).eq('id', input.version.id).eq('status', 'generating'),
      input.admin.from('videos').update({ status: 'cancelled', updated_at: nowIso }).eq('id', input.version.video_id),
    ]);
    const next = { ...state, expiredAt: nowIso };
    await saveApproval(input, next, {});
    await notify(input.admin, { userId: input.video.user_id, versionId: input.version.id, type: 'expired', message: `${await videoTitle(input)}${EXPIRED_MESSAGE}`, dedupeKey: `expired:${state.requestedAt}` });
    await input.admin.from('notifications').update({ read_at: nowIso }).eq('version_id', input.version.id).eq('type', 'action_required').is('read_at', null);
    return { id: input.version.id, status: 'cancelled' as const, error: EXPIRED_MESSAGE, keyframeApproval: approvalBoard(input, next) };
  }
  if (deadline.due === 'remind' && !state.remindedAt) {
    const next = { ...state, remindedAt: nowIso };
    await saveApproval(input, next, {});
    const at = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Abidjan' }).format(new Date(deadline.expiresAt));
    await notify(input.admin, { userId: input.video.user_id, versionId: input.version.id, type: 'action_required', message: `${await videoTitle(input)}Rappel : validez les images clés avant le ${at}, sinon la vidéo expirera (rien ne sera facturé).`, dedupeKey: `keyframe_approval_reminder:${state.requestedAt}` });
  }
  return null;
}

/**
 * Every keyframe is ready. Returns null when the animation may start (validation not asked, or every shot
 * validated); otherwise the board to show, and the animation waits.
 */
export async function keyframeApprovalGate(input: GateInput) {
  let state = storedApproval(input.brief);
  if (!state.required || state.approvedAt || state.expiredAt) return null;
  const now = input.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  if (!state.requestedAt) {
    state = { ...state, requestedAt: nowIso };
    await saveApproval(input, state, { keyframeApprovalRequestedAt: nowIso });
    await notify(input.admin, { userId: input.video.user_id, versionId: input.version.id, type: 'action_required', message: `${await videoTitle(input)}${input.shots.length} image${input.shots.length > 1 ? 's' : ''} clé${input.shots.length > 1 ? 's' : ''} à valider avant la vidéo : l’animation attend votre validation.`, dedupeKey: `keyframe_approval:${nowIso}` });
  }
  if (input.shots.every((shot) => isShotApproved(shot.verification_history))) {
    const waitSeconds = Math.max(0, Math.round((now - Date.parse(state.requestedAt!)) / 1000));
    await saveApproval(input, { ...state, approvedAt: nowIso, waitSeconds, modifiedShots: shotsModifiedOnBoard(input.shots, state.requestedAt!) }, { keyframeApprovalApprovedAt: nowIso });
    await input.admin.from('notifications').update({ read_at: nowIso }).eq('version_id', input.version.id).eq('type', 'action_required').is('read_at', null);
    return null;
  }
  const expired = await enforceApprovalDeadline({ ...input, now });
  if (expired) return expired;
  const board = approvalBoard(input, storedApproval(input.brief));
  return {
    id: input.version.id, status: 'generating' as const, processingStage: 'keyframe_approval' as const,
    keyframes: input.keyframes, completedKeyframes: input.shots.length, totalKeyframes: input.shots.length,
    keyframeApproval: board, nextPollInSeconds: 60,
  };
}
