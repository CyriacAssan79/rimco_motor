import { hasAdminRights } from '@/core/auth/roles';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, type Actor } from '@/core/auth/guards';
import { notify } from '@/core/notifications/notify';
import { createSignedStorageObjectUrl } from '@/core/storage/signed-video';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { env } from '@/env';
import { humanRevisionLimit, humanRevisionsUsed, storedVerdict } from '@/core/verification/loop';
import { shotActionFr, storedApproval } from './keyframe-approval';
import { clipRedoCostUsd, decorateReviewRequests } from './review-details';
import { effectiveShotDraft, type ReviewRequest } from '@/core/verification/loop';
import type { StoryboardShot } from '@/core/storyboard';
import { clipBoardMeasures, isClipActive, isClipApproved, storedClipApproval } from './clip-approval';

export type ClipBoard = { requestedAt: string; releasedAt?: string; durationSeconds: number; shots: Array<ReviewRequest & { action: string; active: boolean; approved: boolean; colour: 'green' | 'orange' | 'red'; canRevise: boolean }> };
export type ClipGateShot = { shot_number: number; title?: string | null; duration_seconds: number; status: string; raw_path: string | null; video_quality_status?: string; video_quality?: unknown; verification_history?: unknown; revised_draft?: unknown };

export async function authorizeClipBoard(actor: Actor, versionId: string) {
  const admin = createStorageAdminClient();
  const { data: version, error } = await admin.from('video_versions').select('id,video_id,status,brief_json,model:ai_models!inner(price_usd_per_second),video:videos!inner(user_id)').eq('id', versionId).maybeSingle();
  const video = Array.isArray(version?.video) ? version.video[0] : version?.video;
  if (error || !version || !video || video.user_id !== actor.id && !hasAdminRights(actor)) throw new HttpError(404, 'Cette version est introuvable.');
  const brief = version.brief_json as Record<string, unknown>;
  const state = storedClipApproval(brief);
  if (version.status !== 'generating' || !state.required || !state.requestedAt || state.approvedAt) throw new HttpError(409, 'Ces clips n’attendent plus de validation.');
  return { admin, version, brief };
}

export async function clipApprovalGate(input: { admin: SupabaseClient; version: { id: string; video_id: string }; userId: string; brief: Record<string, unknown>; shots: ClipGateShot[]; now?: number }) {
  if (!storedApproval(input.brief).required) return null;
  let state = storedClipApproval(input.brief);
  if (state.approvedAt) return null;
  const now = input.now ?? Date.now();
  const at = new Date(now).toISOString();
  if (!state.requestedAt) {
    state = { required: true, requestedAt: at };
    // Existing timestamp claim serializes refreshes; the mutation/claim RPC serializes user decisions with editing.
    input.brief.clipApproval = state;
    const { error } = await input.admin.rpc('rimco_patch_version_brief', { p_version_id: input.version.id, p_patch: { clipApproval: state } });
    if (error) throw new HttpError(503, 'Impossible d’ouvrir la validation des clips.');
    await notify(input.admin, { userId: input.userId, versionId: input.version.id, type: 'action_required', message: `${input.shots.length} clips à valider avant le montage.`, dedupeKey: 'clip_approval' });
  }
  const age = now - Date.parse(state.requestedAt!);
  if (age >= 24 * 3_600_000 && !state.remindedAt) {
    state.remindedAt = at;
    await notify(input.admin, { userId: input.userId, versionId: input.version.id, type: 'action_required', message: 'Rappel : vos clips attendent votre validation avant le montage.', dedupeKey: 'clip_approval_24h' });
  }
  if (age >= 48 * 3_600_000 && !state.releasedAt) {
    // Generation costs were settled before this gate. Only unused corrections may be released, never clips paid.
    const { data: released, error } = await input.admin.rpc('rimco_clip_review', { p_version_id: input.version.id, p_action: 'release_unused' });
    if (error) throw new HttpError(503, 'Impossible de libérer les réservations de modification.');
    if (released?.changed) {
      state.releasedAt = at;
      await notify(input.admin, { userId: input.userId, versionId: input.version.id, type: 'action_required', message: 'Vos clips sont conservés. Le montage reste possible ; toute modification réservera à nouveau son coût.', dedupeKey: 'clip_approval_48h' });
    }
  }
  input.brief.clipApproval = { ...state, ...clipBoardMeasures(input.shots) };
  const { error: saveError } = await input.admin.rpc('rimco_patch_version_brief', { p_version_id: input.version.id, p_patch: { clipApproval: input.brief.clipApproval } });
  if (saveError) throw new HttpError(503, 'Impossible d’enregistrer l’attente de validation des clips.');
  const active = input.shots.filter((shot) => isClipActive(shot.verification_history));
  if (active.length && active.every((shot) => shot.status === 'ready' && isClipApproved(shot.verification_history))) {
    const { data, error } = await input.admin.rpc('rimco_clip_review', { p_version_id: input.version.id, p_action: 'claim' });
    if (error) throw new HttpError(503, 'Impossible de réserver le lancement unique du montage. Vérifiez que la migration 0038 est appliquée.');
    if (data?.changed) {
      await input.admin.from('notifications').update({ read_at: at }).eq('version_id', input.version.id).eq('type', 'action_required').is('read_at', null);
      return null;
    }
    if (data?.status === 'generating') return { id: input.version.id, status: 'generating' as const, processingStage: 'clip_approval' as const, nextPollInSeconds: 10 };
    return { id: input.version.id, status: 'postprocessing' as const, processingStage: 'postprocessing' as const };
  }
  return { id: input.version.id, status: 'generating' as const, processingStage: 'clip_approval' as const, nextPollInSeconds: 60 };
}

