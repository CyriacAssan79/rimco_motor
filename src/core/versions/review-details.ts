import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '@/core/auth/guards';
import { findCuratedLocation } from '@/core/assets/location-catalog';
import { calculateClientPriceFcfa } from '@/core/pricing';
import { KEYFRAME_QUALITY_RESERVE_USD } from '@/core/providers/fal-keyframes';
import { SHOT_REVISION_RESERVE_USD } from '@/core/providers/fal-shot-revision';
import { createSignedStorageObjectUrl } from '@/core/storage/signed-video';
import type { ReviewRequest } from '@/core/verification/loop';
import { storedRenderSettings } from './render-settings';
import { revisionPriceFcfa } from '@/core/billing/settings';

export { revisionPriceFcfa };

/** A relaunch: the director's correction, a new keyframe and its check (≈ 20 s + 40 s + 30 s in the trials). */
export const RELAUNCH_MINUTES = 2;

/** What a keyframe correction reserves: the director's correction, a new keyframe and its check (USD). */
export function relaunchCostUsd(brief: Record<string, unknown>) {
  return Math.round((SHOT_REVISION_RESERVE_USD + storedRenderSettings(brief).keyframeImageCostUsd + KEYFRAME_QUALITY_RESERVE_USD) * 100) / 100;
}

/**
 * What the user sees for a modification (27/10): when it is included, the indicative cost is shown struck through
 * with « (non facturé) » (billed: false); when KÔMIAN has set a price, that price (billed: true). Dollars go to the
 * KÔMIAN operator only — the filter is here, on the server.
 */
export function modificationCost(input: { usd: number; brief: Record<string, unknown>; role: Role; usdToEur: number; eurToFcfa: number; minutes: number }) {
  const price = revisionPriceFcfa(input.brief);
  return {
    fcfa: price > 0 ? price : calculateClientPriceFcfa(input.usd, input.usdToEur, input.eurToFcfa),
    billed: price > 0,
    minutes: input.minutes,
    ...(input.role === 'operateur' ? { usd: input.usd } : {}),
  };
}

/** Cost of a keyframe correction (« Modifier ce plan »). */
export function relaunchCost(input: { brief: Record<string, unknown>; role: Role; usdToEur: number; eurToFcfa: number }) {
  return modificationCost({ ...input, usd: relaunchCostUsd(input.brief), minutes: RELAUNCH_MINUTES });
}

/** A redone clip: director ≈ 20 s, clip ≈ 2-3 min, check ≈ 30 s; with a new keyframe first, ≈ 1 min more. */
export const CLIP_REDO_MINUTES = 4;
export const FULL_REDO_MINUTES = 5;

/**
 * What a refused clip's redo reserves (USD): the director's correction, the clip at the shot engine price and its check;
 * « Refaire l’image clé puis la vidéo » adds a new keyframe and its check.
 */
export function clipRedoCostUsd(input: { brief: Record<string, unknown>; priceUsdPerSecond: number; durationS: number; scope: 'clip' | 'full' }) {
  const clip = SHOT_REVISION_RESERVE_USD + input.priceUsdPerSecond * input.durationS + KEYFRAME_QUALITY_RESERVE_USD;
  const keyframe = input.scope === 'full' ? storedRenderSettings(input.brief).keyframeImageCostUsd + KEYFRAME_QUALITY_RESERVE_USD : 0;
  return Math.round((clip + keyframe) * 100) / 100;
}

type ShotDraftRefs = { vehiclePhotoId?: unknown; locationPhotoId?: unknown };

/** Vehicle and place photos of each shot waiting for a decision, to compare with the refused image (signed 1 h). */
export async function reviewReferences(admin: SupabaseClient, brief: Record<string, unknown>, shotNumbers: number[]) {
  const drafts = Array.isArray(brief.storyboard) ? brief.storyboard as ShotDraftRefs[] : [];
  const refs = new Map(shotNumbers.map((number) => {
    const draft = drafts[number - 1] ?? {};
    return [number, { vehicleId: typeof draft.vehiclePhotoId === 'string' ? draft.vehiclePhotoId : null, placeId: typeof draft.locationPhotoId === 'string' ? draft.locationPhotoId : null }];
  }));
  const uploadedIds = [...new Set([...refs.values()].flatMap((ref) => [ref.vehicleId, ref.placeId]).filter((id): id is string => Boolean(id) && !findCuratedLocation(id!)))];
  const { data: assets } = uploadedIds.length ? await admin.from('assets').select('id,path').in('id', uploadedIds) : { data: [] };
  const urls = new Map<string, string | null>(await Promise.all((assets ?? []).map(async (asset) => [asset.id as string,
    await createSignedStorageObjectUrl((path, expiresIn) => admin.storage.from('assets').createSignedUrl(path, expiresIn), 'assets', asset.path as string)] as const)));
  const urlOf = (id: string | null) => !id ? null : findCuratedLocation(id)?.path ?? urls.get(id) ?? null;
  return new Map([...refs].map(([number, ref]) => [number, { vehicleUrl: urlOf(ref.vehicleId), placeUrl: urlOf(ref.placeId) }]));
}

/** Requests in the order of the film, with the relaunch cost (by role) and the reference photos. */
export async function decorateReviewRequests(admin: SupabaseClient, input: { items: ReviewRequest[]; brief: Record<string, unknown>; role: Role; usdToEur: number; eurToFcfa: number }): Promise<ReviewRequest[]> {
  if (!input.items.length) return input.items;
  const sorted = [...input.items].sort((left, right) => left.shotNumber - right.shotNumber || (left.stage === 'keyframe' ? -1 : 1));
  const references = await reviewReferences(admin, input.brief, sorted.map((item) => item.shotNumber)).catch(() => new Map());
  const cost = relaunchCost(input);
  const inFcfa = (usd: number | null, minutes: number) => usd === null ? null : modificationCost({ usd, brief: input.brief, role: input.role, usdToEur: input.usdToEur, eurToFcfa: input.eurToFcfa, minutes });
  return sorted.map(({ clipRedoUsd, ...item }) => ({
    ...item,
    ...(item.canRetry && item.stage === 'keyframe' ? { cost } : {}),
    ...(clipRedoUsd ? { clipOptions: { clip: inFcfa(clipRedoUsd.clip, CLIP_REDO_MINUTES), full: inFcfa(clipRedoUsd.full, FULL_REDO_MINUTES) } } : {}),
    references: references.get(item.shotNumber) ?? { vehicleUrl: null, placeUrl: null },
  }));
}

/** Keyframe board: the reference photos of each shot, and the cost of « Modifier ce plan » (FCFA; USD for the KÔMIAN operator). */
export async function decorateKeyframeBoard<T extends { shots: Array<{ shotNumber: number; canRevise: boolean }> }>(admin: SupabaseClient, input: { board: T; brief: Record<string, unknown>; role: Role; usdToEur: number; eurToFcfa: number }) {
  const references = await reviewReferences(admin, input.brief, input.board.shots.map((shot) => shot.shotNumber)).catch(() => new Map());
  const cost = relaunchCost(input);
  return { ...input.board, shots: input.board.shots.map((shot) => ({ ...shot, ...(shot.canRevise ? { cost } : {}), references: references.get(shot.shotNumber) ?? { vehicleUrl: null, placeUrl: null } })) };
}
