import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReviewRequest } from '@/core/verification/loop';
import { actionRequiredNotifications, notify, outcomeNotification, type AwaitingShot } from './notify';

/**
 * Notifications after a refresh of a storyboard version: video ready, final failure, and one « action requise »
 * per shot stopped by a verifier. Idempotent: the same state seen again (another tab, the daily cron) adds nothing.
 */
export async function notifyStoryboardState(admin: SupabaseClient, versionId: string, result: { status: string; error?: string | null; reviewRequired?: ReviewRequest[] }) {
  const awaiting = Boolean(result.reviewRequired?.length);
  if (!awaiting && result.status !== 'ready' && result.status !== 'failed') return;
  const { data: version } = await admin.from('video_versions').select('video:videos!inner(user_id,title)').eq('id', versionId).maybeSingle();
  const video = Array.isArray(version?.video) ? version.video[0] : version?.video;
  if (!video?.user_id) return;
  const title = typeof video.title === 'string' ? video.title : null;
  if (result.status === 'ready' || result.status === 'failed') {
    await notify(admin, outcomeNotification({ userId: video.user_id, versionId, title, status: result.status, error: result.error }));
    // Nothing is left to decide on a finished video.
    await admin.from('notifications').update({ read_at: new Date().toISOString() }).eq('version_id', versionId).eq('type', 'action_required').is('read_at', null);
    return;
  }
  const { data: shots } = await admin.from('video_shots').select('shot_number,keyframe_status,video_quality_status,verification_history').eq('version_id', versionId)
    .or('keyframe_status.eq.awaiting_review,video_quality_status.eq.awaiting_review');
  await notify(admin, actionRequiredNotifications({ userId: video.user_id, versionId, title, shots: (shots ?? []) as AwaitingShot[] }));
}
