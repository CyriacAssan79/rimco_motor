/**
 * Étape 4 (24/10/2026) · output quality per tier, frozen in `brief_json.renderSettings` at creation so that every
 * submission and every cost entry of a version uses the same resolution and the same unit cost.
 *
 * Prices read on the fal model pages on 24/10/2026:
 * - fal-ai/nano-banana-2/edit: 0,08 USD per image; « 2K and 4K outputs will be charged at 1.5 times and 2 times ».
 * - bytedance/seedance-2.5/image-to-video: 0,4730 USD/s in 720p, 1,164 USD/s in 1080p.
 *   TODO(verify-fal): the page's schema lists 1080p but its text says only 480p and 720p; check with one paid call
 *   before setting PREMIUM_VIDEO_RESOLUTION=1080p.
 */
export type KeyframeResolution = '1K' | '2K';
export type VideoResolution = '720p' | '1080p';

export const KEYFRAME_IMAGE_COST_BY_RESOLUTION: Record<KeyframeResolution, number> = { '1K': 0.08, '2K': 0.12 };
export const SEEDANCE_PRICE_USD_PER_SECOND: Record<VideoResolution, number> = { '720p': 0.473, '1080p': 1.164 };

export type RenderSettings = {
  keyframeResolution: KeyframeResolution;
  keyframeImageCostUsd: number;
  videoResolution: VideoResolution;
  videoPriceUsdPerSecond: number;
};

/** Premium gets 2K keyframes (+0,04 USD per image) and, only when enabled, 1080p Seedance clips. */
export function renderSettingsFor(input: { tier: 'standard' | 'pro' | 'premium'; adapterFamily: string; modelPriceUsdPerSecond: number; premiumVideoResolution: VideoResolution }): RenderSettings {
  const premium = input.tier === 'premium';
  const keyframeResolution: KeyframeResolution = premium ? '2K' : '1K';
  const videoResolution: VideoResolution = premium && input.adapterFamily === 'seedance' ? input.premiumVideoResolution : '720p';
  return {
    keyframeResolution,
    keyframeImageCostUsd: KEYFRAME_IMAGE_COST_BY_RESOLUTION[keyframeResolution],
    videoResolution,
    videoPriceUsdPerSecond: videoResolution === '1080p' ? SEEDANCE_PRICE_USD_PER_SECOND['1080p'] : input.modelPriceUsdPerSecond,
  };
}

/** Settings of an existing version; versions made before step 4 keep 1K, 720p and the model's price. */
export function storedRenderSettings(brief: Record<string, unknown>, modelPriceUsdPerSecond: number): RenderSettings {
  const stored = brief.renderSettings && typeof brief.renderSettings === 'object' ? brief.renderSettings as Partial<RenderSettings> : {};
  const keyframeResolution: KeyframeResolution = stored.keyframeResolution === '2K' ? '2K' : '1K';
  const videoResolution: VideoResolution = stored.videoResolution === '1080p' ? '1080p' : '720p';
  const price = Number(stored.videoPriceUsdPerSecond);
  const cost = Number(stored.keyframeImageCostUsd);
  return {
    keyframeResolution,
    keyframeImageCostUsd: Number.isFinite(cost) && cost > 0 ? cost : KEYFRAME_IMAGE_COST_BY_RESOLUTION[keyframeResolution],
    videoResolution,
    videoPriceUsdPerSecond: Number.isFinite(price) && price > 0 ? price : modelPriceUsdPerSecond,
  };
}
