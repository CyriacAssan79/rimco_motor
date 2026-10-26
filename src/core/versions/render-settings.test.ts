import { describe, expect, it } from 'vitest';
import { KEYFRAME_IMAGE_COST_BY_RESOLUTION, renderSettingsFor, storedRenderSettings } from './render-settings';

describe('images clés · résolution par niveau', () => {
  it('donne des images clés 2K au Premium, au prix fal de 1,5 fois le tarif', () => {
    expect(renderSettingsFor('premium')).toEqual({ keyframeResolution: '2K', keyframeImageCostUsd: 0.12 });
    expect(KEYFRAME_IMAGE_COST_BY_RESOLUTION['2K']).toBeCloseTo(KEYFRAME_IMAGE_COST_BY_RESOLUTION['1K'] * 1.5);
  });

  it('garde le 1K à 0,08 $ en Standard et en Pro', () => {
    expect(renderSettingsFor('standard')).toEqual({ keyframeResolution: '1K', keyframeImageCostUsd: 0.08 });
    expect(renderSettingsFor('pro')).toEqual({ keyframeResolution: '1K', keyframeImageCostUsd: 0.08 });
  });

  it('relit les réglages figés dans la version, et garde 1K pour les versions d’avant', () => {
    expect(storedRenderSettings({ renderSettings: { keyframeResolution: '2K', keyframeImageCostUsd: 0.12 } })).toEqual({ keyframeResolution: '2K', keyframeImageCostUsd: 0.12 });
    expect(storedRenderSettings({})).toEqual({ keyframeResolution: '1K', keyframeImageCostUsd: 0.08 });
    expect(storedRenderSettings({ renderSettings: { keyframeResolution: '4K', keyframeImageCostUsd: -1 } })).toEqual({ keyframeResolution: '1K', keyframeImageCostUsd: 0.08 });
  });
});
