import { isShotApproved, type KeyframeApprovalState } from './keyframe-approval';

/**
 * 28/10 · « chaque plan à son rythme ». Before, no clip was submitted until every keyframe of the video was ready
 * (and validated): the slowest shot, or one keyframe retry, held the whole film. Now each shot leaves for its
 * animation as soon as its own keyframe is ready (and validated by the user when the validation is asked). The
 * montage still waits for every clip. Pure functions, used by storyboard-live and tested on their own.
 */
export type PipelineShot = {
  keyframe_status?: string | null;
  end_keyframe_status?: string | null;
  animation_submit_state?: string | null;
  provider_request_id?: string | null;
  verification_history?: unknown;
};

const END_FRAME_PENDING = ['queued', 'generating', 'checking'];
const KEYFRAME_PENDING = ['queued', 'generating', 'checking', 'revising'];

/** The keyframe of this shot is final: ready, and its optional end frame is ready or dropped. */
export function keyframeSettled(shot: PipelineShot): boolean {
  return shot.keyframe_status === 'ready' && !END_FRAME_PENDING.includes(String(shot.end_keyframe_status ?? 'skipped'));
}

/** Still being made, checked or corrected (a human decision is not « in progress »). */
export function keyframeInProgress(shot: PipelineShot): boolean {
  return KEYFRAME_PENDING.includes(String(shot.keyframe_status)) || shot.keyframe_status === 'ready' && !keyframeSettled(shot);
}

/** At least one clip has been sent to fal (or is being sent): its cost is engaged. */
export function animationStarted(shots: PipelineShot[]): boolean {
  return shots.some((shot) => typeof shot.provider_request_id === 'string' && shot.provider_request_id.length > 0
    || ['submitting', 'submitted', 'reconciliation'].includes(String(shot.animation_submit_state)));
}

/**
 * The shot may leave for its animation: keyframe final, and validated by the user when the validation was asked
 * (the board validated as a whole, `approvedAt`, counts for every shot).
 */
export function readyForAnimation(shot: PipelineShot, approval: Pick<KeyframeApprovalState, 'required' | 'approvedAt' | 'expiredAt'>): boolean {
  if (!keyframeSettled(shot) || approval.expiredAt) return false;
  return !approval.required || Boolean(approval.approvedAt) || isShotApproved(shot.verification_history);
}

/** The keyframe side of a refresh, shown while the first clips are already being made. */
export type KeyframeOverlay = {
  keyframes: unknown[];
  completedKeyframes: number;
  totalKeyframes: number;
  reviewRequired: unknown[];
  keyframeApproval?: unknown;
  nextPollInSeconds?: number;
};

/**
 * Adds the keyframe side to the clip-side result of the same refresh (only while the video is still generating):
 * the user keeps seeing the board and the keyframes to decide on, and the next follow-up comes at the earliest
 * of the two hints.
 */
export function mergeKeyframeOverlay<T>(result: T, overlay: KeyframeOverlay | null): T {
  if (!overlay || !result || typeof result !== 'object') return result;
  const record = result as Record<string, unknown>;
  if (record.status !== 'generating') return result;
  const clipReviews = Array.isArray(record.reviewRequired) ? record.reviewRequired : [];
  const polls = [overlay.nextPollInSeconds, record.nextPollInSeconds].filter((value): value is number => typeof value === 'number' && value > 0);
  return {
    ...record,
    keyframes: overlay.keyframes,
    completedKeyframes: overlay.completedKeyframes,
    totalKeyframes: overlay.totalKeyframes,
    reviewRequired: [...overlay.reviewRequired, ...clipReviews],
    ...(overlay.keyframeApproval ? { keyframeApproval: overlay.keyframeApproval } : {}),
    ...(polls.length ? { nextPollInSeconds: Math.min(...polls) } : {}),
  } as T;
}
