/**
 * Keyframe resolution per tier, frozen in `brief_json.renderSettings` at creation so that every submission and every
 * cost entry of a version uses the same resolution and the same unit cost (repris du 24/10, sans le 1080p).
 *
 * Price read on the fal page of fal-ai/nano-banana-2/edit on 24/10/2026: 0,08 USD per image;
 * « 2K and 4K outputs will be charged at 1.5 times and 2 times the standard rate ».
 */
export type KeyframeResolution = '1K' | '2K';

export const KEYFRAME_IMAGE_COST_BY_RESOLUTION: Record<KeyframeResolution, number> = { '1K': 0.08, '2K': 0.12 };

export type RenderSettings = { keyframeResolution: KeyframeResolution; keyframeImageCostUsd: number };

/** Premium keyframes in 2K: the base of every shot, the sharpest gain for the lowest cost (+0,04 USD per image). */
export function renderSettingsFor(tier: 'standard' | 'pro' | 'premium'): RenderSettings {
  const keyframeResolution: KeyframeResolution = tier === 'premium' ? '2K' : '1K';
  return { keyframeResolution, keyframeImageCostUsd: KEYFRAME_IMAGE_COST_BY_RESOLUTION[keyframeResolution] };
}

/** Settings of an existing version; versions made before keep 1K at 0,08 USD. */
export function storedRenderSettings(brief: Record<string, unknown>): RenderSettings {
  const stored = brief.renderSettings && typeof brief.renderSettings === 'object' ? brief.renderSettings as Partial<RenderSettings> : {};
  const keyframeResolution: KeyframeResolution = stored.keyframeResolution === '2K' ? '2K' : '1K';
  const cost = Number(stored.keyframeImageCostUsd);
  return { keyframeResolution, keyframeImageCostUsd: Number.isFinite(cost) && cost > 0 ? cost : KEYFRAME_IMAGE_COST_BY_RESOLUTION[keyframeResolution] };
}
