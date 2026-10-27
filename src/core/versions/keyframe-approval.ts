import type { VerificationEntry } from '@/core/verification/loop';

/**
 * Validation of the keyframes before the paid animation (27/10, architecture step 5: two cheap human validations
 * before the expensive step). The animation of a video waits until every shot is validated; then all shots are
 * submitted at once (the existing submission claim keeps it single, even with two tabs).
 */
export const KEYFRAME_APPROVAL_MODES = ['off', 'optional', 'premium_default', 'always'] as const;
export type KeyframeApprovalMode = typeof KEYFRAME_APPROVAL_MODES[number];
/** Default and RIMCO setting during the beta (decision of 27/10): validation on every tier. */
export const DEFAULT_KEYFRAME_APPROVAL_MODE: KeyframeApprovalMode = 'always';

export const KEYFRAME_APPROVAL_MODE_LABELS: Record<KeyframeApprovalMode, string> = {
  off: 'Désactivée : l’animation part dès que les images clés sont prêtes',
  optional: 'Proposée : case décochée par défaut dans le Studio',
  premium_default: 'Proposée : case cochée par défaut en Premium',
  always: 'Obligatoire pour toutes les vidéos',
};

/** Reminder after 24 h, expiry after 48 h without validation (decision of 27/10). */
export const APPROVAL_REMINDER_HOURS = 24;
export const APPROVAL_EXPIRY_HOURS = 48;

export function normalizeApprovalMode(value: unknown): KeyframeApprovalMode {
  return (KEYFRAME_APPROVAL_MODES as readonly string[]).includes(String(value)) ? value as KeyframeApprovalMode : DEFAULT_KEYFRAME_APPROVAL_MODE;
}

/** What the Studio box shows for a mode and a tier: hidden, ticked or not, editable or not. */
export function approvalBoxState(mode: KeyframeApprovalMode, tier: string): { visible: boolean; checked: boolean; locked: boolean } {
  if (mode === 'off') return { visible: false, checked: false, locked: true };
  if (mode === 'always') return { visible: true, checked: true, locked: true };
  return { visible: true, checked: mode === 'premium_default' && tier === 'premium', locked: false };
}

/** The server has the last word: the brand setting wins over the box when it forces a value. */
export function resolveKeyframeApproval(mode: KeyframeApprovalMode, requested: boolean | undefined, tier: string): boolean {
  if (mode === 'always') return true;
  if (mode === 'off') return false;
  return requested ?? approvalBoxState(mode, tier).checked;
}

/** A shot is validated when its last keyframe entry is a human validation (or a human acceptance of a refused image). */
export function isShotApproved(history: unknown): boolean {
  const entries = Array.isArray(history) ? history as VerificationEntry[] : [];
  const last = [...entries].reverse().find((entry) => entry.stage === 'keyframe');
  return Boolean(last && last.by === 'human' && (last.decision === 'human_approve' || last.decision === 'human_accept'));
}

/** Shots changed by the user on the board, since the board was shown. */
export function shotsModifiedOnBoard(shots: Array<{ verification_history?: unknown }>, requestedAt: string): number {
  const since = Date.parse(requestedAt);
  return shots.filter((shot) => (Array.isArray(shot.verification_history) ? shot.verification_history as VerificationEntry[] : [])
    .some((entry) => entry.by === 'human' && entry.decision === 'human_revise' && Date.parse(entry.at) >= since)).length;
}

/** Stored in brief_json.keyframeApproval: the choice frozen at launch and the measures asked to decide on data. */
export type KeyframeApprovalState = {
  required: boolean;
  requestedAt?: string;
  approvedAt?: string;
  remindedAt?: string;
  expiredAt?: string;
  /** Measures: seconds between the board and the launch, shots modified on the board. */
  waitSeconds?: number;
  modifiedShots?: number;
};

export function storedApproval(brief: Record<string, unknown>): KeyframeApprovalState {
  const value = brief.keyframeApproval && typeof brief.keyframeApproval === 'object' ? brief.keyframeApproval as Record<string, unknown> : {};
  const text = (key: string) => typeof value[key] === 'string' ? value[key] as string : undefined;
  const number = (key: string) => typeof value[key] === 'number' ? value[key] as number : undefined;
  return { required: value.required === true, requestedAt: text('requestedAt'), approvedAt: text('approvedAt'), remindedAt: text('remindedAt'), expiredAt: text('expiredAt'), waitSeconds: number('waitSeconds'), modifiedShots: number('modifiedShots') };
}

/** What the board deadline means now: nothing, a reminder to send, or the expiry. */
export function approvalDeadline(requestedAt: string, now: number): { remindAt: number; expiresAt: number; due: 'none' | 'remind' | 'expire' } {
  const start = Date.parse(requestedAt);
  const remindAt = start + APPROVAL_REMINDER_HOURS * 3_600_000;
  const expiresAt = start + APPROVAL_EXPIRY_HOURS * 3_600_000;
  return { remindAt, expiresAt, due: now >= expiresAt ? 'expire' : now >= remindAt ? 'remind' : 'none' };
}

const SHOT_TYPE_FR: Record<string, string> = { establishing: 'Plan d’ensemble', rolling: 'Voiture qui roule', hero: 'Plan héros', detail: 'Détail' };
const DIRECTION_FR: Record<string, string> = { left_to_right: 'de gauche à droite', right_to_left: 'de droite à gauche', towards_camera: 'vers la caméra', away_from_camera: 'en s’éloignant', static: 'à l’arrêt' };
const SPEED_FR: Record<string, string> = { slow: 'lentement', cruise: 'à vitesse normale', dynamic: 'à vitesse soutenue' };

/** The action of a shot in French, from its closed fields (the director's own text is English, for the models). */
export function shotActionFr(shot: { shotType?: unknown; travelDirection?: unknown; travelSpeed?: unknown; durationSeconds?: unknown }): string {
  const type = SHOT_TYPE_FR[String(shot.shotType)] ?? 'Plan';
  const moving = shot.travelDirection && shot.travelDirection !== 'static';
  const direction = DIRECTION_FR[String(shot.travelDirection)];
  const speed = moving ? SPEED_FR[String(shot.travelSpeed)] : undefined;
  const duration = Number(shot.durationSeconds);
  return [type, direction, speed, Number.isFinite(duration) && duration > 0 ? `${duration} s` : null].filter(Boolean).join(' · ');
}
