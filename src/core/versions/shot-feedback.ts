import { detectBriefConflicts, mergeBriefConflicts } from '@/core/brief/conflicts';
import { storedMotionMatrix } from '@/core/motion/place-motion';
import type { VerificationEntry } from '@/core/verification/loop';

/**
 * « Modifier ce plan » (27/10): what the user's comment asked that the locked rules forbid, from the closed list of
 * the brief conflicts (no AI). The place of the shot gives its time of day (night asked on a daytime place…).
 */
export function detectFeedbackConflicts(feedback: string, brief: Record<string, unknown>, locationPhotoId?: string | null): Array<{ id: string; message: string }> {
  if (!feedback.trim()) return [];
  const matrix = storedMotionMatrix(brief);
  const time = locationPhotoId ? matrix?.places?.[locationPhotoId]?.timeOfDay ?? null : null;
  // The vehicle photos are not known here: an « habitacle » request is left to the director.
  return detectBriefConflicts(feedback, { placeTimes: time ? [time] : [], hasInteriorPhoto: true });
}

/** The director's sentences completed by the closed list, at most 5. */
export function feedbackConflictMessages(director: string[], feedback: string, brief: Record<string, unknown>, locationPhotoId?: string | null): string[] {
  return mergeBriefConflicts(director, detectFeedbackConflicts(feedback, brief, locationPhotoId));
}

/** The conflicts written on the human correction waiting in the history (its last entry). */
export function withFeedbackConflicts(history: unknown, conflicts: string[]): VerificationEntry[] {
  const entries = Array.isArray(history) ? [...history as VerificationEntry[]] : [];
  const last = entries.at(-1);
  if (!last || last.by !== 'human' || last.decision !== 'human_revise') return entries;
  entries[entries.length - 1] = { ...last, conflicts };
  return entries;
}

/** The last human correction of a shot, for the screen: its comment, reasons and the rules that adapted it. */
export function lastHumanRevision(history: unknown): { feedback: string; reasons: string[]; conflicts: string[] } | null {
  const entries = Array.isArray(history) ? history as VerificationEntry[] : [];
  const entry = [...entries].reverse().find((item) => item.by === 'human' && item.decision === 'human_revise');
  return entry ? { feedback: entry.feedback ?? '', reasons: entry.reasons ?? [], conflicts: entry.conflicts ?? [] } : null;
}
