import { describe, expect, it } from 'vitest';
import { checkVideoCostCap, nominalVideoCostUsd } from './video-cap';

describe('plafond de coût par vidéo', () => {
  it('additionne clips, images-clés, contrôles et storyboard', () => {
    const cost = nominalVideoCostUsd({ generatedSeconds: 20, videoPriceUsdPerSecond: 0.473, shotCount: 4, keyframeImageCostUsd: 0.08, keyframeQualityCostUsd: 0.05, videoQualityCostUsd: 0.05, storyboardCostUsd: 0.03 });
    expect(cost.videoUsd).toBeCloseTo(9.46);
    expect(cost.keyframesUsd).toBeCloseTo(0.32);
    expect(cost.qualityUsd).toBeCloseTo(0.4);
    expect(cost.totalUsd).toBeCloseTo(10.21);
    expect(checkVideoCostCap(cost, 15)).toEqual({ ok: true });
  });

  it('refuse avant tout appel payant quand le coût nominal dépasse le plafond', () => {
    const cost = nominalVideoCostUsd({ generatedSeconds: 30, videoPriceUsdPerSecond: 0.473, shotCount: 6, keyframeImageCostUsd: 0.08, keyframeQualityCostUsd: 0.05, videoQualityCostUsd: 0.05, storyboardCostUsd: 0 });
    const result = checkVideoCostCap(cost, 15);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('plafond de coût par vidéo');
  });

  it('rejette des paramètres incohérents', () => {
    expect(() => nominalVideoCostUsd({ generatedSeconds: -1, videoPriceUsdPerSecond: 0.1, shotCount: 1, keyframeImageCostUsd: 0, keyframeQualityCostUsd: 0, videoQualityCostUsd: 0, storyboardCostUsd: 0 })).toThrow();
    expect(() => checkVideoCostCap({ videoUsd: 0, keyframesUsd: 0, qualityUsd: 0, storyboardUsd: 0, totalUsd: 0 }, 0)).toThrow();
  });
});
