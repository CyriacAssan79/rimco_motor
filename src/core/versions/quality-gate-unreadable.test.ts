import { describe, expect, it } from 'vitest';
import { KEYFRAME_QUALITY_RESERVE_USD, parseKeyframeQuality, VISION_MAX_OUTPUT_TOKENS } from '@/core/providers/fal-keyframes';
import { collectQualityWarnings, UNREADABLE_VERDICT_WARNING, unreadableVerdictQuality } from '@/core/versions/quality-gate';

describe('juge illisible (essai du 24/10)', () => {
  it('reconnaît comme illisible le verdict coupé reçu de fal', () => {
    // Real output of the 24/10 clip check: the 1 500-token budget ended inside the JSON.
    expect(parseKeyframeQuality('{"approved":true,"issues":[],"reason":"Tank 300 gris conforme, pont correct, voiture immobile, contact pneus-route correct.","readable')).toBeNull();
  });

  it('laisse au juge un budget de réponse suffisant et réserve son vrai coût', () => {
    expect(VISION_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(4_000);
    expect(KEYFRAME_QUALITY_RESERVE_USD).toBeGreaterThanOrEqual(0.1);
  });

  it('garde le plan avec un avertissement visible par le valideur', () => {
    const quality = unreadableVerdictQuality();
    expect(quality.approved).toBe(true);
    expect(collectQualityWarnings([{ shot_number: 4, title: 'Le Tank 300 en majesté', video_quality: quality }])).toEqual([
      { shotNumber: 4, title: 'Le Tank 300 en majesté', stage: 'video', issues: [UNREADABLE_VERDICT_WARNING] },
    ]);
  });
});
