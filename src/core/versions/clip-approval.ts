import type { VerificationEntry } from '@/core/verification/loop';

export type ClipApprovalState = { required: boolean; requestedAt?: string; approvedAt?: string; remindedAt?: string; releasedAt?: string; waitSeconds?: number; modifiedShots?: number; disabledShots?: number };
export function storedClipApproval(brief: Record<string, unknown>): ClipApprovalState {
  const value = brief.clipApproval;
  return value && typeof value === 'object' ? { ...value as ClipApprovalState, required: (value as ClipApprovalState).required === true } : { required: false };
}
export function isClipApproved(history: unknown): boolean {
  const entries = Array.isArray(history) ? history as VerificationEntry[] : [];
  const last = [...entries].reverse().find((entry) => entry.stage === 'video' && !['human_disable', 'human_disagree'].includes(entry.decision));
  return Boolean(last?.by === 'human' && ['human_approve', 'human_accept'].includes(last.decision));
}
export function isClipActive(history: unknown): boolean {
  const entries = Array.isArray(history) ? history as Array<{ stage?: string; decision?: string; disabled?: boolean }> : [];
  return [...entries].reverse().find((entry) => entry.stage === 'video' && entry.decision === 'human_disable')?.disabled !== true;
}
export type MontageShot = { shot_number: number; duration_seconds: number; status: string; raw_path: string | null; verification_history?: unknown };
/** Used by both the board and the encoder: ordered active clips, with the human gate enforced server-side. */
export function montageShots<T extends MontageShot>(shots: T[], required: boolean): T[] {
  const active = [...shots].filter((shot) => isClipActive(shot.verification_history)).sort((a, b) => a.shot_number - b.shot_number);
  if (!active.length) throw new Error('Gardez au moins un clip actif.');
  if (active.some((shot) => shot.status !== 'ready' || !shot.raw_path || required && !isClipApproved(shot.verification_history))) throw new Error('Validez tous les clips actifs avant le montage.');
  return active;
}

export function clipBoardMeasures(shots: Array<{ verification_history?: unknown }>) {
  return {
    modifiedShots: shots.filter((shot) => (Array.isArray(shot.verification_history) ? shot.verification_history as VerificationEntry[] : []).some((entry) => entry.stage === 'video' && entry.by === 'human' && entry.decision === 'human_revise')).length,
    disabledShots: shots.filter((shot) => !isClipActive(shot.verification_history)).length,
  };
}
