import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Actor } from '@/core/auth/guards';
import { isFalRequestId } from '@/core/providers/fal-webhook';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { refreshLiveVersion } from '@/core/versions/live';
import { env } from '@/env';

// The follow-up started after the answer (download, checks, montage) gets the same time budget as /refresh.
export const maxDuration = 60;

/** Only the request id is read: the body is never trusted (status, URLs and costs are read again from fal). */
const schema = z.object({ request_id: z.string().min(1) }).passthrough();

/** Columns of video_shots that hold a fal request id, one per step of a shot. */
const SHOT_REQUEST_COLUMNS = ['provider_request_id', 'keyframe_request_id', 'keyframe_quality_request_id', 'end_keyframe_request_id', 'end_keyframe_quality_request_id', 'video_quality_request_id', 'revision_request_id'] as const;

const systemActor: Actor = { id: 'fal-webhook', role: 'operateur', department: '', brandId: null };

/**
 * 28/10 · webhook fal (src/core/providers/fal-webhook.ts). A finished fal task wakes up the follow-up of its video
 * at once. Idempotent by construction: the follow-up claims the version (same lock as the tabs and the cron) and
 * re-reads every state from fal, so a repeated, late or forged callback changes nothing.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!env.FAL_WEBHOOK_SECRET || url.searchParams.get('token') !== env.FAL_WEBHOOK_SECRET) return NextResponse.json({ error: 'Accès refusé.' }, { status: 401 });
  if (env.PROVIDERS_MODE !== 'live') return NextResponse.json({ received: true, ignored: true });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isFalRequestId(parsed.data.request_id)) return NextResponse.json({ error: 'Notification fal invalide.' }, { status: 400 });
  const requestId = parsed.data.request_id;
  const admin = createStorageAdminClient();
  const [{ data: shots }, { data: versions }] = await Promise.all([
    admin.from('video_shots').select('version_id').or(SHOT_REQUEST_COLUMNS.map((column) => `${column}.eq.${requestId}`).join(',')).limit(1),
    admin.from('video_versions').select('id').eq('provider_request_id', requestId).in('status', ['queued', 'generating', 'postprocessing']).limit(1),
  ]);
  const versionId = shots?.[0]?.version_id ?? versions?.[0]?.id;
  // Unknown task (another environment, an old video): answered 200 so fal does not retry.
  if (!versionId) return NextResponse.json({ received: true, matched: false });
  after(() => refreshLiveVersion(String(versionId), systemActor).then(() => undefined, (cause) => console.warn('fal_webhook_refresh_failed', JSON.stringify({ versionId, message: cause instanceof Error ? cause.message : String(cause) }))));
  return NextResponse.json({ received: true, matched: true });
}
