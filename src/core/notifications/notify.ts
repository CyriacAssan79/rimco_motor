import type { SupabaseClient } from '@supabase/supabase-js';
import type { VerificationEntry } from '@/core/verification/loop';

/**
 * In-app notifications (bell, banner, tab title, browser notifications). One row per event: `dedupe_key`
 * makes every write idempotent, so a refresh that sees the same state again never creates a duplicate.
 */
export type NotificationType = 'ready' | 'failed' | 'cancelled' | 'action_required' | 'review_requested' | 'approved' | 'rejected';
export type NotificationInput = { userId: string; versionId: string | null; type: NotificationType; message: string; dedupeKey?: string };

export async function notify(admin: SupabaseClient, input: NotificationInput | NotificationInput[]) {
  const items = Array.isArray(input) ? input : [input];
  if (!items.length) return;
  const rows = items.map((item) => ({ user_id: item.userId, version_id: item.versionId, type: item.type, message: item.message.slice(0, 500), dedupe_key: item.dedupeKey ?? item.type }));
  const { error } = await admin.from('notifications').upsert(rows, { onConflict: 'user_id,version_id,dedupe_key', ignoreDuplicates: true });
  // Never blocks the follow-up of a video: a missing notification is logged, the video goes on.
  if (error) console.error('Notification non enregistrée:', error.message);
}

export type AwaitingShot = {
  shot_number: number;
  keyframe_status?: string | null;
  video_quality_status?: string | null;
  verification_history?: unknown;
};

function lastReviewAt(shot: AwaitingShot, stage: 'keyframe' | 'video') {
  const history = Array.isArray(shot.verification_history) ? shot.verification_history as VerificationEntry[] : [];
  return [...history].reverse().find((entry) => entry.stage === stage && entry.by === 'verifier' && entry.decision === 'review')?.at ?? 'sans-date';
}

/**
 * One « action requise » per shot and per refusal: the key holds the shot, the stage and the time of the
 * verifier's refusal, so the same shot refused again later, or another shot, notifies again.
 */
export function actionRequiredNotifications(input: { userId: string; versionId: string; title?: string | null; shots: AwaitingShot[] }): NotificationInput[] {
  const items: NotificationInput[] = [];
  for (const shot of input.shots) {
    for (const stage of ['keyframe', 'video'] as const) {
      const awaiting = stage === 'keyframe' ? shot.keyframe_status === 'awaiting_review' : shot.video_quality_status === 'awaiting_review';
      if (!awaiting) continue;
      const what = stage === 'keyframe' ? 'l’image clé a été refusée' : 'le clip a été refusé';
      items.push({
        userId: input.userId, versionId: input.versionId, type: 'action_required',
        message: `${input.title ? `« ${input.title} » · ` : ''}Plan ${shot.shot_number} · décision requise : ${what} par le contrôle automatique.`,
        dedupeKey: `action_required:${shot.shot_number}:${stage}:${lastReviewAt(shot, stage)}`,
      });
    }
  }
  return items;
}

export function outcomeNotification(input: { userId: string; versionId: string; title?: string | null; status: 'ready' | 'failed'; error?: string | null }): NotificationInput {
  const name = input.title ? `« ${input.title} »` : '';
  return input.status === 'ready'
    ? { userId: input.userId, versionId: input.versionId, type: 'ready', message: `Votre vidéo ${name} est prête.`.replace('  ', ' ') }
    : { userId: input.userId, versionId: input.versionId, type: 'failed', message: `Votre vidéo ${name} a échoué${input.error ? ` : ${input.error}` : '.'}`.replace('  ', ' ') };
}