/** Signed previews and role-filtered correction prices. Never expose raw USD to a collaborator. */
export async function buildClipBoard(admin: SupabaseClient, input: { brief: Record<string, unknown>; shots: ClipGateShot[]; role: Actor['role']; priceUsdPerSecond: number }): Promise<ClipBoard> {
  const drafts = Array.isArray(input.brief.storyboard) ? input.brief.storyboard as StoryboardShot[] : [];
  const requests = await Promise.all(input.shots.map(async (shot): Promise<ReviewRequest> => {
    const verdict = storedVerdict(shot.video_quality);
    const remaining = Math.max(0, humanRevisionLimit(input.brief, 'video') - humanRevisionsUsed(shot.verification_history, 'video'));
    return { shotNumber: shot.shot_number, title: shot.title ?? `Plan ${shot.shot_number}`, stage: 'video', issues: verdict?.issues ?? [], codes: verdict?.codes, canRetry: false, revisionsLeft: remaining, url: shot.raw_path ? await createSignedStorageObjectUrl((path, expiresIn) => admin.storage.from('videos').createSignedUrl(path, expiresIn), 'videos', shot.raw_path) : null,
      ...(remaining ? { clipRedoUsd: { clip: clipRedoCostUsd({ brief: input.brief, priceUsdPerSecond: input.priceUsdPerSecond, durationS: shot.duration_seconds, scope: 'clip' }), full: clipRedoCostUsd({ brief: input.brief, priceUsdPerSecond: input.priceUsdPerSecond, durationS: shot.duration_seconds, scope: 'full' }) } } : {}) };
  }));
  const decorated = await decorateReviewRequests(admin, { items: requests, brief: input.brief, role: input.role, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA });
  return { requestedAt: storedClipApproval(input.brief).requestedAt!, releasedAt: storedClipApproval(input.brief).releasedAt, durationSeconds: input.shots.filter((shot) => isClipActive(shot.verification_history)).reduce((sum, shot) => sum + shot.duration_seconds, 0) + 2,
    shots: decorated.map((item) => { const shot = input.shots.find((shot) => shot.shot_number === item.shotNumber)!; const verdict = storedVerdict(shot.video_quality); const draft = effectiveShotDraft(drafts[shot.shot_number - 1], shot.revised_draft); return { ...item, action: draft ? shotActionFr(draft) : `${shot.duration_seconds} s`, active: isClipActive(shot.verification_history), approved: isClipApproved(shot.verification_history), colour: !verdict?.approved ? 'red' : verdict.issues.length || verdict.readableText || (shot.video_quality as { warning?: boolean } | null)?.warning ? 'orange' : 'green', canRevise: (item.revisionsLeft ?? 0) > 0 }; }) };
}
