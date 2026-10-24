import { describe, expect, it } from 'vitest';
import { buildKeyframeQualityPrompt, buildVideoQualityPrompt } from '@/core/providers/fal-keyframes';
import { KEEP_IDENTITY } from '@/core/prompts/rules';
import { KEYFRAME_IMAGE_COST_BY_RESOLUTION, renderSettingsFor, SEEDANCE_PRICE_USD_PER_SECOND, storedRenderSettings } from '@/core/versions/render-settings';

describe('étape 4 · rendu par niveau', () => {
  it('garde 1K et 720p au prix du modèle en Standard et en Pro', () => {
    expect(renderSettingsFor({ tier: 'standard', adapterFamily: 'wan', modelPriceUsdPerSecond: 0.1, premiumVideoResolution: '1080p' })).toEqual({ keyframeResolution: '1K', keyframeImageCostUsd: 0.08, videoResolution: '720p', videoPriceUsdPerSecond: 0.1 });
    expect(renderSettingsFor({ tier: 'pro', adapterFamily: 'kling', modelPriceUsdPerSecond: 0.112, premiumVideoResolution: '1080p' }).videoResolution).toBe('720p');
  });

  it('passe les images-clés Premium en 2K (×1,5) et laisse le 1080p désactivé par défaut', () => {
    const premium = renderSettingsFor({ tier: 'premium', adapterFamily: 'seedance', modelPriceUsdPerSecond: 0.473, premiumVideoResolution: '720p' });
    expect(premium).toEqual({ keyframeResolution: '2K', keyframeImageCostUsd: 0.12, videoResolution: '720p', videoPriceUsdPerSecond: 0.473 });
    expect(KEYFRAME_IMAGE_COST_BY_RESOLUTION['2K']).toBeCloseTo(KEYFRAME_IMAGE_COST_BY_RESOLUTION['1K'] * 1.5);
  });

  it('réserve et facture le vrai prix quand le 1080p Premium est activé', () => {
    const premium1080 = renderSettingsFor({ tier: 'premium', adapterFamily: 'seedance', modelPriceUsdPerSecond: 0.473, premiumVideoResolution: '1080p' });
    expect(premium1080.videoResolution).toBe('1080p');
    expect(premium1080.videoPriceUsdPerSecond).toBe(SEEDANCE_PRICE_USD_PER_SECOND['1080p']);
  });

  it('relit les réglages figés, et garde l’ancien comportement pour une version créée avant', () => {
    const stored = storedRenderSettings({ renderSettings: { keyframeResolution: '2K', keyframeImageCostUsd: 0.12, videoResolution: '1080p', videoPriceUsdPerSecond: 1.164 } }, 0.473);
    expect(stored).toEqual({ keyframeResolution: '2K', keyframeImageCostUsd: 0.12, videoResolution: '1080p', videoPriceUsdPerSecond: 1.164 });
    expect(storedRenderSettings({}, 0.473)).toEqual({ keyframeResolution: '1K', keyframeImageCostUsd: 0.08, videoResolution: '720p', videoPriceUsdPerSecond: 0.473 });
  });
});

describe('étape 4 · juges plus exigeants', () => {
  it('rend bloquante une teinte de carrosserie qui dérive, à tous les niveaux', () => {
    expect(KEEP_IDENTITY).toContain('warm light never changes the paint colour');
    const judge = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, motion: 'approach', durationS: 5 });
    expect(judge).toContain('a paint colour that drifts from the references, such as silver-grey turning beige under warm light');
    expect(judge).not.toContain('garbled letters');
  });

  it('vérifie le cadrage demandé dès l’image-clé', () => {
    const judge = buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, framing: 'Extreme wide shot, car small in frame' });
    expect(judge).toContain('The framing must match the shot (Extreme wide shot, car small in frame)');
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true })).not.toContain('framing must match');
  });

  it('en Premium, classe bloquants le véhicule coupé, le badge déformé et le cadrage contredit', () => {
    const video = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, motion: 'approach', durationS: 5, strict: true });
    expect(video).toContain('a vehicle cut by the frame edge; a badge or emblem with garbled letters; a framing that contradicts the shot');
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, strict: true })).toContain('Premium: a vehicle cut by the frame edge');
  });
});
