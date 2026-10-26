import { describe, expect, it } from 'vitest';
import { costPlanForBrief, nominalVideoCostUsd, storedCostPlan, videoCostCapCheck, worstCaseVideoCostUsd, type VideoCostInput } from '@/core/billing/video-cap';
import { KEYFRAME_QUALITY_RESERVE_USD, KEYFRAME_VIDEO_PRICES_USD_PER_SECOND } from '@/core/providers/fal-keyframes';
import { renderSettingsFor } from '@/core/versions/render-settings';

/** Same inputs as the launch (storyboard-live): every tier goes through keyframes and the clip judge. */
const input = (tier: 'standard' | 'pro' | 'premium', seconds: number, shots: number, pricePerSecond: number): VideoCostInput => ({
  generatedSeconds: seconds, videoPriceUsdPerSecond: pricePerSecond, shotCount: shots,
  keyframeImageCostUsd: renderSettingsFor(tier).keyframeImageCostUsd, keyframeQualityCostUsd: KEYFRAME_QUALITY_RESERVE_USD, videoQualityCostUsd: KEYFRAME_QUALITY_RESERVE_USD,
  storyboardCostUsd: 0, endFrameCount: 0, endFrameCostUsd: 0,
});
const standard = input('standard', 20, 4, KEYFRAME_VIDEO_PRICES_USD_PER_SECOND.wan720p);
const pro = input('pro', 15, 3, KEYFRAME_VIDEO_PRICES_USD_PER_SECOND.kling);
const premium = input('premium', 20, 4, KEYFRAME_VIDEO_PRICES_USD_PER_SECOND.seedance);

describe('coût maximal d’une vidéo, relances automatiques comprises (26/10)', () => {
  it('Standard 20 s : 4 plans Wan, images clés 1K', () => {
    expect(nominalVideoCostUsd(standard).totalUsd).toBe(3.12);
    // Clips ×2, 3 images and 3 checks per shot, 2 clip checks per shot, 2 director corrections at 0,05 $ per shot.
    expect(worstCaseVideoCostUsd(standard)).toEqual({ videoUsd: 4, keyframesUsd: 0.96, qualityUsd: 2, revisionsUsd: 0.4, storyboardUsd: 0, totalUsd: 7.36 });
  });

  it('Pro 15 s : 3 plans Kling de 5 s', () => {
    expect(nominalVideoCostUsd(pro).totalUsd).toBe(2.52);
    expect(worstCaseVideoCostUsd(pro)).toEqual({ videoUsd: 3.36, keyframesUsd: 0.72, qualityUsd: 1.5, revisionsUsd: 0.3, storyboardUsd: 0, totalUsd: 5.88 });
  });

  it('Premium 20 s : 4 plans Seedance, images clés 2K', () => {
    expect(nominalVideoCostUsd(premium).totalUsd).toBe(10.74);
    expect(worstCaseVideoCostUsd(premium)).toEqual({ videoUsd: 18.92, keyframesUsd: 1.44, qualityUsd: 2, revisionsUsd: 0.4, storyboardUsd: 0, totalUsd: 22.76 });
  });

  it('compte les images de fin et le storyboard une fois, sans correction du réalisateur hors images clés', () => {
    const withExtras = { ...premium, storyboardCostUsd: 0.02, endFrameCount: 2, endFrameCostUsd: 0.22 };
    expect(worstCaseVideoCostUsd(withExtras).totalUsd).toBe(23.22);
    expect(worstCaseVideoCostUsd({ ...standard, keyframeImageCostUsd: 0, keyframeQualityCostUsd: 0 }).revisionsUsd).toBe(0);
  });

  it('plafond : mode nominal (défaut, comportement actuel) ou pire cas ; aucun plafond s’il n’est pas fixé', () => {
    const plan = { nominal: nominalVideoCostUsd(premium), worstCase: worstCaseVideoCostUsd(premium) };
    expect(videoCostCapCheck(plan, 15, 'nominal')).toEqual({ ok: true });
    const refused = videoCostCapCheck(plan, 15, 'worst_case');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toBe('Cette configuration dépasse le plafond de coût par vidéo (22.76 $ au maximum, toutes les relances automatiques comprises, pour 15.00 $ autorisés). Réduisez la durée ou choisissez un autre niveau.');
    expect(videoCostCapCheck(plan, 10, 'nominal')).toMatchObject({ ok: false });
    expect(videoCostCapCheck(plan, undefined, 'worst_case')).toEqual({ ok: true });
  });

  it('les deux montants sont figés dans brief_json.costPlanUsd, le nominal restant au format d’avant', () => {
    const plan = { nominal: nominalVideoCostUsd(premium), worstCase: worstCaseVideoCostUsd(premium), capMode: 'nominal' as const, capUsd: null };
    const stored = JSON.parse(JSON.stringify({ costPlanUsd: costPlanForBrief(plan) })) as Record<string, unknown>;
    expect(stored.costPlanUsd).toMatchObject({ totalUsd: 10.74, capUsd: null, capMode: 'nominal', worstCase: { totalUsd: 22.76 } });
    expect(storedCostPlan(stored)).toEqual({ nominalUsd: 10.74, worstCaseUsd: 22.76 });
    // Versions created before 26/10: nominal only.
    expect(storedCostPlan({ costPlanUsd: { ...nominalVideoCostUsd(premium), capUsd: null } })).toEqual({ nominalUsd: 10.74, worstCaseUsd: null });
    expect(storedCostPlan({})).toBeNull();
  });
});
