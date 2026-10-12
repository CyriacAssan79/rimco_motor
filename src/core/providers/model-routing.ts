export type GenerationTier = 'standard' | 'premium';
export type AdapterFamily = 'wan' | 'kling' | 'veo' | 'seedance';

export const MODEL_ENDPOINTS = {
  wan: 'alibaba/wan-3.0/image-to-video',
  kling: 'fal-ai/kling-video/o3/pro/image-to-video',
  veo: 'fal-ai/veo3.1/fast/image-to-video',
  seedance: 'bytedance/seedance-2.5/image-to-video',
} as const;

type Route = {
  tier: GenerationTier;
  adapterFamily: AdapterFamily;
  endpoint: string;
  outputDuration: number;
  sourceDuration: number;
};

const ROUTES: Record<GenerationTier, Record<number, Route>> = {
  standard: {
    5: { tier: 'standard', adapterFamily: 'wan', endpoint: MODEL_ENDPOINTS.wan, outputDuration: 5, sourceDuration: 5 },
    10: { tier: 'standard', adapterFamily: 'kling', endpoint: MODEL_ENDPOINTS.kling, outputDuration: 10, sourceDuration: 10 },
    15: { tier: 'standard', adapterFamily: 'kling', endpoint: MODEL_ENDPOINTS.kling, outputDuration: 15, sourceDuration: 15 },
  },
  premium: {
    5: { tier: 'premium', adapterFamily: 'veo', endpoint: MODEL_ENDPOINTS.veo, outputDuration: 5, sourceDuration: 6 },
    10: { tier: 'premium', adapterFamily: 'seedance', endpoint: MODEL_ENDPOINTS.seedance, outputDuration: 10, sourceDuration: 10 },
    15: { tier: 'premium', adapterFamily: 'seedance', endpoint: MODEL_ENDPOINTS.seedance, outputDuration: 15, sourceDuration: 15 },
    20: { tier: 'premium', adapterFamily: 'seedance', endpoint: MODEL_ENDPOINTS.seedance, outputDuration: 20, sourceDuration: 20 },
    30: { tier: 'premium', adapterFamily: 'seedance', endpoint: MODEL_ENDPOINTS.seedance, outputDuration: 30, sourceDuration: 30 },
  },
};

export function getRouteForGeneration(tier: GenerationTier, duration: number): Route | null {
  return ROUTES[tier][duration] ?? null;
}

export function getRoutedDurations(tier: GenerationTier): number[] {
  return Object.keys(ROUTES[tier]).map(Number);
}

export function isModelOnRoute(
  model: { tier: string; adapterFamily: string; endpoint: string; allowedDurations: number[] },
  tier: GenerationTier,
  duration: number,
): boolean {
  const route = getRouteForGeneration(tier, duration);
  const durationSupported = Boolean(route && (model.allowedDurations.includes(duration) || route.adapterFamily === 'veo' && model.allowedDurations.includes(route.sourceDuration)));
  return Boolean(route && model.tier === tier && model.adapterFamily === route.adapterFamily && model.endpoint === route.endpoint && durationSupported);
}
