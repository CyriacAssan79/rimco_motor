import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProcessingMetrics } from './processing-metrics';
import { storedApproval } from './keyframe-approval';
import { buildProgress, estimateSteps, humanWaitIntervals, PROGRESS_STEPS, stepDurations, type GenerationProgress, type ProgressEstimate, type ProgressShotRow, type ProgressStep, type StepSeconds } from './progress';

const HISTORY_SIZE = 20;
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; samples: StepSeconds[] }>();

type HistoryRow = { metrics: ProcessingMetrics | null; quality: boolean | null; video_shots: ProgressShotRow[] | null };

/**
 * Step durations of the last 20 ready videos of the same tier and number of shots (human waits removed).
 * Simulations are left out; the result is kept 10 minutes per tier and number of shots.
 */
async function historySamples(admin: SupabaseClient, tier: string, shotCount: number, hasQuality: boolean): Promise<StepSeconds[]> {
  const key = `${tier}:${shotCount}:${hasQuality}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.samples;
  const { data, error } = await admin.from('video_versions')
    .select('metrics:brief_json->processingMetrics,quality:brief_json->videoQualityMode,video_shots(shot_number,verification_history)')
    .eq('status', 'ready')
    .eq('brief_json->>generationTier', tier)
    .not('brief_json->processingMetrics->>postproductionCompletedAt', 'is', null)
    // A storyboard version has no request ID of its own: NULL must stay in (NOT LIKE alone would drop it).
    .or('provider_request_id.is.null,provider_request_id.not.like.mock:*')
    .order('created_at', { ascending: false })
    .limit(HISTORY_SIZE * 3);
  if (error) return cached?.samples ?? [];
  const samples = ((data ?? []) as unknown as HistoryRow[])
    .filter((row) => (row.video_shots ?? []).length === shotCount && (row.quality === true) === hasQuality && row.metrics)
    .slice(0, HISTORY_SIZE)
    .map((row) => stepDurations(row.metrics!, { hasQuality, waits: humanWaitIntervals(row.video_shots ?? [], Date.now()) }));
  cache.set(key, { at: Date.now(), samples });
  return samples;
}

export async function loadEstimate(admin: SupabaseClient, input: { tier: string | null | undefined; shotCount: number; steps: ProgressStep[]; hasQuality: boolean }): Promise<ProgressEstimate> {
  const samples = input.tier ? await historySamples(admin, input.tier, input.shotCount, input.hasQuality).catch(() => []) : [];
  return estimateSteps({ samples, tier: input.tier, shotCount: input.shotCount, steps: input.steps });
}

/** Progress of one version as sent by /api/versions and /refresh; the estimate only while it is running. */
export async function versionProgress(admin: SupabaseClient, input: { status: string; brief: Record<string, unknown>; shots: ProgressShotRow[] }): Promise<GenerationProgress> {
  const metrics = input.brief.processingMetrics && typeof input.brief.processingMetrics === 'object' ? input.brief.processingMetrics as ProcessingMetrics : {};
  const hasQuality = input.brief.videoQualityMode === true;
  const hasKeyframes = input.brief.keyframeMode === true;
  const now = Date.now();
  const base = buildProgress({ status: input.status, metrics, hasKeyframes, hasQuality, shots: input.shots, estimate: null, now, approval: storedApproval(input.brief) });
  if (!['queued', 'generating', 'postprocessing'].includes(input.status)) return base;
  const shotCount = input.shots.length || (Array.isArray(input.brief.storyboard) ? input.brief.storyboard.length : 1);
  const tier = typeof input.brief.generationTier === 'string' ? input.brief.generationTier : null;
  const estimate = await loadEstimate(admin, { tier, shotCount, steps: base.steps.filter((step) => PROGRESS_STEPS.includes(step)), hasQuality });
  return { ...base, estimate };
}
